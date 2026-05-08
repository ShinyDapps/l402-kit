import { createHash, timingSafeEqual } from "crypto";
import type { L402Token } from "./types";

export function parseToken(token: string): L402Token {
  const colonIdx = token.lastIndexOf(":");
  if (colonIdx === -1) throw new Error("Invalid L402 token format");
  return {
    macaroon: token.slice(0, colonIdx),
    preimage: token.slice(colonIdx + 1),
  };
}

/**
 * Verifies an L402 token with real cryptographic checks:
 * 1. SHA256(preimage) must equal paymentHash encoded in macaroon
 * 2. Token must not be expired
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    // Reject oversized tokens before any parsing — prevents memory/CPU DoS
    if (token.length > 4096) return false;

    const { macaroon, preimage } = parseToken(token);

    // Preimage must be 32 bytes = 64 hex chars
    if (!macaroon || !/^[0-9a-f]{64}$/i.test(preimage)) return false;

    // Decode macaroon
    const payload = JSON.parse(Buffer.from(macaroon, "base64").toString("utf8")) as {
      hash?: string;
      exp?: number;
    };

    if (!payload.hash || !payload.exp) return false;

    // Check expiry (payload.exp is stored in milliseconds)
    if (Date.now() > payload.exp) return false;

    // Cap: reject tokens with expiry more than 2 hours in the future from now.
    // Prevents forged tokens with far-future exp from being valid indefinitely.
    const MAX_EXP_MS = 2 * 60 * 60 * 1000; // 2 hours
    if (payload.exp > Date.now() + MAX_EXP_MS) return false;

    // Core Lightning security: SHA256(preimage) must equal paymentHash
    const digest = createHash("sha256")
      .update(Buffer.from(preimage, "hex"))
      .digest("hex");

    if (digest.length !== payload.hash.length) return false;
    return timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(payload.hash, "hex"));
  } catch {
    return false;
  }
}
