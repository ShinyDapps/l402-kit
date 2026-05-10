import type { Env } from "../worker";

export async function callHaiku(prompt: string, env: Env, systemPrompt?: string): Promise<string | null> {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt ?? "You are VERITY, an autonomous AI agent. Be concise and precise.",
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
