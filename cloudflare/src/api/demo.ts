import type { Env } from "../worker";

export async function handleDemo(_req: Request, _env: Env): Promise<Response> {
  return new Response(JSON.stringify({
    message: "Payment confirmed ⚡",
    priceSats: 10,
    timestamp: new Date().toISOString(),
    protocol: "L402",
    note: "This is a demo response — no real payment was made.",
  }), {
    headers: { "Content-Type": "application/json" },
  });
}
