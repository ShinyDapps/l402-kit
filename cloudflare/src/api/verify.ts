import type { Env } from "../worker";

export async function handleVerify(req: Request, _env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const token = String(body?.token ?? "");
  if (!token) return json({ error: "Missing token" }, 400);

  const [macaroon, preimage] = token.split(":");
  if (!macaroon || !preimage) return json({ valid: false, error: "Malformed token" });

  try {
    const decoded = JSON.parse(atob(macaroon)) as { hash?: string; exp?: number };
    if (!decoded.hash) return json({ valid: false, error: "No hash in macaroon" });
    if (decoded.exp && Date.now() > decoded.exp) return json({ valid: false, error: "Token expired" });

    const preimageBytes = hexToUint8Array(preimage);
    const hashBuffer = await crypto.subtle.digest("SHA-256", preimageBytes.buffer as ArrayBuffer);
    const computedHash = uint8ArrayToHex(new Uint8Array(hashBuffer));

    const valid = computedHash === decoded.hash;
    return json({ valid });
  } catch {
    return json({ valid: false, error: "Invalid token format" });
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
