import type { Env } from "../worker";

const SHINYDAPPS_ADDRESS = "shinydapps@blink.sv";
const MIN_SENDABLE = 1000;    // 1 sat in msats
const MAX_SENDABLE = 1_000_000_000; // 1000 sats

export async function handleLnurlp(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const name = url.pathname.split("/").pop() ?? "";
  const amount = url.searchParams.get("amount");

  if (name !== "shinydapps") return json({ status: "ERROR", reason: "User not found" }, 404);

  // Phase 1: metadata
  if (!amount) {
    const callbackUrl = `https://l402kit.com/.well-known/lnurlp/${name}`;
    return json({
      tag: "payRequest",
      callback: callbackUrl,
      minSendable: MIN_SENDABLE,
      maxSendable: MAX_SENDABLE,
      metadata: JSON.stringify([
        ["text/plain", "Pay shinydapps@l402kit.com"],
        ["text/identifier", "shinydapps@l402kit.com"],
      ]),
    });
  }

  // Phase 2: create invoice
  const msats = Number(amount);
  if (!msats || msats < MIN_SENDABLE || msats > MAX_SENDABLE) {
    return json({ status: "ERROR", reason: "Invalid amount" }, 400);
  }

  try {
    const r = await fetch(`${env.SUPABASE_URL}/functions/v1/create-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ amountSats: Math.floor(msats / 1000) }),
    });
    if (!r.ok) throw new Error("Invoice creation failed");
    const { paymentRequest } = await r.json() as { paymentRequest: string };
    return json({ pr: paymentRequest, routes: [] });
  } catch (err) {
    return json({ status: "ERROR", reason: String(err) }, 503);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
