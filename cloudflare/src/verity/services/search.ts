import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall, recordSuccess, recordError } from "../pricing";
import { searchWeb } from "../providers/search";

const SERVICE = "search";

export async function handleVeritySearch(req: Request, env: Env): Promise<Response> {
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

    const response = await searchWeb(q, env);
    if (!response) { await recordError(SERVICE, env); return json({ error: "Search provider unavailable" }, 503); }

    await recordSuccess(SERVICE, env);
    return json({
      agent: "VERITY",
      service: SERVICE,
      query: q,
      results: response.results,
      paid_with: "⚡ Lightning L402",
    });
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}
