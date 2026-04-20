import { createHash } from "crypto";

// In-memory store — para produção com múltiplos servidores, use Redis ou Supabase
const usedPreimages = new Set<string>();

/**
 * Returns true if the preimage was NOT yet seen (first use).
 * Marks it as used atomically.
 */
export function checkAndMarkPreimage(preimage: string): boolean {
  const key = createHash("sha256").update(preimage).digest("hex");
  if (usedPreimages.has(key)) return false;
  usedPreimages.add(key);
  return true;
}
