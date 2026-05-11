import type { Env } from "./worker";

const OWNER = "ShinyDapps";
const REPO = "l402-kit";
const ALERT_EMAIL = "thiagoyoshiaki@gmail.com";
const FROM_EMAIL = "VERITY <verity@l402kit.com>";

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "VERITY-monitor/1.0",
};

// ─── email via Resend ─────────────────────────────────────────────────────────

async function sendEmail(subject: string, html: string, env: Env): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to: ALERT_EMAIL, subject, html }),
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}

// ─── checkers ────────────────────────────────────────────────────────────────

async function checkFirstPayment(env: Env): Promise<string | null> {
  const res = await fetch("https://l402kit.com/api/activity", { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return null;
  const data = await res.json() as { total_events: number; total_sats: number; unique_agents: number };
  if (data.total_sats > 0) {
    return `⚡ VERITY recebeu o primeiro pagamento!<br>
      <b>${data.total_events} eventos</b> · <b>${data.total_sats} sats</b> · <b>${data.unique_agents} agentes</b>`;
  }
  return null;
}

async function checkIssueReplies(env: Env): Promise<string | null> {
  // Busca issues abertas por VERITY nas últimas 48h que têm respostas
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/issues/comments?since=${since}&per_page=10`,
    { headers: GITHUB_HEADERS, signal: AbortSignal.timeout(8_000) }
  );
  // Verifica issues abertas por shinydapps em outros repos
  const issuesRes = await fetch(
    `https://api.github.com/search/issues?q=author:shinydapps+is:issue+created:>${since}&per_page=5`,
    { headers: GITHUB_HEADERS, signal: AbortSignal.timeout(8_000) }
  );
  if (!issuesRes.ok) return null;
  const data = await issuesRes.json() as { items: { html_url: string; title: string; comments: number; repository_url: string }[] };
  const withReplies = data.items.filter(i => i.comments > 0);
  if (withReplies.length > 0) {
    const list = withReplies.map(i =>
      `<li><a href="${i.html_url}">${i.title.slice(0, 60)}</a> — ${i.comments} resposta(s)</li>`
    ).join("");
    return `💬 Issues do VERITY com respostas:<ul>${list}</ul>`;
  }
  return null;
}

async function checkHNPost(env: Env): Promise<string | null> {
  const hnId = await env.demo_preimages.get("monitor:hn_post_id");
  if (!hnId) return null;
  const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${hnId}.json`, {
    signal: AbortSignal.timeout(8_000)
  });
  if (!res.ok) return null;
  const data = await res.json() as { score: number; dead?: boolean; descendants?: number };
  if (!data.dead && data.score >= 5) {
    return `🔥 Post HN ao vivo! <b>${data.score} pontos</b> · ${data.descendants ?? 0} comentários<br>
      <a href="https://news.ycombinator.com/item?id=${hnId}">Ver post</a>`;
  }
  return null;
}

async function checkNpmSpike(env: Env): Promise<string | null> {
  const lastKey = "monitor:npm_downloads_last";
  const res = await fetch("https://api.npmjs.org/downloads/point/last-day/l402-kit", {
    signal: AbortSignal.timeout(8_000)
  });
  if (!res.ok) return null;
  const data = await res.json() as { downloads: number };
  const current = data.downloads;
  const lastRaw = await env.demo_preimages.get(lastKey);
  const last = lastRaw ? parseInt(lastRaw, 10) : 0;
  await env.demo_preimages.put(lastKey, String(current), { expirationTtl: 86400 * 7 });
  if (current > last * 2 && current > 50) {
    return `📦 Spike de downloads npm!<br><b>${current} downloads hoje</b> (era ${last} ontem)`;
  }
  return null;
}

// ─── main monitor ─────────────────────────────────────────────────────────────

export async function runMonitor(env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return; // sem email configurado, não roda

  const alerts: string[] = [];

  const [payment, issueReplies, hnPost, npmSpike] = await Promise.allSettled([
    checkFirstPayment(env),
    checkIssueReplies(env),
    checkHNPost(env),
    checkNpmSpike(env),
  ]);

  for (const r of [payment, issueReplies, hnPost, npmSpike]) {
    if (r.status === "fulfilled" && r.value) alerts.push(r.value);
  }

  if (alerts.length === 0) return;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
    <div style="font-family:monospace;max-width:600px;margin:0 auto;padding:20px">
      <h2 style="color:#F7931A">VERITY — Alerta</h2>
      ${alerts.map(a => `<div style="margin:16px 0;padding:12px;border-left:3px solid #F7931A">${a}</div>`).join("")}
      <hr style="border-color:#333;margin:24px 0">
      <p style="color:#888;font-size:12px">
        Treasury: shinydapps@blink.sv &middot;
        <a href="https://l402kit.com/activity" style="color:#F7931A">Dashboard</a> &middot;
        <a href="https://l402kit.com/api/verity" style="color:#F7931A">VERITY</a>
      </p>
    </div></body></html>`;

  await sendEmail(`⚡ VERITY — ${alerts.length} alerta(s)`, html, env);
}
