import type { Env } from "../../worker";
import { verifyL402, replayCheck, createVerityInvoice, make402, json } from "../l402";
import { getPrice, recordCall } from "../pricing";
import { searchWeb } from "../providers/search";
import { infer } from "../providers/inference";

const SERVICE = "alpha";

interface AlphaRequest {
  capital_sats?: number;
  timeframe?: "1d" | "7d" | "30d";
  risk?: "low" | "medium" | "high";
  query?: string;
}

interface AlphaOutput {
  cycle_phase: string;
  alpha_window: string;
  strategy: string;
  chain: string;
  timeframe_days: number;
  entry: string;
  exit_trigger: string;
  exit_price_btc_usd: number | null;
  position_size_pct: number | null;
  confidence: number;
  risk_level: string;
  thesis: string;
}

export async function handleVerityAlpha(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "POST required. Body: { capital_sats?, timeframe?, risk?, query? }" }, 405);
  }

  const auth = req.headers.get("Authorization") ?? "";

  if (auth.startsWith("L402 ")) {
    const { ok, reason, preimage } = await verifyL402(auth);
    if (!ok) return json({ error: reason }, 401);
    if (await replayCheck(preimage!, env)) return json({ error: "Token already used" }, 401);

    const body = await req.json().catch(() => ({})) as AlphaRequest;
    const capital_sats = body.capital_sats ?? 100_000;
    const timeframe = body.timeframe ?? "7d";
    const risk = body.risk ?? "medium";
    const query = (body.query ?? "").trim();

    const timeframeDays: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30 };
    const days = timeframeDays[timeframe] ?? 7;

    // 1. BTC price for cycle context + position sizing in USD
    let btcUsd = 0;
    let btcChange24h = 0;
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
      );
      const data = await res.json() as { bitcoin?: { usd?: number; usd_24h_change?: number } };
      btcUsd = data?.bitcoin?.usd ?? 0;
      btcChange24h = data?.bitcoin?.usd_24h_change ?? 0;
    } catch { /* non-fatal — synthesis continues without price */ }

    const capitalUsd = btcUsd > 0 ? ((capital_sats / 100_000_000) * btcUsd).toFixed(2) : null;

    // 2. Two parallel searches: current narratives + yield/alpha strategies
    const baseQuery = query || `crypto alpha DeFi L2 ${new Date().getFullYear()}`;
    const [narrativeSearch, strategySearch] = await Promise.all([
      searchWeb(baseQuery, env),
      searchWeb(`best on-chain yield strategy ${timeframe} ${new Date().getFullYear()}`, env),
    ]);

    const narrativeText = [
      ...(narrativeSearch?.results ?? []).slice(0, 3),
      ...(strategySearch?.results ?? []).slice(0, 2),
    ].map(r => `- ${r.title}: ${r.snippet}`).join("\n") || "No search results available.";

    // 3. Strategist synthesis
    const maxPositionPct = risk === "low" ? 10 : risk === "medium" ? 25 : 50;
    const prompt = `You are VERITY, a crypto-native strategist. Your archetype: protocol engineer + capital allocator + market intelligence. You identify asymmetric alpha windows before they become crowded. You read protocols like code and markets like balance sheets.

Current market context:
- BTC price: ${btcUsd > 0 ? `$${btcUsd.toLocaleString()} (${btcChange24h >= 0 ? "+" : ""}${btcChange24h.toFixed(1)}% 24h)` : "unavailable"}
- Analysis date: ${new Date().toISOString().slice(0, 10)}

Recent market narratives and strategies:
${narrativeText}

User parameters:
- Available capital: ${capital_sats.toLocaleString()} sats${capitalUsd ? ` (~$${capitalUsd})` : ""}
- Timeframe: ${timeframe} (${days} days)
- Risk tolerance: ${risk} (max position size: ${maxPositionPct}% of capital)
${query ? `- Specific focus: ${query}` : ""}

Respond ONLY with a valid JSON object — no markdown fences, no text outside the JSON:
{
  "cycle_phase": "accumulation|early_bull|late_bull|distribution|bear",
  "alpha_window": "open|narrowing|closed",
  "strategy": "one specific actionable sentence describing exactly what to do",
  "chain": "chain or protocol name (e.g. Base, Solana, Bitcoin/Lightning)",
  "timeframe_days": ${days},
  "entry": "specific entry conditions — price level, TVL trigger, or event-based",
  "exit_trigger": "specific exit conditions — price target, event, or time stop",
  "exit_price_btc_usd": null or a number if a BTC price target in USD is applicable,
  "position_size_pct": a number between 1 and ${maxPositionPct} respecting risk tolerance,
  "confidence": a number between 0.0 and 1.0,
  "risk_level": "${risk}",
  "thesis": "2-3 sentences: what is the opportunity, why the window is open or closing, what single event would invalidate this thesis"
}`;

    const raw = await infer(prompt, env);

    let alpha: AlphaOutput | null = null;
    if (raw) {
      try {
        const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
        alpha = JSON.parse(cleaned) as AlphaOutput;
      } catch { /* fall through to raw synthesis */ }
    }

    await recordCall(SERVICE, env);

    const sources = [
      ...(narrativeSearch?.results ?? []).slice(0, 3),
      ...(strategySearch?.results ?? []).slice(0, 2),
    ].map(r => ({ title: r.title, link: r.link }));

    if (alpha) {
      return json({
        agent: "VERITY",
        service: SERVICE,
        input: { capital_sats, timeframe, risk, ...(query && { query }) },
        btc_price_usd: btcUsd || null,
        btc_change_24h_pct: btcUsd ? btcChange24h : null,
        ...alpha,
        timeframe_days: days, // handler is authoritative — AI output may drift
        sources,
        paid_with: "⚡ Lightning L402",
      });
    }

    return json({
      agent: "VERITY",
      service: SERVICE,
      input: { capital_sats, timeframe, risk, ...(query && { query }) },
      btc_price_usd: btcUsd || null,
      synthesis: raw ?? "Unable to generate alpha analysis at this time.",
      sources,
      paid_with: "⚡ Lightning L402",
    });
  }

  const price = await getPrice(SERVICE, env);
  const inv = await createVerityInvoice(price, env);
  if (!inv) return json({ error: "Lightning provider unavailable" }, 503);
  return make402(SERVICE, price, inv);
}
