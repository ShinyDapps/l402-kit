import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall } from "../pricing";
import { callHaiku } from "../haiku";

const SERVICE = "summarize";

export async function handleVeritySummarize(req: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "Service temporarily unavailable" }, 503);
  if (req.method !== "POST") return json({ error: "POST required. Body: { text: string, language?: string }" }, 405);

  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    const body = await req.json().catch(() => ({})) as { text?: string; language?: string };
    const text = (body.text ?? "").trim();
    if (!text) return json({ error: "Missing text in body" }, 400);
    if (text.length > 50_000) return json({ error: "Text too long (max 50,000 chars)" }, 400);

    const language = body.language ?? "same as input";
    await recordCall(SERVICE, env);

    const summary = await callHaiku(
      `Summarize the following text concisely in ${language}. Return only the summary, no preamble.\n\n${text}`,
      env,
    );
    if (!summary) return json({ error: "Summarization failed" }, 503);

    return json({
      agent: "VERITY",
      service: SERVICE,
      summary,
      input_length: text.length,
      paid_with: "⚡ Lightning L402",
    });
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}
