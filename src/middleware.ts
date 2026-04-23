import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyToken } from "./verify";
import { checkAndMarkPreimage } from "./replay";
import { sendWebhook } from "./webhook";
import type { ReplayAdapter } from "./replay";
import type { L402Options, LightningProvider, Invoice } from "./types";
import { randomBytes, createHash } from "crypto";

const SHINYDAPPS_API = process.env.SHINYDAPPS_API_URL ?? "https://l402kit.vercel.app";
const SPLIT_SECRET = process.env.SPLIT_SECRET ?? "";

class ManagedProvider implements LightningProvider {
  constructor(private ownerAddress: string) {}

  async createInvoice(amountSats: number): Promise<Invoice> {
    const res = await fetch(`${SHINYDAPPS_API}/api/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountSats }),
    });
    if (!res.ok) throw new Error("ShinyDapps invoice creation failed");
    const data = (await res.json()) as { paymentRequest: string; paymentHash: string; macaroon: string };
    return { ...data, amountSats, expiresAt: Date.now() + 3600_000 };
  }

  async checkPayment(): Promise<boolean> { return false; }

  async sendSplit(amountSats: number): Promise<void> {
    const res = await fetch(`${SHINYDAPPS_API}/api/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-split-secret": SPLIT_SECRET },
      body: JSON.stringify({ amountSats, ownerAddress: this.ownerAddress }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`[l402] split API ${res.status}: ${body.slice(0, 120)}`);
    }
  }
}

export function l402(options: L402Options): RequestHandler {
  const { priceSats, ownerLightningAddress, supabaseUrl, supabaseKey, onPayment,
    webhookUrl, webhookSecret, replayAdapter } = options;
  const dbUrl = supabaseUrl ?? process.env.SUPABASE_URL ?? "";
  const dbKey = supabaseKey ?? process.env.SUPABASE_ANON_KEY ?? "";

  const managed = ownerLightningAddress ? new ManagedProvider(ownerLightningAddress) : null;
  const provider: LightningProvider = options.lightning ?? managed ?? (() => { throw new Error("No Lightning provider configured"); })();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers["authorization"] ?? "";

    // x402 (Coinbase) compatibility: accept X-Payment header as well
    const x402Header = req.headers["x-payment"] as string | undefined;
    const effectiveAuth = authHeader.startsWith("L402 ") ? authHeader
      : x402Header ? `L402 ${x402Header}` : authHeader;

    if (effectiveAuth.startsWith("L402 ")) {
      const token = effectiveAuth.slice(5);
      const valid = await verifyToken(token);

      if (valid) {
        const [macaroon, preimage] = token.split(":");

        // Layer 1: fast replay check via configured adapter (in-memory or Redis)
        const adapter: ReplayAdapter = replayAdapter ?? { check: checkAndMarkPreimage };
        const firstUse = await adapter.check(preimage);
        if (!firstUse) {
          res.status(401).json({ error: "Token already used" });
          return;
        }

        // Persist first — the DB unique constraint on preimage is the durable
        // replay guard (survives process restarts). 409 = already used.
        if (dbUrl && dbKey) {
          const logged = await logPayment(req.path, token, priceSats, ownerLightningAddress ?? "", dbUrl, dbKey);
          if (logged.replay) {
            res.status(401).json({ error: "Token already used" });
            return;
          }
        }

        // Fire split async but log errors — never silently drop failures
        if (managed) {
          managed.sendSplit(priceSats).catch(err => console.error("[l402] split failed:", String(err)));
        }
        if (onPayment) await onPayment({ macaroon, preimage }, priceSats);

        // Fire outgoing webhook (non-blocking, errors logged internally)
        if (webhookUrl && webhookSecret) {
          const decoded = JSON.parse(Buffer.from(macaroon, "base64").toString()) as { hash?: string };
          const paymentHash = decoded.hash ?? createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
          sendWebhook(webhookUrl, webhookSecret, {
            id: randomBytes(16).toString("hex"),
            type: "payment.received",
            created: Math.floor(Date.now() / 1000),
            data: {
              endpoint: req.path,
              amountSats: priceSats,
              preimage,
              paymentHash,
              ownerAddress: ownerLightningAddress ?? "",
            },
          });
        }

        return next();
      }
    }

    try {
      const invoice = await provider.createInvoice(priceSats);
      res.status(402).set(
        "WWW-Authenticate",
        `L402 macaroon="${invoice.macaroon}", invoice="${invoice.paymentRequest}"`
      );
      res.json({
        error: "Payment Required",
        priceSats,
        invoice: invoice.paymentRequest,
        macaroon: invoice.macaroon,
      });
    } catch (err) {
      next(err);
    }
  };
}

async function logPayment(
  endpoint: string, token: string, amountSats: number,
  ownerAddress: string, supabaseUrl: string, supabaseKey: string,
): Promise<{ ok: boolean; replay: boolean }> {
  const [, preimage] = token.split(":");
  // Store SHA-256(preimage) — the payment hash is already public in the BOLT11 invoice.
  // Never store the raw preimage: it is the 32-byte secret that proves payment.
  const paymentHash = createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
  const res = await fetch(`${supabaseUrl}/rest/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      endpoint,
      payment_hash: paymentHash,
      amount_sats: amountSats,
      owner_address: ownerAddress,
      paid_at: new Date().toISOString(),
    }),
  });
  // 409 Conflict = payment_hash already in DB (unique constraint) = replay attack
  if (res.status === 409) return { ok: false, replay: true };
  return { ok: res.ok, replay: false };
}
