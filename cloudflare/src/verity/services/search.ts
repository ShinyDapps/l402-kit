import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall } from "../pricing";

const SERVICE = "search";

export async function handleVeritySearch(req: Request, env: Env): Promise<Response> {
  if (!env.SERPER_API_KEY) return json({ error: "Service temporarily unavailable" }, 503);

  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    const url = new URL(req.url);
    let q = url.searchParams.get("q");
    if (!q && req.method === "POST") {
      const body = await req.json().catch(() => ({})) as { q?: string; query?: string };
      q = body.q ?? body.query ?? null;
    }
    if (!q) return json({ error: "Missing query parameter: q" }, 400);

    await recordCall(SERVICE, env);

    try {
      const r = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": env.SERPER_API_KEY },
        body: JSON.stringify({ q, num: 10 }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) return json({ error: "Search provider unavailable" }, 503);
      const data = await r.json() as { organic?: { title: string; link: string; snippet: string }[] };

      return json({
        agent: "VERITY",
        service: SERVICE,
        query: q,
        results: (data.organic ?? []).slice(0, 10).map(({ title, link, snippet }) => ({ title, link, snippet })),
        paid_with: "⚡ Lightning L402",
      });
    } catch {
      return json({ error: "Search failed" }, 503);
    }
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}
