#!/usr/bin/env node
/**
 * VERITY Outbound — GitHub Issues Sales Script
 *
 * VERITY finds qualifying API repos, generates a free integration preview
 * using Haiku, and opens a GitHub Issue with the preview + offer.
 *
 * Usage:
 *   node scripts/outbound-issues.mjs              # dry-run (no issues opened)
 *   SEND_ISSUES=1 node scripts/outbound-issues.mjs
 *
 * Config via env:
 *   GITHUB_PAT        — GitHub personal access token (required)
 *   ANTHROPIC_API_KEY — Anthropic API key for Haiku preview generation
 *   MAX_REPOS         — how many repos to process per run (default: 5)
 *   SEND_ISSUES       — set to "1" to actually open issues (dry-run by default)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTACTED_FILE = path.join(__dirname, "contacted-repos.json");

// ─── config ──────────────────────────────────────────────────────────────────

const GITHUB_PAT = process.env.GITHUB_PAT;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!GITHUB_PAT) {
  console.error("Error: GITHUB_PAT environment variable is required.");
  process.exit(1);
}
const MAX_REPOS = parseInt(process.env.MAX_REPOS ?? "5", 10);
const DRY_RUN = process.env.SEND_ISSUES !== "1";

// Search queries — ordered by relevance
const SEARCH_QUERIES = [
  'language:typescript topic:api stars:50..500 NOT "l402" NOT "lightning"',
  'language:python topic:fastapi stars:50..500 NOT "l402" NOT "lightning"',
  'language:typescript express OR hono OR fastify stars:100..800 topic:api NOT "l402"',
  'language:python flask OR fastapi stars:100..800 topic:api NOT "l402"',
  'language:go gin OR echo stars:50..400 topic:api NOT "l402"',
];

const GITHUB_HEADERS = {
  Authorization: `Bearer ${GITHUB_PAT}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "VERITY-l402kit/1.0",
};

// ─── state ───────────────────────────────────────────────────────────────────

function loadContacted() {
  try {
    return JSON.parse(fs.readFileSync(CONTACTED_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveContacted(contacted) {
  fs.writeFileSync(CONTACTED_FILE, JSON.stringify(contacted, null, 2));
}

// ─── GitHub API ───────────────────────────────────────────────────────────────

async function searchRepos(query) {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&per_page=10`;
  const res = await fetch(url, { headers: GITHUB_HEADERS });
  if (!res.ok) {
    console.error(`Search failed (${res.status}):`, await res.text());
    return [];
  }
  const data = await res.json();
  return data.items ?? [];
}

async function fetchRepoContext(owner, repo) {
  const headers = { ...GITHUB_HEADERS };
  const rootRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/`, {
    headers,
    signal: AbortSignal.timeout(8_000),
  });
  if (!rootRes.ok) return null;

  const files = await rootRes.json();
  const interesting = [
    "package.json", "requirements.txt", "Cargo.toml", "go.mod", "pyproject.toml",
    "index.ts", "index.js", "main.ts", "main.js", "main.py", "app.py",
    "main.go", "main.rs", "server.ts", "server.js", "app.ts", "app.js",
    "src/index.ts", "src/app.ts", "src/main.ts",
  ];

  const toFetch = files
    .filter((f) => f.type === "file" && interesting.some((n) => f.name === n || f.path === n))
    .slice(0, 4);

  const contents = await Promise.allSettled(
    toFetch.map(async (f) => {
      if (!f.download_url) return null;
      const r = await fetch(f.download_url, { signal: AbortSignal.timeout(5_000) });
      if (!r.ok) return null;
      const text = await r.text();
      return `=== ${f.name} ===\n${text.slice(0, 2500)}`;
    })
  );

  const parts = contents
    .filter((r) => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);

  return parts.length > 0 ? parts.join("\n\n") : null;
}

async function repoHasL402Issue(owner, repo) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=l402&per_page=1`,
    { headers: GITHUB_HEADERS }
  );
  if (!res.ok) return false;
  const issues = await res.json();
  return issues.length > 0;
}

async function openIssue(owner, repo, title, body) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: { ...GITHUB_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Issue creation failed (${res.status}): ${err}`);
  }
  return await res.json();
}

// ─── Haiku integration preview ───────────────────────────────────────────────

async function generatePreview(repoContext, owner, repo) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system:
        "You are VERITY, an autonomous AI agent specializing in API monetization via Bitcoin Lightning. " +
        "Be concise, precise, and developer-friendly. Write real code, no pseudocode.",
      messages: [
        {
          role: "user",
          content: `Analyze this repository and generate a minimal l402-kit integration preview.

REPO: github.com/${owner}/${repo}

${repoContext}

Generate:
1. One-line framework detection comment (e.g., "// Detected: Express.js + TypeScript")
2. The npm/pip/cargo install command
3. The MINIMAL code change — add l402 middleware to the most important route (5-10 lines max)
4. The 2 environment variables needed

Format: code block only, no explanation. End with a comment: // Integrated by VERITY

Keep the entire output under 30 lines.`,
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.content?.find((b) => b.type === "text")?.text ?? null;
}

function buildIssueBody(owner, repo, preview, lang) {
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const fullServiceUrl = `https://l402kit.com/api/verity/integration`;

  return `## ⚡ Add Lightning micropayments to your API — free preview

Hi! I'm **VERITY**, an autonomous AI agent that specializes in API monetization via Bitcoin Lightning.

I analyzed \`${owner}/${repo}\` and generated a free integration preview below.

---

### Preview integration

\`\`\`${lang}
${preview ?? "// Could not generate preview — try the full integration service"}
\`\`\`

---

### What this unlocks

- **AI agents** (Claude, ChatGPT, LangChain, Cursor) can pay your API automatically in sats
- **No API keys, no OAuth, no chargebacks** — pure cryptographic proof of payment (SHA256)
- **0.3% fee**, zero infrastructure — uses your existing Lightning address (free at blink.sv)
- Any L402-compatible agent can discover and pay your API with zero human intervention

### How the flow works

\`\`\`
Agent → GET /your-endpoint
Server → HTTP 402 + Lightning invoice (e.g. 10 sats ≈ $0.006)
Agent → pays invoice (~500ms, Lightning Network)
Agent → GET /your-endpoint + Authorization: L402 <proof>
Server → 200 OK — middleware validates cryptographically, no database
\`\`\`

### Full integration — 10,000 sats (~$6)

Send me the repo URL and I'll return **complete middleware code** specific to your framework, with exact file paths and line numbers:

\`\`\`bash
# Step 1 — get the invoice
curl -i ${fullServiceUrl} -X POST -H "Content-Type: application/json" \\
  -d '{"repoUrl":"${repoUrl}"}'
# → HTTP 402 + Lightning invoice

# Step 2 — pay with any Lightning wallet (blink.sv, Alby, Phoenix)
# Step 3 — retry with payment proof
curl ${fullServiceUrl} -X POST -H "Authorization: L402 <macaroon>:<preimage>" \\
  -H "Content-Type: application/json" -d '{"repoUrl":"${repoUrl}"}'
# → Complete integration code in markdown
\`\`\`

Or use the Agent SDK (auto-pays):
\`\`\`typescript
import { L402Client } from "l402-kit/agent";
import { BlinkWallet } from "l402-kit/wallets";

const client = new L402Client({ wallet: new BlinkWallet(process.env.BLINK_API_KEY!) });
const res = await client.fetch("${fullServiceUrl}", {
  method: "POST",
  body: JSON.stringify({ repoUrl: "${repoUrl}" }),
});
const { integration } = await res.json();
console.log(integration); // complete code, ready to paste
\`\`\`

---

**Resources:** [docs.l402kit.com](https://docs.l402kit.com) · [npm](https://npmjs.com/package/l402-kit) · [GitHub](https://github.com/ShinyDapps/l402-kit)

*Not interested? Just close this issue — VERITY will not contact this repo again.*

---
*Sent by [VERITY](https://l402kit.com/api/verity) | Powered by [l402-kit](https://l402kit.com) | Treasury: shinydapps@blink.sv*`;
}

// ─── filter logic ─────────────────────────────────────────────────────────────

function detectLang(repo) {
  const lang = (repo.language ?? "").toLowerCase();
  if (lang === "typescript" || lang === "javascript") return "typescript";
  if (lang === "python") return "python";
  if (lang === "go") return "go";
  if (lang === "rust") return "rust";
  return "typescript";
}

function isQualifying(repo) {
  if (repo.archived || repo.disabled || repo.private) return false;
  if (repo.stargazers_count < 30) return false;
  if (repo.open_issues_count > 500) return false; // too large/chaotic
  const desc = (repo.description ?? "").toLowerCase();
  const skip = ["l402", "lightning payment", "bitcoin payment", "micropayment"];
  if (skip.some((s) => desc.includes(s))) return false;
  return true;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n⚡ VERITY Outbound — GitHub Issues\n${DRY_RUN ? "DRY RUN (set SEND_ISSUES=1 to open real issues)" : "LIVE MODE — opening real issues"}\n`);

  const contacted = loadContacted();
  const results = { found: 0, skipped: 0, previewed: 0, issued: 0, errors: 0 };
  const issued = [];

  for (const query of SEARCH_QUERIES) {
    if (results.issued >= MAX_REPOS) break;

    console.log(`\n🔍 Query: ${query}`);
    let repos;
    try {
      repos = await searchRepos(query);
    } catch (err) {
      console.error("  Search error:", err.message);
      continue;
    }

    console.log(`  Found ${repos.length} repos`);

    for (const repo of repos) {
      if (results.issued >= MAX_REPOS) break;

      const key = `${repo.owner.login}/${repo.name}`;
      results.found++;

      if (contacted[key]) {
        console.log(`  ⏭  ${key} — already contacted`);
        results.skipped++;
        continue;
      }

      if (!isQualifying(repo)) {
        console.log(`  ⏭  ${key} — not qualifying`);
        results.skipped++;
        continue;
      }

      console.log(`\n  📦 ${key} (${repo.stargazers_count}★, ${repo.language})`);

      // Fetch repo context
      let context;
      try {
        context = await fetchRepoContext(repo.owner.login, repo.name);
      } catch (err) {
        console.error(`  ❌ fetchContext failed: ${err.message}`);
        results.errors++;
        continue;
      }

      if (!context) {
        console.log(`  ⏭  no readable files`);
        results.skipped++;
        continue;
      }

      // Generate preview
      let preview = null;
      if (ANTHROPIC_KEY) {
        try {
          console.log(`  🤖 Generating preview with Haiku...`);
          preview = await generatePreview(context, repo.owner.login, repo.name);
          results.previewed++;
          console.log(`  ✓ Preview generated (${preview?.length ?? 0} chars)`);
        } catch (err) {
          console.error(`  ⚠ Haiku error: ${err.message}`);
        }
      }

      const lang = detectLang(repo);
      const body = buildIssueBody(repo.owner.login, repo.name, preview, lang);
      const title = `⚡ Add Lightning micropayments — free l402-kit integration preview`;

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would open issue: "${title}"`);
        console.log(`  Preview snippet: ${(preview ?? "").slice(0, 100)}...`);
        issued.push({ repo: key, title, dry: true });
      } else {
        try {
          const issue = await openIssue(repo.owner.login, repo.name, title, body);
          console.log(`  ✅ Issue opened: ${issue.html_url}`);
          contacted[key] = {
            contacted_at: new Date().toISOString(),
            issue_url: issue.html_url,
            issue_number: issue.number,
          };
          saveContacted(contacted);
          results.issued++;
          issued.push({ repo: key, issue_url: issue.html_url });
        } catch (err) {
          console.error(`  ❌ Issue creation failed: ${err.message}`);
          results.errors++;
        }
      }

      // Rate limiting courtesy pause
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.log(`\n══════════════════════════════`);
  console.log(`VERITY Outbound — Summary`);
  console.log(`══════════════════════════════`);
  console.log(`Repos found:    ${results.found}`);
  console.log(`Skipped:        ${results.skipped}`);
  console.log(`Previews gen'd: ${results.previewed}`);
  console.log(`Issues opened:  ${results.issued}`);
  console.log(`Errors:         ${results.errors}`);
  if (issued.length > 0) {
    console.log(`\nIssued:`);
    for (const i of issued) {
      console.log(`  ${i.repo} → ${i.issue_url ?? "(dry run)"}`);
    }
  }
  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
