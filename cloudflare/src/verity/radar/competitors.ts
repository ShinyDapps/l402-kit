const KEYWORDS = ["l402", "x402", "lightning micropayment", "pay-per-call api"];
const EXCLUDED  = ["stripe", "paypal", "shopify", "square"];

export function isCompetitorRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  return KEYWORDS.some(k => lower.includes(k));
  // Note: excluded brands only matter when no keyword is present.
  // If l402 is mentioned alongside Stripe, that's still a relevant competitor signal.
}

export function competitorHash(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

// Kept for documentation — EXCLUDED is used by the caller to pre-filter queries,
// not by isCompetitorRelevant itself (keyword presence wins over brand exclusion).
export const EXCLUDED_BRANDS = EXCLUDED;
