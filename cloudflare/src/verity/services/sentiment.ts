import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall } from "../pricing";
import { infer } from "../providers/inference";

const SERVICE = "sentiment";

export async function handleVeritySentiment(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST required. Body: { text: string }" }, 405);

  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    const body = await req.json().catch(() => ({})) as { text?: string };
    const text = (body.text ?? "").trim();
    if (!text) return json({ error: "Missing text in body" }, 400);
    if (text.length > 10_000) return json({ error: "Text too long (max 10,000 chars)" }, 400);

    await recordCall(SERVICE, env);

    const raw = await infer(
      `Analyze the sentiment of the following text. Respond ONLY with valid JSON in this exact format:
{"sentiment":"positive"|"negative"|"neutral","score":0.0-1.0,"confidence":0.0-1.0,"keywords":["word1","word2"]}

Text: ${text}`,
      env,
    );
    if (!raw) return json({ error: "Sentiment analysis failed" }, 503);

    let parsed: unknown;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : JSON.parse(raw);
    } catch {
      parsed = { sentiment: "neutral", score: 0.5, confidence: 0.5, keywords: [] };
    }

    return json({
      agent: "VERITY",
      service: SERVICE,
      analysis: parsed,
      paid_with: "⚡ Lightning L402",
    });
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}
