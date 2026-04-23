import type { Env } from "../worker";

const FEE_PERCENT = 0.003;
const MIN_SATS = 10;

async function fetchInvoiceFromAddress(address: string, amountSats: number): Promise<string> {
  const [user, domain] = address.split("@");
  const meta = await fetch(`https://${domain}/.well-known/lnurlp/${user}`).then(r => r.json()) as { callback: string };
  const pay = await fetch(`${meta.callback}?amount=${amountSats * 1000}`).then(r => r.json()) as { pr: string };
  return pay.pr;
}

export async function handleSplit(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("x-split-secret");
  if (!env.SPLIT_SECRET || authHeader !== env.SPLIT_SECRET) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { amountSats, ownerAddress } = body as { amountSats?: number; ownerAddress?: string };
  if (!amountSats || !ownerAddress) return json({ error: "Missing amountSats or ownerAddress" }, 400);
  if (amountSats < MIN_SATS) return json({ ok: true, skipped: true });

  const ownerSats = Math.floor(amountSats * (1 - FEE_PERCENT));

  try {
    const paymentRequest = await fetchInvoiceFromAddress(ownerAddress, ownerSats);
    // Split is done via Supabase Edge Function to keep BLINK_API_KEY out of Workers env
    const r = await fetch(`${env.SUPABASE_URL}/functions/v1/pay-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ paymentRequest }),
    });
    if (!r.ok) throw new Error(`Pay invoice HTTP ${r.status}`);
    return json({ ok: true, ownerSats });
  } catch (err) {
    return json({ error: "Split failed", detail: String(err) }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
