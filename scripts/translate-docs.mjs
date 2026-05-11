#!/usr/bin/env node
/**
 * translate-docs.mjs
 * Translates EN MDX docs to target locales using Claude.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/translate-docs.mjs [locale] [--force]
 *
 *   locale: pt | es | zh | ar | hi | fr | de | ru | ja | it | all (default: all)
 *   --force: overwrite existing translations
 *
 * The script preserves:
 *   - All code blocks (```lang ... ```)
 *   - All MDX components (<Note>, <Card>, <Tip>, <Warning>, etc.)
 *   - All URLs and hrefs
 *   - All frontmatter keys (translates values of title/description only)
 *   - Technical terms: L402, sats, Lightning, macaroon, preimage, BOLT11, l402-kit
 */

import fs from "fs";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const LOCALES = {
  pt: { name: "Brazilian Portuguese", flag: "🇧🇷" },
  es: { name: "Spanish",              flag: "🇪🇸" },
  zh: { name: "Simplified Chinese",   flag: "🇨🇳" },
  ar: { name: "Arabic",               flag: "🇸🇦" },
  hi: { name: "Hindi",                flag: "🇮🇳" },
  fr: { name: "French",               flag: "🇫🇷" },
  de: { name: "German",               flag: "🇩🇪" },
  ru: { name: "Russian",              flag: "🇷🇺" },
  ja: { name: "Japanese",             flag: "🇯🇵" },
  it: { name: "Italian",              flag: "🇮🇹" },
};

// EN source files to translate, relative to docs/
const SOURCE_FILES = [
  "introduction.mdx",
  "quickstart.mdx",
  "providers.mdx",
  "payment-layer.mdx",
  "competitive.mdx",
  "api-reference.mdx",
  "reference/errors.mdx",
  "sdk/typescript.mdx",
  "sdk/python.mdx",
  "sdk/go.mdx",
  "sdk/rust.mdx",
  "agent/quickstart.mdx",
  "agent/wallets.mdx",
  "agent/wallet-quickstart.mdx",
  "agent/budget.mdx",
  "agent/mcp.mdx",
  "agent/langchain.mdx",
  "agent/system-prompt.mdx",
  "agent/delegation.mdx",
  "agent/verity.mdx",
  "agent/lawn-n.mdx",
  "agent/crewai.mdx",
  "agent/openai-agents.mdx",
  "agent/vercel-ai.mdx",
  "agent/autogpt.mdx",
  "guides/pricing.mdx",
  "guides/testing.mdx",
  "guides/dashboard.mdx",
  "guides/vscode.mdx",
  "guides/privacy.mdx",
  "guides/flows.mdx",
  "guides/ai-agents.mdx",
  "guides/lnurl.mdx",
  "guides/security.mdx",
  "guides/production.mdx",
  "guides/migration.mdx",
  "guides/troubleshooting.mdx",
  "guides/dns-discovery.mdx",
  "examples/diagram-forge.mdx",
  "examples/verity.mdx",
];

const DOCS_DIR = path.resolve("docs");
const MODEL = "claude-sonnet-4-6";
const DELAY_MS = 12_000; // 12s delay → ~5 calls/min, under 8k output token/min limit
const MAX_RETRIES = 4;

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(locale, langName, content) {
  return `You are a technical documentation translator. Translate the following MDX documentation from English to ${langName}.

STRICT RULES — violation breaks the docs site:
1. Do NOT translate or alter ANY of these: code blocks (\`\`\`...\`\`\`), inline code (\`...\`), URLs, href values, component names (Note, Card, Tip, Warning, Steps, Tab, Tabs, Accordion, AccordionGroup, CodeGroup, RequestExample, ResponseExample, ParamField, ResponseField, Expandable), prop names (title=, icon=, href=, color=), frontmatter keys (title:, description:, sidebarTitle:).
2. DO translate: frontmatter values (title: and description: strings only), all prose/paragraph text, heading text, table cell text (not table pipes or formatting).
3. Do NOT translate these technical terms even in prose: L402, sats, satoshi, Lightning Network, macaroon, preimage, BOLT11, LNURL, l402-kit, l402kit, ManagedProvider, L402Client, BlinkWallet, AlbyWallet, BTCPayProvider, VERITY, LAW-N, HTTP 402, SHA-256, secp256k1, npm, pip, cargo, go get, Blink, Alby, Phoenix, Zeus, Breez, Mutiny, Cloudflare, Supabase, Mintlify.
4. Preserve all MDX formatting exactly: blank lines, --- frontmatter delimiters, | table pipes, * and ** markdown, > blockquotes.
5. Return ONLY the translated MDX — no explanation, no code fence wrapping the output.

Content to translate:
${content}`;
}

// ─── Claude API ───────────────────────────────────────────────────────────────

async function translate(locale, langName, content) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        messages: [{ role: "user", content: buildPrompt(locale, langName, content) }],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10);
      const wait = (retryAfter + 5) * 1000;
      process.stdout.write(` [429 retry in ${retryAfter}s]`);
      await new Promise(r => setTimeout(r, wait));
      attempt++;
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.content?.find(b => b.type === "text")?.text ?? "";
  }
  throw new Error(`Exceeded ${MAX_RETRIES} retries (rate limit)`);
}

// ─── File ops ─────────────────────────────────────────────────────────────────

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const localeArg = args.find(a => !a.startsWith("--")) ?? "all";

  const targetLocales = localeArg === "all"
    ? Object.keys(LOCALES)
    : [localeArg];

  for (const lc of targetLocales) {
    if (!LOCALES[lc]) {
      console.error(`Unknown locale: ${lc}. Valid: ${Object.keys(LOCALES).join(", ")}`);
      process.exit(1);
    }
  }

  let total = 0, skipped = 0, translated = 0, errors = 0;

  for (const lc of targetLocales) {
    const { name: langName, flag } = LOCALES[lc];
    console.log(`\n${flag}  Translating to ${langName} (${lc})`);

    for (const srcFile of SOURCE_FILES) {
      total++;
      const srcPath = path.join(DOCS_DIR, srcFile);
      const destPath = path.join(DOCS_DIR, lc, srcFile);

      if (!fs.existsSync(srcPath)) {
        console.log(`  SKIP  ${srcFile} (source missing)`);
        skipped++;
        continue;
      }

      if (!force && fs.existsSync(destPath)) {
        console.log(`  SKIP  ${srcFile} (already exists)`);
        skipped++;
        continue;
      }

      const content = fs.readFileSync(srcPath, "utf-8");

      try {
        process.stdout.write(`  ...   ${srcFile}`);
        const result = await translate(lc, langName, content);
        ensureDir(destPath);
        fs.writeFileSync(destPath, result, "utf-8");
        console.log(`\r  OK    ${srcFile}`);
        translated++;

        // Courtesy pause
        await new Promise(r => setTimeout(r, DELAY_MS));
      } catch (err) {
        console.log(`\r  ERR   ${srcFile} — ${err.message}`);
        errors++;
      }
    }
  }

  console.log(`\nDone. ${translated} translated, ${skipped} skipped, ${errors} errors (${total} total)`);
  if (errors > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
