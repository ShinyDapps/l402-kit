import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyToken } from "./verify";
import { checkAndMarkPreimage } from "./replay";
import type { L402Options } from "./types";

export function l402(options: L402Options): RequestHandler {
  const { priceSats, lightning, supabaseUrl, supabaseKey, onPayment } = options;
  const dbUrl = supabaseUrl ?? process.env.SUPABASE_URL ?? "";
  const dbKey = supabaseKey ?? process.env.SUPABASE_ANON_KEY ?? "";

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers["authorization"] ?? "";

    if (authHeader.startsWith("L402 ")) {
      const token = authHeader.slice(5);
      const valid = await verifyToken(token);

      if (valid) {
        const [macaroon, preimage] = token.split(":");

        // Anti-replay: each preimage can only be used once
        if (!checkAndMarkPreimage(preimage)) {
          res.status(401).json({ error: "Token already used" });
          return;
        }

        if (onPayment) {
          await onPayment({ macaroon, preimage }, priceSats);
        }
        if (dbUrl && dbKey) {
          logPayment(req.path, token, priceSats, dbUrl, dbKey).catch(() => {});
        }
        return next();
      }
    }

    try {
      const invoice = await lightning.createInvoice(priceSats);
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
  supabaseUrl: string, supabaseKey: string
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
    body: JSON.stringify({ endpoint, preimage, amount_sats: amountSats, paid_at: new Date().toISOString() }),
  });
}
