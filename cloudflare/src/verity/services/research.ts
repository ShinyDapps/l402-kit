import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall } from "../pricing";
import { searchWeb } from "../providers/search";
import { scrapeUrl } from "../providers/scrape";
import { infer } from "../providers/inference";

const SERVICE = "research";

export async function handleVerityResearch(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST required. Body: { query: string }" }, 405);

  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    const body = await req.json().catch(() => ({})) as { query?: string };
    const query = (body.query ?? "").trim();
    if (!query) return json({ error: "Missing query in body" }, 400);

    // 1. Search — top 3 results
    const searchResult = await searchWeb(query, env);
    const topResults = (searchResult?.results ?? []).slice(0, 3);

    // 2. Scrape top result
    let scrapedContent = "";
    let scraped_url = "";
    for (const r of topResults) {
      if (!r.link) continue;
      const scraped = await scrapeUrl(r.link, env);
      if (scraped?.content && scraped.content.length > 200) {
        scrapedContent = scraped.content.slice(0, 30_000);
        scraped_url = r.link;
        break;
      }
    }

    // 3. Summarize scraped content
    let summary = "";
    if (scrapedContent) {
      const result = await infer(
        `Summarize the following article in 3-5 sentences, focusing on the most important facts:\n\n${scrapedContent}`,
        env,
      );
      summary = result ?? "";
    }

    await recordCall(SERVICE, env);

    return json({
      agent: "VERITY",
      service: SERVICE,
      query,
      summary,
      scraped_url,
      sources: topResults.map(r => ({ title: r.title, link: r.link, snippet: r.snippet })),
      provider: searchResult?.provider ?? "unknown",
      paid_with: "⚡ Lightning L402",
    });
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}
