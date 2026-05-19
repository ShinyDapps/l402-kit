import type { SignalStrength, Persona, QueueKey } from "./types";

/**
 * Repos / orgs que são INFRA do próprio L402 — não compram, são vizinhos.
 * (lightninglabs detém a spec; l402-protocol é o org; Fewsats mantém lista curada;
 *  refined-element/l402-requests é cliente, não comprador).
 */
const INFRA_REPO_PATTERNS = [
  /github\.com\/lightninglabs\//i,
  /github\.com\/l402-protocol\//i,
  /github\.com\/Fewsats\/awesome-/i,
  /github\.com\/refined-element\/l402-/i,
];

/**
 * Padrões de COMPETIDOR — posts promovendo SDK próprio de pay-per-call.
 * Cada par precisa casar JUNTOS no texto pra evitar falso positivo.
 */
const COMPETITOR_PATTERNS: Array<[RegExp, RegExp]> = [
  [/x402/i, /usdc|base|polygon|solana/i],            // DeepBlue / x402 promo
  [/pay[- ]per[- ]call/i, /solana|usdc|base chain/i], // Fynx-class promo
  [/we (built|are building|launched)/i, /x402/i],     // launch posts
  [/x402[- ]native/i, /./],                           // x402-native framing
];

export function isBuyerLead(link: string, title: string, snippet: string): boolean {
  if (INFRA_REPO_PATTERNS.some(rx => rx.test(link))) return false;
  const text = `${title} ${snippet}`;
  for (const [a, b] of COMPETITOR_PATTERNS) {
    if (a.test(text) && b.test(text)) return false;
  }
  return true;
}

const FRAMEWORKS = [
  "express", "fastapi", "axum", "gin", "flask", "django",
  "nextjs", "hono", "actix", "nestjs", "rails", "laravel",
];

const HOT_KEYWORDS = [
  "how do i charge", "monetize my api", "pay per call",
  "payment wall", "l402", "lightning micropayment", "pay per request",
  "charge per request", "charge per call", "pay per use",
];

const WARM_KEYWORDS = [
  "add payments", "billing", "micropayments", "api pricing",
  "rate limit", "monetize", "pay per", "pay-per",
  "charge users", "charge for", "payment", "subscription",
  "metered", "usage-based", "paywall", "invoic", "revenue model",
  "monetisation", "api gateway", "access control",
];

export function detectFramework(text: string): string | undefined {
  const lower = text.toLowerCase();
  return FRAMEWORKS.find(f => lower.includes(f));
}

export function scoreSignal(
  title: string,
  snippet: string,
  dateStr?: string,
  sourceBoost = false, // true when result comes from a targeted search query
): { score: number; signal: SignalStrength } {
  const text = `${title} ${snippet}`.toLowerCase();

  // Hot base=6 ensures final score ≥ 6 even without multipliers (hot threshold).
  // Warm base=3 reaches hot only with recency or framework multipliers.
  // Multipliers only apply when there is an initial signal (base > 1).
  let base = 1;
  if (HOT_KEYWORDS.some(w => text.includes(w)))       base = 6;
  else if (WARM_KEYWORDS.some(w => text.includes(w))) base = 3;

  let recency = 1;
  let fwMatch = 1;

  if (base > 1) {
    if (dateStr) {
      const days = (Date.now() - new Date(dateStr).getTime()) / 86_400_000;
      if (days < 7)       recency = 3;
      else if (days < 30) recency = 2;
    }
    fwMatch = detectFramework(text) ? 1.5 : 1;
  }

  const final = Math.round(base * recency * fwMatch);

  // If body content is cold but came from a targeted query, promote to warm without
  // multipliers — avoids false hot emails while still queueing relevant results.
  if (final < 3 && sourceBoost && base > 1) {
    return { score: 3, signal: "warm" };
  }

  const signal: SignalStrength = final >= 6 ? "hot" : final >= 3 ? "warm" : "cold";
  return { score: final, signal };
}

export function queueKey(persona: Persona, signal: SignalStrength): QueueKey | null {
  if (signal === "cold") return null;
  return `verity_radar:pending:${persona}:${signal}` as QueueKey;
}
