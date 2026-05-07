import type { Env } from "../worker";
import { sweepTransitWallet } from "./sweep";

// Polled every 3s by the Pro modal to detect payment confirmation.
// 1. Checks pro_access (fast path — webhook already processed it)
// 2. Falls back to querying Blink API directly for invoice status (covers webhook delays)
export async function handleProPoll(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const paymentHash = url.searchParams.get("paymentHash") ?? "";
  const address = url.searchParams.get("address") ?? "";
  const tier = url.searchParams.get("tier") ?? "pro";

  if (!paymentHash || !address) return json({ paid: false, error: "Missing params" }, 400);

  // Fast path: check pro_access table (populated by webhook or previous poll)
  const accessRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pro_access?address=eq.${encodeURIComponent(address)}&expires_at=gt.${new Date().toISOString()}&limit=1&select=expires_at`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } },
  );
  const accessRows = await accessRes.json() as { expires_at: string }[];
  if (accessRows.length > 0) return json({ paid: true, expiresAt: accessRows[0].expires_at });

  // Fallback: verify directly via Blink API (handles webhook delays/misses)
  try {
    const blinkRes = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": env.BLINK_API_KEY_DEMO },
      body: JSON.stringify({
        query: `query InvoiceStatus($input: LnInvoicePaymentStatusInput!) {
          lnInvoicePaymentStatus(input: $input) { status }
        }`,
        variables: { input: { paymentRequest: "" } },
      }),
    });

    // Use wallet transactions to check if paymentHash was received
    const txRes = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": env.BLINK_API_KEY_DEMO },
      body: JSON.stringify({
        query: `{ me { defaultAccount { wallets { transactions(first: 10) {
          edges { node { initiationVia { ... on InitiationViaLn { paymentHash } } settlementAmount status } }
        } } } } }`,
      }),
    });

    if (txRes.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txData = await txRes.json() as any;
      const wallets: any[] = txData?.data?.me?.defaultAccount?.wallets ?? [];
      for (const wallet of wallets) {
        for (const edge of wallet.transactions?.edges ?? []) {
          const node = edge.node;
          if (node.initiationVia?.paymentHash === paymentHash && node.status === "SUCCESS" && node.settlementAmount > 0) {
            // Payment confirmed — create pro_access
            const days = tier === "lifetime" ? 36500 : 30;
            const expiresAt = new Date(Date.now() + days * 86400_000).toISOString();
            await fetch(`${env.SUPABASE_URL}/rest/v1/pro_access`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: env.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                Prefer: "return=minimal,resolution=ignore-duplicates",
              },
              body: JSON.stringify({ address, expires_at: expiresAt, payment_hash: paymentHash, tier }),
            });
            // Sweep +55 balance to OWNER_LIGHTNING_ADDRESS, keeping 1 sat
            sweepTransitWallet(env).catch(() => {});
            return json({ paid: true, expiresAt });
          }
        }
      }
    }
  } catch { /* fall through */ }

  return json({ paid: false });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
