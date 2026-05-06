import type { Env } from "../worker";
import { sweepTransitWallet } from "./sweep";

async function verifySvix(req: Request, body: string, secret: string): Promise<boolean> {
  const msgId        = req.headers.get("svix-id");
  const msgTimestamp = req.headers.get("svix-timestamp");
  const msgSignature = req.headers.get("svix-signature");
  if (!msgId || !msgTimestamp || !msgSignature) return false;

  // Replay protection: reject if timestamp is older than 5 minutes
  const ts = parseInt(msgTimestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const toSign = `${msgId}.${msgTimestamp}.${body}`;
  const secretBytes = Uint8Array.from(atob(secret.replace("whsec_", "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const computed = `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;

  return msgSignature.split(" ").some(s => s === computed);
}

export async function handleBlinkHook(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.text();

  if (!await verifySvix(req, body, env.BLINK_WEBHOOK_SECRET)) {
    return json({ error: "Invalid signature" }, 401);
  }

  // Parse único para dedup + enrichment
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(body) as Record<string, unknown>; } catch { /* ignore */ }

  const initiationVia = (parsed?.data as Record<string, unknown> | undefined)?.initiationVia as Record<string, unknown> | undefined;
  const paymentHash   = initiationVia?.paymentHash as string | undefined;

  // Dedup: Svix pode retentar o mesmo evento — processa cada paymentHash apenas uma vez
  if (paymentHash) {
    const dedupKey = `processed:${paymentHash}`;
    if (await env.demo_preimages.get(dedupKey)) {
      return json({ ok: true, skipped: true, reason: "duplicate" });
    }
    await env.demo_preimages.put(dedupKey, "1", { expirationTtl: 604800 }); // 7 dias
  }

  // Enrichment: busca ownerAddress no KV para acionar o split no modo managed
  let enrichedBody = body;
  if (paymentHash && parsed) {
    try {
      const raw = await env.demo_preimages.get(`l402_inv:${paymentHash}`);
      if (raw) {
        const { ownerAddress, amountSats } = JSON.parse(raw) as { ownerAddress: string; amountSats: number };
        enrichedBody = JSON.stringify({ ...parsed, _ownerAddress: ownerAddress, _amountSats: amountSats });
      }
    } catch { /* repassa body original se o parse falhar */ }
  }

  const r = await fetch(`${env.SUPABASE_URL}/functions/v1/blink-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
      "svix-id":        req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    },
    body: enrichedBody,
  });

  const data = await r.json();

  // Sweep whatever remains in the transit wallet → OWNER_LIGHTNING_ADDRESS
  if (r.ok) sweepTransitWallet(env).catch(() => {});

  return json(data, r.ok ? 200 : r.status);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
