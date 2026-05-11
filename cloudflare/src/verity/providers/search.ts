import type { Env } from "../../worker";

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface SearchResponse {
  results: SearchResult[];
  provider: "brave" | "serper";
}

export async function searchWeb(query: string, env: Env): Promise<SearchResponse | null> {
  // 1. Brave Search — free tier (2000/month), activate by adding BRAVE_API_KEY secret
  if (env.BRAVE_API_KEY) {
    const brave = await searchBrave(query, env.BRAVE_API_KEY);
    if (brave) return brave;
  }

  // 2. Serper — paid fallback
  if (env.SERPER_API_KEY) {
    const serper = await searchSerper(query, env.SERPER_API_KEY);
    if (serper) return serper;
  }

  return null;
}

async function searchBrave(query: string, apiKey: string): Promise<SearchResponse | null> {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10&text_decorations=false&search_lang=en`;
    const r = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const data = await r.json() as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
    const items = data.web?.results ?? [];
    if (!items.length) return null;
    return {
      results: items.slice(0, 10).map(i => ({
        title:   i.title ?? "",
        link:    i.url ?? "",
        snippet: i.description ?? "",
      })),
      provider: "brave",
    };
  } catch {
    return null;
  }
}

async function searchSerper(query: string, apiKey: string): Promise<SearchResponse | null> {
  try {
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({ q: query, num: 10 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const data = await r.json() as { organic?: { title: string; link: string; snippet: string }[] };
    const items = data.organic ?? [];
    if (!items.length) return null;
    return {
      results: items.slice(0, 10).map(({ title, link, snippet }) => ({ title, link, snippet })),
      provider: "serper",
    };
  } catch {
    return null;
  }
}
