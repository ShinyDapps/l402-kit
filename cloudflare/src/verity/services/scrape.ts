import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall, recordSuccess, recordError } from "../pricing";
import { scrapeUrl, validateUrl } from "../providers/scrape";

const SERVICE = "scrape";

export async function handleVerityScrape(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST required. Body: { url: string }" }, 405);

  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    const body = await req.json().catch(() => ({})) as { url?: string };
    const targetUrl = (body.url ?? "").trim();
    if (!targetUrl) return json({ error: "Missing url in body" }, 400);

    const urlError = validateUrl(targetUrl);
    if (urlError) return json({ error: urlError }, 400);

    await recordCall(SERVICE, env);

    const result = await scrapeUrl(targetUrl, env);
    if (!result) { await recordError(SERVICE, env); return json({ error: "Scrape failed — URL may require JavaScript or authentication" }, 503); }

    await recordSuccess(SERVICE, env);
    return json({
      agent: "VERITY",
      service: SERVICE,
      url: targetUrl,
      title: result.title,
      description: result.description,
      content: result.content,
      paid_with: "⚡ Lightning L402",
    });
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}
