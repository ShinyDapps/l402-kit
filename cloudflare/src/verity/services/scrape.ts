import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall } from "../pricing";

const SERVICE = "scrape";
const SSRF_BLOCK = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1|169\.254\.)/i;

export async function handleVerityScrape(req: Request, env: Env): Promise<Response> {
  if (!env.FIRECRAWL_API_KEY) return json({ error: "Service temporarily unavailable" }, 503);
  if (req.method !== "POST") return json({ error: "POST required. Body: { url: string }" }, 405);

  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    const body = await req.json().catch(() => ({})) as { url?: string };
    const targetUrl = (body.url ?? "").trim();
    if (!targetUrl) return json({ error: "Missing url in body" }, 400);

    let hostname: string;
    try { hostname = new URL(targetUrl).hostname; } catch { return json({ error: "Invalid URL" }, 400); }
    if (SSRF_BLOCK.test(hostname)) return json({ error: "URL not allowed" }, 400);

    await recordCall(SERVICE, env);

    try {
      const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.FIRECRAWL_API_KEY}` },
        body: JSON.stringify({ url: targetUrl, formats: ["markdown"] }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) return json({ error: "Scrape provider unavailable" }, 503);
      const data = await r.json() as { success?: boolean; data?: { markdown?: string; metadata?: { title?: string; description?: string } } };
      if (!data.success || !data.data) return json({ error: "Scrape failed" }, 503);

      return json({
        agent: "VERITY",
        service: SERVICE,
        url: targetUrl,
        title: data.data.metadata?.title,
        description: data.data.metadata?.description,
        content: data.data.markdown ?? "",
        paid_with: "⚡ Lightning L402",
      });
    } catch {
      return json({ error: "Scrape failed" }, 503);
    }
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}
