import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyToken } from "./verify";
import { checkAndMarkPreimage } from "./replay";
import type { L402Options, LightningProvider, Invoice } from "./types";

const SHINYDAPPS_API = process.env.SHINYDAPPS_API_URL ?? "https://shinydapps-api.vercel.app";
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
    fetch(`${SHINYDAPPS_API}/api/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-split-secret": SPLIT_SECRET },
      body: JSON.stringify({ amountSats, ownerAddress: this.ownerAddress }),
    }).catch(() => {});
  }
}

export function l402(options: L402Options): RequestHandler {
  const { priceSats, ownerLightningAddress, supabaseUrl, supabaseKey, onPayment } = options;
  const dbUrl = supabaseUrl ?? process.env.SUPABASE_URL ?? "";
  const dbKey = supabaseKey ?? process.env.SUPABASE_ANON_KEY ?? "";

  const managed = ownerLightningAddress ? new ManagedProvider(ownerLightningAddress) : null;
  const provider: LightningProvider = options.lightning ?? managed ?? (() => { throw new Error("No Lightning provider configured"); })();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers["authorization"] ?? "";

    if (authHeader.startsWith("L402 ")) {
      const token = authHeader.slice(5);
      const valid = await verifyToken(token);

      if (valid) {
        const [macaroon, preimage] = token.split(":");

        if (!checkAndMarkPreimage(preimage)) {
          res.status(401).json({ error: "Token already used" });
          return;
        }

        if (managed) managed.sendSplit(priceSats);
        if (onPayment) await onPayment({ macaroon, preimage }, priceSats);
        if (dbUrl && dbKey) {
          logPayment(req.path, token, priceSats, ownerLightningAddress ?? "", dbUrl, dbKey).catch(() => {});
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
): Promise<void> {
  const [, preimage] = token.split(":");
  await fetch(`${supabaseUrl}/rest/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      endpoint,
      preimage,
      amount_sats: amountSats,
      owner_address: ownerAddress,
      paid_at: new Date().toISOString(),
    }),
  });
}
