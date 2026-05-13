import type { Env } from "../../worker";
import type { StoredSynthesis, CompetitorEntry } from "../radar/types";
import { dequeueAll } from "../radar/queue";
import { buildSynthesis } from "../radar/synthesis";
import { infer } from "../providers/inference";

function weekKey(): string {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week  = Math.ceil(((now.getTime() - start.getTime()) / 86_400_000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function getStrategicSummary(report: StoredSynthesis, env: Env): Promise<string> {
  const { summary, rings, topBuyers } = report;
  const topUrls = topBuyers.slice(0, 3).map(b => `- ${b.title} (${b.signal})`).join("\n") || "none";
  const highThreats = (rings.competitors as CompetitorEntry[])
    .filter(c => c.threatLevel === "high")
    .map(c => c.title)
    .join(", ") || "none";

  const prompt = `You are VERITY's strategic intelligence layer summarizing today's RADAR report for l402-kit (open-source L402 payment middleware).

Data:
- Buyers: ${summary.totalBuyers} total, ${summary.hotBuyers} hot
- Ecosystem anomalies: ${summary.hasAnomalies ? rings.ecosystem.anomalies.join("; ") : "none"}
- New competitors: ${summary.newCompetitors}, high-threat: ${highThreats}
- Partners validated: ${rings.partners}
- Top leads:
${topUrls}

Write a 3-sentence strategic summary. Be direct: what's the most important signal today, what action (if any) is warranted, and what to watch. No fluff.`;

  const result = await infer(prompt, env, {
    system: "You are a concise strategic analyst. 3 sentences max.",
    maxTokens: 200,
  });
  return result ?? "Summary unavailable.";
}

async function sendSynthesisEmail(report: StoredSynthesis, env: Env): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  const { summary, rings } = report;
  const threatBreakdown = (rings.competitors as CompetitorEntry[])
    .filter(c => c.threatLevel)
    .map(c => `  ${c.threatLevel?.toUpperCase()} — ${c.title.slice(0, 60)}`)
    .join("\n") || "  none";

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "VERITY RADAR <verity@l402kit.com>",
        to: ["thiagoyoshiaki@gmail.com"],
        subject: `[RADAR] Síntese ${report.date} — ${summary.hotBuyers} hot · ${summary.newCompetitors} competitors · ${summary.hasAnomalies ? "⚠ anomaly" : "✓ stable"}`,
        text: [
          `VERITY RADAR — Anel 5 · Síntese Diária`,
          `Date: ${report.date}`,
          ``,
          `── Estratégia ──`,
          report.strategicSummary,
          ``,
          `── Compradores ──`,
          `  Hot: ${summary.hotBuyers}  |  Total: ${summary.totalBuyers}`,
          ``,
          `── Ecossistema ──`,
          `  Anomalias: ${summary.hasAnomalies ? rings.ecosystem.anomalies.join("; ") : "nenhuma"}`,
          ``,
          `── Concorrentes (${summary.newCompetitors} novos) ──`,
          threatBreakdown,
          ``,
          `── Parceiros validados: ${rings.partners} ──`,
          ``,
          `Detalhes: GET /api/verity/admin/radar/synthesis`,
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* non-critical */ }
}

export async function runSynthesisRadar(env: Env): Promise<void> {
  try {
    const [hotHuman, warmHuman, hotAgent, warmAgent] = await Promise.all([
      dequeueAll("verity_radar:pending:human:hot", env),
      dequeueAll("verity_radar:pending:human:warm", env),
      dequeueAll("verity_radar:pending:agent:hot", env),
      dequeueAll("verity_radar:pending:agent:warm", env),
    ]);
    const buyers = [...hotHuman, ...warmHuman, ...hotAgent, ...warmAgent];

    const ecosystemRaw = await env.demo_preimages.get(`verity_radar:ecosystem:${weekKey()}`);
    const ecosystem = ecosystemRaw
      ? JSON.parse(ecosystemRaw)
      : { anomalies: [], timestamp: new Date().toISOString() };

    const competitorsRaw = await env.demo_preimages.get("verity_radar:competitors:list");
    const competitors: CompetitorEntry[] = competitorsRaw ? JSON.parse(competitorsRaw) : [];

    const partnersRaw = await env.demo_preimages.get("verity_radar:partners:list");
    const partners = partnersRaw ? JSON.parse(partnersRaw) : [];

    const base = buildSynthesis({ buyers, ecosystem, competitors, partners });
    const highThreatCompetitors = competitors.filter(c => c.threatLevel === "high").length;

    const today = new Date().toISOString().slice(0, 10);
    const report: StoredSynthesis = {
      ...base,
      summary: { ...base.summary, highThreatCompetitors },
      strategicSummary: "",
      date: today,
    };

    report.strategicSummary = await getStrategicSummary(report, env);

    await env.demo_preimages.put(
      `verity_radar:synthesis:${today}`,
      JSON.stringify(report),
      { expirationTtl: 30 * 86_400 },
    );

    await sendSynthesisEmail(report, env);

    console.log("[RADAR] synthesis:", JSON.stringify(report.summary));
  } catch (e) {
    console.error("[RADAR] synthesis error:", String(e));
  }
}