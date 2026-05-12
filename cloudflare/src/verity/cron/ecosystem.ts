import type { Env } from "../../worker";
import { buildEcosystemReport } from "../radar/ecosystem";

const NPM_PACKAGE  = "l402-kit";
const GITHUB_OWNER = "ShinyDapps";
const GITHUB_REPO  = "l402-kit";

function weekKey(offsetWeeks = 0): string {
  const now   = new Date(Date.now() - offsetWeeks * 7 * 86_400_000);
  const start = new Date(now.getFullYear(), 0, 1);
  const week  = Math.ceil(((now.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function fetchNpmDownloads(): Promise<number> {
  try {
    const r = await fetch(
      `https://api.npmjs.org/downloads/point/last-week/${NPM_PACKAGE}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) return 0;
    const d = await r.json() as { downloads?: number };
    return d.downloads ?? 0;
  } catch { return 0; }
}

async function fetchGitHubStats(): Promise<{ stars: number; forks: number }> {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
      { headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "VERITY-RADAR/1.0" }, signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) return { stars: 0, forks: 0 };
    const d = await r.json() as { stargazers_count?: number; forks_count?: number };
    return { stars: d.stargazers_count ?? 0, forks: d.forks_count ?? 0 };
  } catch { return { stars: 0, forks: 0 }; }
}

async function loadHistory(metric: string, env: Env): Promise<number[]> {
  const weeks: number[] = [];
  for (let i = 1; i <= 4; i++) {
    const raw = await env.demo_preimages.get(`verity_radar:ecosystem:snapshot:${weekKey(i)}`);
    if (!raw) break;
    const snap = JSON.parse(raw) as Record<string, number>;
    weeks.push(snap[metric] ?? 0);
  }
  return weeks;
}

async function sendAnomalyEmail(anomalies: string[], env: Env): Promise<void> {
  if (!env.RESEND_API_KEY || anomalies.length === 0) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "VERITY RADAR <verity@l402kit.com>",
        to: ["thiagoyoshiaki@gmail.com"],
        subject: `[RADAR] Anomalia no ecossistema: ${anomalies.join(", ")}`,
        text: `VERITY RADAR — Anel 3 · Ecossistema\n\nAnomalias detectadas (>25% vs média 4 semanas):\n${anomalies.map(a => `  • ${a}`).join("\n")}\n\nSemana: ${weekKey()}`,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* non-critical */ }
}

export async function runEcosystemRadar(env: Env): Promise<void> {
  try {
    const [npmDownloads, { stars: githubStars, forks: githubForks }] = await Promise.all([
      fetchNpmDownloads(),
      fetchGitHubStats(),
    ]);

    // Save this week's snapshot
    const week = weekKey();
    await env.demo_preimages.put(
      `verity_radar:ecosystem:snapshot:${week}`,
      JSON.stringify({ npmDownloads, githubStars, githubForks }),
      { expirationTtl: 35 * 86_400 }, // 5 weeks
    );

    // Build anomaly report from 4-week history
    const [npmHistory, starsHistory, forksHistory] = await Promise.all([
      loadHistory("npmDownloads", env),
      loadHistory("githubStars",  env),
      loadHistory("githubForks",  env),
    ]);

    const report = buildEcosystemReport({
      npmDownloads: { history: npmHistory, current: npmDownloads },
      githubStars:  { history: starsHistory,  current: githubStars  },
      githubForks:  { history: forksHistory,  current: githubForks  },
    });

    await env.demo_preimages.put(
      `verity_radar:ecosystem:${week}`,
      JSON.stringify(report),
      { expirationTtl: 35 * 86_400 },
    );

    if (report.anomalies.length > 0) {
      await sendAnomalyEmail(report.anomalies, env);
    }

    console.log("[RADAR] ecosystem:", JSON.stringify({ week, npmDownloads, githubStars, githubForks, anomalies: report.anomalies }));
  } catch (e) {
    console.error("[RADAR] ecosystem error:", String(e));
  }
}
