import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall, recordSuccess, recordError } from "../pricing";
import { infer } from "../providers/inference";

const SERVICE = "translate";

const SUPPORTED_LOCALES: Record<string, string> = {
  pt: "Brazilian Portuguese",
  es: "Spanish",
  zh: "Simplified Chinese",
  ar: "Arabic",
  hi: "Hindi",
  fr: "French",
  de: "German",
  ru: "Russian",
  ja: "Japanese",
  it: "Italian",
  en: "English",
};

export async function handleVerityTranslate(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "POST required. Body: { text: string, locale: string, format?: 'mdx'|'plain' }" }, 405);
  }

  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    const body = await req.json().catch(() => ({})) as { text?: string; locale?: string; format?: string };
    const text   = (body.text   ?? "").trim();
    const locale = (body.locale ?? "").trim().toLowerCase();
    const format = body.format === "mdx" ? "mdx" : "plain";

    if (!text)   return json({ error: "Missing text in body" }, 400);
    if (!locale) return json({ error: "Missing locale in body" }, 400);
    if (text.length > 100_000) return json({ error: "Text too long (max 100,000 chars)" }, 400);

    const targetLang = SUPPORTED_LOCALES[locale];
    if (!targetLang) {
      return json({
        error: `Unsupported locale: ${locale}`,
        supported: Object.keys(SUPPORTED_LOCALES),
      }, 400);
    }

    await recordCall(SERVICE, env);

    const mdxInstructions = format === "mdx" ? `
Preserve exactly:
- All code blocks (\`\`\`lang ... \`\`\`)
- All MDX components (<Note>, <Card>, <Tip>, <Warning>, <CodeGroup>, etc.)
- All URLs, hrefs, and src attributes
- All frontmatter keys (translate only the values of title and description)
- Technical terms: L402, sats, Lightning, macaroon, preimage, BOLT11, l402-kit, VERITY` : "";

    const translated = await infer(
      `Translate the following text to ${targetLang}. Return only the translated text, no preamble or explanation.${mdxInstructions}

Text to translate:
${text}`,
      env,
      { system: "You are a professional technical translator. Preserve all formatting, code, and technical terms exactly as instructed." },
    );

    if (!translated) { await recordError(SERVICE, env); return json({ error: "Translation failed" }, 503); }

    await recordSuccess(SERVICE, env);
    return json({
      agent: "VERITY",
      service: SERVICE,
      locale,
      language: targetLang,
      format,
      translated,
      source_length: text.length,
      paid_with: "⚡ Lightning L402",
    });
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}
