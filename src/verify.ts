import { createHash } from "crypto";
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

    // Core Lightning security: SHA256(preimage) must equal paymentHash
    const digest = createHash("sha256")
      .update(Buffer.from(preimage, "hex"))
      .digest("hex");

    return digest === payload.hash;
  } catch {
    return false;
  }
}
