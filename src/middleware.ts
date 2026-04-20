import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyToken } from "./verify";
import { checkAndMarkPreimage } from "./replay";
import { splitPayment } from "./split";
import { BlinkProvider } from "./providers/blink";
import type { L402Options, LightningProvider } from "./types";

// ShinyDapps managed account — used when dev sets ownerLightningAddress
const MANAGED_API_KEY = process.env.L402KIT_BLINK_API_KEY ?? "";
const MANAGED_WALLET_ID = process.env.L402KIT_BLINK_WALLET_ID ?? "";

export function l402(options: L402Options): RequestHandler {
  const { priceSats, ownerLightningAddress, supabaseUrl, supabaseKey, onPayment } = options;
  const dbUrl = supabaseUrl ?? process.env.SUPABASE_URL ?? "";
  const dbKey = supabaseKey ?? process.env.SUPABASE_ANON_KEY ?? "";

  // Managed mode: dev sets ownerLightningAddress, we handle Lightning
  // Advanced mode: dev brings their own lightning provider
  const provider: LightningProvider = options.lightning ?? new BlinkProvider(
    (MANAGED_API_KEY || process.env.BLINK_API_KEY) ?? "",
    (MANAGED_WALLET_ID || process.env.BLINK_WALLET_ID) ?? "",
  );

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

        // Split payment: send owner share, keep 0.3% fee
        if (ownerLightningAddress && MANAGED_API_KEY && MANAGED_WALLET_ID) {
          splitPayment(priceSats, ownerLightningAddress, MANAGED_API_KEY, MANAGED_WALLET_ID)
            .catch(() => {});
        }

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
