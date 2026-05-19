#!/usr/bin/env node
// l402-kit — monitor de tração
// Uso: node monitor.mjs

const BASE = "https://api.github.com";
const NPM  = "https://api.npmjs.org/downloads/point/last-week/l402-kit";
const PYPI = "https://pypistats.org/api/packages/l402kit/recent?period=week";

async function get(url, opts = {}) {
  const r = await fetch(url, { headers: { "User-Agent": "l402-kit-monitor" }, ...opts });
  return r.ok ? r.json() : null;
}

async function http(url) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.status;
  } catch { return 0; }
}

async function main() {
  console.log("\n⚡ l402-kit — Monitor de Tração");
  console.log("=".repeat(50));
  console.log(new Date().toLocaleString("pt-BR"), "\n");

  // GitHub PRs
  console.log("📬 PRs ABERTOS");
  const pr1 = await get(`${BASE}/repos/punkpeye/awesome-mcp-servers/pulls/5585`);
  const pr1c = await get(`${BASE}/repos/punkpeye/awesome-mcp-servers/issues/5585/comments`);
  const pr2 = await get(`${BASE}/repos/Fewsats/awesome-L402/pulls/14`);

  const pr1Status = pr1?.merged_at ? "✅ MERGED" : pr1?.state === "open" ? "⏳ open" : "❌ closed";
  const pr2Status = pr2?.merged_at ? "✅ MERGED" : pr2?.state === "open" ? "⏳ open" : "❌ closed";
  const humanComments = (pr1c || []).filter(c => !c.user.login.includes("bot") && !c.user.login.includes("[bot]"));

  console.log(`  awesome-mcp-servers #5585: ${pr1Status}`);
  console.log(`    💬 Comentários humanos: ${humanComments.length}`);
  if (humanComments.length > 0) {
    humanComments.forEach(c => console.log(`    → ${c.user.login}: ${c.body.slice(0, 80)}...`));
  }
  console.log(`  awesome-L402 #14:          ${pr2Status}`);
  if (pr2?.comments > 0) console.log(`    💬 Comentários: ${pr2.comments}`);

  // GitHub repo stats
  console.log("\n⭐ GITHUB");
  const repo = await get(`${BASE}/repos/ShinyDapps/l402-kit`);
  console.log(`  Stars:   ${repo?.stargazers_count ?? "?"}`);
  console.log(`  Forks:   ${repo?.forks_count ?? "?"}`);
  console.log(`  Watchers: ${repo?.watchers_count ?? "?"}`);

  // npm downloads
  console.log("\n📦 NPM");
  const npm = await get(NPM);
  console.log(`  Downloads (7d): ${npm?.downloads ?? "?"}`);

  // PyPI downloads
  console.log("\n🐍 PYPI");
  const pypi = await get(PYPI);
  console.log(`  Downloads (7d): ${pypi?.data?.last_week ?? "?"}`);

  // Glama listing
  console.log("\n🦙 GLAMA");
  const glamaStatus = await http("https://glama.ai/mcp/servers/ShinyDapps/l402-kit");
  const glamaBadge = await http("https://glama.ai/mcp/servers/ShinyDapps/l402-kit/badges/score.svg");
  console.log(`  Página:  ${glamaStatus === 200 ? "✅ live" : "⏳ " + glamaStatus}`);
  console.log(`  Badge:   ${glamaBadge === 200 ? "✅ score badge disponível" : "⏳ ainda processando"}`);

  // Site uptime
  console.log("\n🌐 UPTIME");
  const checks = [
    ["Site",       "https://l402kit.com"],
    ["API demo",   "https://l402kit.com/api/demo"],
    ["agent.json", "https://l402kit.com/.well-known/agent.json"],
    ["l402.json",  "https://l402kit.com/.well-known/l402.json"],
    ["Docs",       "https://docs.l402kit.com"],
  ];
  for (const [name, url] of checks) {
    const s = await http(url);
    console.log(`  ${name.padEnd(12)}: ${s === 200 ? "✅ 200" : "❌ " + s}`);
  }

  // VS Code Extension
  console.log("\n🔌 VS CODE EXTENSION");
  const vsix = await get("https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json;api-version=7.1-preview.1" },
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: "ShinyDapps.shinydapps-l402" }] }], flags: 914 })
  });
  const ext = vsix?.results?.[0]?.extensions?.[0];
  if (ext) {
    const installs = ext.statistics?.find(s => s.statisticName === "install")?.value ?? "?";
    const version  = ext.versions?.[0]?.version ?? "?";
    console.log(`  Versão:   ${version}`);
    console.log(`  Installs: ${installs}`);
  } else {
    console.log("  (não foi possível consultar marketplace)");
  }

  console.log("\n" + "=".repeat(50));
  console.log("💡 Discord e Gmail: verificar manualmente");
  console.log("   Discord: https://discord.com/channels/glama");
  console.log("   Gmail:   38responde@proton.me (Trezoitão), frank@glama.ai, info@bitbull-trading.com");
  console.log("=".repeat(50) + "\n");
}

main().catch(console.error);
