#!/usr/bin/env node
/**
 * update-mint-nav.mjs
 * Regenerates the per-locale navigation groups in docs/mint.json
 * based on which translated files actually exist on disk.
 * Run after translate-docs.mjs completes for each locale.
 */

import fs from "fs";
import path from "path";

const DOCS_DIR = path.resolve("docs");
const MINT_PATH = path.join(DOCS_DIR, "mint.json");

const LOCALES = {
  pt: "🇧🇷 Português",
  es: "🇪🇸 Español",
  zh: "🇨🇳 中文",
  ar: "🇸🇦 العربية",
  hi: "🇮🇳 हिंदी",
  fr: "🇫🇷 Français",
  de: "🇩🇪 Deutsch",
  ru: "🇷🇺 Русский",
  ja: "🇯🇵 日本語",
  it: "🇮🇹 Italiano",
};

// EN navigation structure to mirror per locale
const EN_GROUPS = [
  { group: "Getting Started",     pages: ["introduction", "quickstart"] },
  { group: "SDKs",                pages: ["sdk/typescript", "sdk/python", "sdk/go", "sdk/rust"] },
  { group: "Agent SDK",           pages: ["agent/quickstart", "agent/wallets", "agent/budget", "agent/mcp", "agent/langchain", "agent/system-prompt", "agent/wallet-quickstart", "agent/delegation", "agent/verity", "agent/lawn-n"] },
  { group: "Agent Integrations",  pages: ["agent/crewai", "agent/openai-agents", "agent/vercel-ai", "agent/autogpt"] },
  { group: "Guides",              pages: ["guides/pricing", "guides/testing", "guides/dashboard", "guides/vscode", "guides/privacy", "guides/flows", "guides/ai-agents", "guides/lnurl", "guides/security", "guides/production", "guides/migration", "guides/troubleshooting", "guides/dns-discovery"] },
  { group: "Reference",           pages: ["providers", "api-reference", "reference/errors", "competitive", "payment-layer"] },
  { group: "Examples",            pages: ["examples/diagram-forge", "examples/verity"] },
];

function fileExists(lc, page) {
  return fs.existsSync(path.join(DOCS_DIR, lc, `${page}.mdx`));
}

function buildLocaleGroups() {
  const groups = [];

  for (const [lc, label] of Object.entries(LOCALES)) {
    const localePages = [];

    for (const { group, pages } of EN_GROUPS) {
      const existing = pages.filter(p => fileExists(lc, p)).map(p => `${lc}/${p}`);
      if (existing.length === 0) continue;

      if (existing.length === 1) {
        // Don't nest single pages in a sub-group
        localePages.push(...existing);
      } else {
        localePages.push({ group, pages: existing });
      }
    }

    if (localePages.length === 0) continue;

    groups.push({ group: label, pages: localePages });
  }

  return groups;
}

function run() {
  const mint = JSON.parse(fs.readFileSync(MINT_PATH, "utf-8"));

  // Remove existing locale groups
  const localeLabels = new Set(Object.values(LOCALES));
  mint.navigation = mint.navigation.filter(g => !localeLabels.has(g.group));

  // Append new locale groups
  const localeGroups = buildLocaleGroups();
  mint.navigation.push(...localeGroups);

  fs.writeFileSync(MINT_PATH, JSON.stringify(mint, null, 2) + "\n", "utf-8");

  for (const g of localeGroups) {
    const count = countPages(g.pages);
    console.log(`  ${g.group}: ${count} pages`);
  }
  console.log(`\nmint.json updated.`);
}

function countPages(pages) {
  let n = 0;
  for (const p of pages) {
    if (typeof p === "string") n++;
    else n += countPages(p.pages);
  }
  return n;
}

run();
