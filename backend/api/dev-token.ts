import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomBytes } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const BLINK_API_KEY = process.env.L402KIT_BLINK_API_KEY ?? "";
const BLINK_WALLET_ID = process.env.L402KIT_BLINK_WALLET_ID ?? "";

const PRO_PRICE_SATS = 9000; // ~$9
const PRO_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // GET /api/dev-token?address=you@yourdomain.com — get invoice or check access
  if (req.method === "GET") {
    const address = String(req.query.address ?? "");
    if (!address) return res.status(400).json({ error: "Missing address" });

    // Check if already has active pro access
    const existing = await getProAccess(address);
    if (existing) return res.json({ access: true, expiresAt: existing.expires_at });

    // Create invoice for pro access
    const preimage = randomBytes(32).toString("hex");
    const paymentHash = createHash("sha256").update(preimage, "hex").digest("hex");

    const gql = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": BLINK_API_KEY },
      body: JSON.stringify({
        query: `mutation CreateInvoice($input: LnInvoiceCreateInput!) {
          lnInvoiceCreate(input: $input) {
            invoice { paymentRequest paymentHash }
            errors { message }
          }
        }`,
        variables: { input: { walletId: BLINK_WALLET_ID, amount: PRO_PRICE_SATS, memo: `ShinyDapps Pro — ${address}` } },
      }),
    });

    const json = (await gql.json()) as { data: { lnInvoiceCreate: { invoice: { paymentRequest: string; paymentHash: string }; errors: { message: string }[] } } };
    const { invoice, errors } = json.data.lnInvoiceCreate;
    if (errors?.length) return res.status(500).json({ error: errors[0].message });

    const macaroon = Buffer.from(JSON.stringify({ hash: invoice.paymentHash, address, exp: Date.now() + 3600_000 })).toString("base64");

    return res.json({ access: false, priceSats: PRO_PRICE_SATS, invoice: invoice.paymentRequest, macaroon });
  }

  // POST /api/dev-token — verify payment and grant access
  if (req.method === "POST") {
    const { macaroon, preimage } = req.body ?? {};
    if (!macaroon || !preimage) return res.status(400).json({ error: "Missing macaroon or preimage" });

    try {
      const payload = JSON.parse(Buffer.from(macaroon, "base64").toString()) as { hash: string; address: string; exp: number };
      if (Date.now() > payload.exp) return res.status(401).json({ error: "Invoice expired" });

      const digest = createHash("sha256").update(preimage, "hex").digest("hex");
      if (digest !== payload.hash) return res.status(401).json({ error: "Invalid payment proof" });

      // Check Blink if payment actually arrived
      const paid = await checkBlinkPayment(payload.hash);
      if (!paid) return res.status(402).json({ error: "Payment not received yet" });

      // Save pro access to Supabase
      const expiresAt = new Date(Date.now() + PRO_DURATION_MS).toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/pro_access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "return=minimal" },
        body: JSON.stringify({ address: payload.address, expires_at: expiresAt, payment_hash: payload.hash }),
      });

      const sessionToken = createHash("sha256").update(`${payload.address}:${payload.hash}`).digest("hex");
      return res.json({ access: true, sessionToken, expiresAt });
    } catch {
      return res.status(400).json({ error: "Invalid token" });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}

async function getProAccess(address: string) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/pro_access?address=eq.${encodeURIComponent(address)}&expires_at=gt.${new Date().toISOString()}&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const rows = (await r.json()) as { expires_at: string }[];
  return rows[0] ?? null;
}

async function checkBlinkPayment(paymentHash: string): Promise<boolean> {
  const res = await fetch("https://api.blink.sv/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": BLINK_API_KEY },
    body: JSON.stringify({
      query: `query { me { defaultAccount { walletById(walletId: "${BLINK_WALLET_ID}") { transactions(first: 20) { edges { node { status initiationVia { ... on InitiationViaLn { paymentHash } } } } } } } } }`,
    }),
  });
  const json = (await res.json()) as { data?: { me?: { defaultAccount?: { walletById?: { transactions?: { edges?: { node: { status: string; initiationVia: { paymentHash?: string } } }[] } } } } } };
  const edges = json.data?.me?.defaultAccount?.walletById?.transactions?.edges ?? [];
  return edges.some(e => e.node.initiationVia?.paymentHash === paymentHash && e.node.status === "SUCCESS");
}
