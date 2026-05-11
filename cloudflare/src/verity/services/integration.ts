import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall } from "../pricing";
import { infer } from "../providers/inference";
import { scrapeUrl } from "../providers/scrape";
import { searchWeb } from "../providers/search";
import { callSelf, shouldBuy } from "../consumer";

const SERVICE = "integration";
const GITHUB_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/?\s]+)/;

export async function handleVerityIntegration(req: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "Service temporarily unavailable" }, 503);
  if (req.method !== "POST") return json({ error: "POST required. Body: { repoUrl: string }" }, 405);

  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    const body = await req.json().catch(() => ({})) as { repoUrl?: string };
    const repoUrl = (body.repoUrl ?? "").trim();
    if (!repoUrl) return json({ error: "Missing repoUrl in body" }, 400);

    const match = repoUrl.match(GITHUB_RE);
    if (!match) return json({ error: "Invalid GitHub repo URL" }, 400);

    const [, owner, repo] = match;
    const price = await getPrice(SERVICE, env);
    await recordCall(SERVICE, env);

    // Gather context in parallel: code files + Consumer-enriched docs + search
    const [codeContext, docsResult, searchResult] = await Promise.allSettled([
      fetchRepoContext(owner, repo),
      // Consumer self-call: scrape README/docs (free internal, records COGS)
      shouldBuy(20, price)
        ? callSelf("scrape", env, () => scrapeUrl(`https://github.com/${owner}/${repo}#readme`, env))
        : Promise.resolve({ ok: false, cogsSats: 0 }),
      // Consumer self-call: search for issues and tech context
      shouldBuy(50, price)
        ? callSelf("search", env, () => searchWeb(`${owner}/${repo} github integration api`, env))
        : Promise.resolve({ ok: false, cogsSats: 0 }),
    ]);

    const code   = codeContext.status === "fulfilled" ? codeContext.value : null;
    const docs   = docsResult.status  === "fulfilled" && docsResult.value.ok ? docsResult.value.data as { content?: string } | null : null;
    const search = searchResult.status === "fulfilled" && searchResult.value.ok ? searchResult.value.data : null;

    if (!code && !docs) return json({ error: "Could not read repository. Make sure it is public." }, 400);

    const contextParts: string[] = [];
    if (code)   contextParts.push(`=== SOURCE FILES ===\n${code}`);
    if (docs?.content)   contextParts.push(`=== README/DOCS ===\n${String(docs.content).slice(0, 4000)}`);
    if (search) contextParts.push(`=== WEB CONTEXT ===\n${JSON.stringify(search).slice(0, 1000)}`);

    const integration = await infer(
      `You are VERITY, an autonomous AI agent that integrates l402-kit (Bitcoin Lightning micropayments) into APIs.

Analyze this repository and generate a complete l402-kit integration.

REPOSITORY CONTEXT:
${contextParts.join("\n\n")}

Generate:
1. Which framework is detected (Express, FastAPI, Gin, Axum, etc.)
2. The exact code to add l402-kit middleware to the most important route(s)
3. Environment variables needed (BLINK_API_KEY, BLINK_WALLET_ID)
4. A one-line npm/pip/cargo/go install command

Format as markdown with code blocks. Be specific — show actual file paths and line numbers where to add the code.`,
      env,
      "You are VERITY, an autonomous AI agent specializing in API monetization via Bitcoin Lightning.",
    );

    if (!integration) return json({ error: "Integration generation failed" }, 503);

    const footer = `\n\n---\n⚡ Integrated by [VERITY](https://l402kit.com/api/verity) · ${price.toLocaleString()} sats · https://l402kit.com/api/verity/integration`;

    return json({
      agent: "VERITY",
      service: SERVICE,
      repo: `${owner}/${repo}`,
      integration: integration + footer,
      next_steps: [
        "Apply the integration code to your repository",
        "Set BLINK_API_KEY and BLINK_WALLET_ID environment variables",
        "Deploy and test with: curl -i https://your-api/your-endpoint",
        "Agents worldwide can now pay you in sats automatically",
      ],
      paid_with: "⚡ Lightning L402",
    });
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}

async function fetchRepoContext(owner: string, repo: string): Promise<string | null> {
  try {
    const headers = { Accept: "application/vnd.github.v3+json", "User-Agent": "VERITY-agent/1.0" };

    const rootRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/`, {
      headers, signal: AbortSignal.timeout(6_000),
    });
    if (!rootRes.ok) return null;

    const files = await rootRes.json() as { name: string; type: string; download_url?: string }[];
    const interesting = ["package.json", "requirements.txt", "Cargo.toml", "go.mod",
      "index.ts", "index.js", "main.ts", "main.js", "main.py", "app.py",
      "main.go", "main.rs", "server.ts", "server.js", "app.ts", "app.js"];

    const toFetch = files
      .filter(f => f.type === "file" && interesting.includes(f.name))
      .slice(0, 5);

    const contents = await Promise.allSettled(
      toFetch.map(async f => {
        if (!f.download_url) return null;
        const r = await fetch(f.download_url, { signal: AbortSignal.timeout(5_000) });
        if (!r.ok) return null;
        const text = await r.text();
        return `=== ${f.name} ===\n${text.slice(0, 3000)}`;
      }),
    );

    const parts = contents
      .filter((r): r is PromiseFulfilledResult<string | null> => r.status === "fulfilled" && r.value !== null)
      .map(r => r.value as string);

    return parts.length ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}
