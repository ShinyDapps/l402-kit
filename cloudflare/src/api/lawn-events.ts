import type { Env } from "../worker";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hexToBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

async function verifyHmac(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const hexSig = signature.replace("sha256=", "");
    if (!/^[0-9a-f]+$/i.test(hexSig) || hexSig.length !== 64) return false;
    const sigBytes = hexToBytes(hexSig);
    return crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(body));
  } catch {
    return false;
  }
}

interface CloudEventData {
  agent_id?: string;
  session_id: string;
  request_id: string;
  endpoint?: string;
  event_type: string;
  network?: { provider?: string; transport: string; region?: string };
  payment?: { amount_sats: number; invoice_hash?: string; preimage_hash?: string; settled?: boolean; latency_ms?: number };
  behavior?: { retry_count?: number; budget_remaining?: number; budget_exhausted?: boolean; caveat_violations?: number; proof_reuse_attempt?: boolean };
  timing?: { client_sent_at?: number; invoice_received_at?: number; payment_completed_at?: number };
  risk?: { severity?: number; trust_score?: number; drift_score?: number };
}

interface L402CloudEvent {
  specversion: string;
  type: string;
  source: string;
  id: string;
  time: string;
  subject: string;
  datacontenttype: string;
  data: CloudEventData;
}

export async function handleLawnEvents(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.text();
  const signature = req.headers.get("X-LAW-N-Signature") ?? "";

  if (!signature) return json({ error: "Missing signature" }, 401);

  const valid = await verifyHmac(body, signature, env.LAWN_HMAC_SECRET);
  if (!valid) return json({ error: "Invalid signature" }, 401);

  let event: L402CloudEvent;
  try {
    event = JSON.parse(body) as L402CloudEvent;
  } catch {
    return json({ error: "Malformed JSON" }, 400);
  }

  if (!event.specversion || !event.type || !event.data || !event.id) {
    return json({ error: "Invalid CloudEvent: missing required fields" }, 400);
  }

  const d = event.data;
  if (!d.session_id || !d.request_id) {
    return json({ error: "Invalid CloudEvent: missing data fields" }, 400);
  }

  // Insert into Supabase — fire and forget style; don't block on errors
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/agent_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        event_id: event.id,
        event_type: event.type,
        agent_id: d.agent_id ?? null,
        session_id: d.session_id,
        request_id: d.request_id,
        endpoint: d.endpoint ?? null,
        amount_sats: d.payment?.amount_sats ?? null,
        settled: d.payment?.settled ?? null,
        latency_ms: d.payment?.latency_ms ?? null,
        budget_remaining: d.behavior?.budget_remaining ?? null,
        budget_exhausted: d.behavior?.budget_exhausted ?? null,
        retry_count: d.behavior?.retry_count ?? null,
        proof_reuse_attempt: d.behavior?.proof_reuse_attempt ?? null,
        caveat_violations: d.behavior?.caveat_violations ?? null,
        network_provider: d.network?.provider ?? null,
      }),
    });
  } catch {
    // Supabase errors must not block the sender (at-least-once delivery)
  }

  return json({ ok: true });
}
