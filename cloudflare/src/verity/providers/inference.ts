import type { Env } from "../../worker";

export interface InferenceOptions {
  system?: string;
  maxTokens?: number;
}

export async function infer(prompt: string, env: Env, opts: InferenceOptions = {}): Promise<string | null> {
  const system  = opts.system ?? "You are VERITY, an autonomous AI agent. Be concise and precise.";
  const maxTok  = opts.maxTokens ?? 2048;

  // 1. Groq — free tier (14,400 req/day), activate by adding GROQ_API_KEY secret
  if (env.GROQ_API_KEY) {
    const groq = await inferGroq(prompt, system, maxTok, env.GROQ_API_KEY);
    if (groq) return groq;
  }

  // 2. Claude Haiku — paid fallback (~1 sat/call)
  if (env.ANTHROPIC_API_KEY) {
    return inferHaiku(prompt, system, maxTok, env.ANTHROPIC_API_KEY);
  }

  return null;
}

async function inferGroq(prompt: string, system: string, maxTokens: number, apiKey: string): Promise<string | null> {
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile",
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user",   content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return null;
    const data = await r.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

async function inferHaiku(prompt: string, system: string, maxTokens: number, apiKey: string): Promise<string | null> {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return null;
    const data = await r.json() as { content?: { type: string; text: string }[] };
    return data.content?.find(b => b.type === "text")?.text ?? null;
  } catch {
    return null;
  }
}
