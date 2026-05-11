import type { Env } from "../../worker";

export interface ScrapeResult {
  content: string;
  title?: string;
  description?: string;
  provider: "jina" | "firecrawl";
}

const SSRF_BLOCK = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1|169\.254\.)/i;

export function validateUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    if (SSRF_BLOCK.test(hostname)) return "URL not allowed";
    return null;
  } catch {
    return "Invalid URL";
  }
}

export async function scrapeUrl(url: string, env: Env): Promise<ScrapeResult | null> {
  // 1. Jina Reader — free, no key, returns clean markdown
  const jina = await scrapeJina(url);
  if (jina) return jina;

  // 2. Firecrawl — paid fallback
  if (env.FIRECRAWL_API_KEY) {
    const fc = await scrapeFirecrawl(url, env.FIRECRAWL_API_KEY);
    if (fc) return fc;
  }

  return null;
}

async function scrapeJina(url: string): Promise<ScrapeResult | null> {
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        "Accept": "text/plain",
        "X-Return-Format": "markdown",
        "X-Timeout": "10",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    if (!text || text.length < 80) return null;

    const titleMatch = text.match(/^Title:\s*(.+)$/m);
    const descMatch  = text.match(/^Description:\s*(.+)$/m);
    const mdStart    = text.indexOf("Markdown Content:");
    const content    = mdStart > -1 ? text.slice(mdStart + 17).trim() : text.trim();

    if (!content) return null;
    return {
      content,
      title:       titleMatch?.[1]?.trim(),
      description: descMatch?.[1]?.trim(),
      provider:    "jina",
    };
  } catch {
    return null;
  }
}

async function scrapeFirecrawl(url: string, apiKey: string): Promise<ScrapeResult | null> {
  try {
    const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const data = await r.json() as { success?: boolean; data?: { markdown?: string; metadata?: { title?: string; description?: string } } };
    if (!data.success || !data.data?.markdown) return null;
    return {
      content:     data.data.markdown,
      title:       data.data.metadata?.title,
      description: data.data.metadata?.description,
      provider:    "firecrawl",
    };
  } catch {
    return null;
  }
}
