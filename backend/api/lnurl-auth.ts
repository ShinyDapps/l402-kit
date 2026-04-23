/**
 * LNURL-auth endpoint — proves Lightning wallet ownership before destructive operations.
 *
 * Three modes (all GET):
 *   ?lightningAddress=<addr>      → generate k1 challenge, return { k1, lnurl }
 *   ?tag=login&k1=&sig=&key=      → wallet callback (LNURL-auth spec), verify secp256k1
 *   ?poll=<k1>                    → client polls; returns { verified, token } on success
 *
 * Supabase table required:
 *   CREATE TABLE lnurl_challenges (
 *     k1                TEXT PRIMARY KEY,
 *     lightning_address TEXT,
 *     verified          BOOLEAN NOT NULL DEFAULT FALSE,
 *     pubkey            TEXT,
 *     token             TEXT,
 *     token_expires_at  TIMESTAMPTZ,
 *     expires_at        TIMESTAMPTZ NOT NULL,
 *     created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 *   ALTER TABLE lnurl_challenges ENABLE ROW LEVEL SECURITY;
 *   -- no anon policies: only service_role can read/write
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bech32 } from "bech32";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

const CHALLENGE_TTL_MS = 5 * 60 * 1_000;  // 5 min to scan + sign
const TOKEN_TTL_MS     = 10 * 60 * 1_000; // 10 min to use the deletion token

// ── Helpers ──────────────────────────────────────────────────────────────────

function encodeAsLnurl(url: string): string {
  const words = bech32.toWords(Buffer.from(url, "utf8"));
  return bech32.encode("lnurl", words, 1023).toUpperCase();
}

async function sbFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) ?? {}),
    },
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { tag, k1: k1Param, sig, key, poll, lightningAddress } =
    req.query as Record<string, string>;

  // ── Mode 1: Generate challenge ────────────────────────────────────────────
  if (!tag && !poll) {
    if (!lightningAddress || !lightningAddress.includes("@")) {
      return res.status(400).json({ error: "lightningAddress required (user@domain)" });
    }

    const k1 = randomBytes(32).toString("hex");
    const host = req.headers.host ?? "l402kit.vercel.app";
    const callbackUrl = `https://${host}/api/lnurl-auth?tag=login&k1=${k1}`;
    const lnurl = encodeAsLnurl(callbackUrl);
    const expires_at = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

    const insert = await sbFetch("/lnurl_challenges", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        k1,
        lightning_address: lightningAddress.trim().toLowerCase(),
        expires_at,
      }),
    });

    if (!insert.ok) {
      console.error("[lnurl-auth] insert failed:", insert.status, await insert.text());
      return res.status(500).json({ error: "Failed to create challenge" });
    }

    return res.status(200).json({ k1, lnurl });
  }

  // ── Mode 2: Wallet callback (LNURL-auth spec) ─────────────────────────────
  if (tag === "login") {
    if (!k1Param || !sig || !key) {
      return res.status(400).json({ status: "ERROR", reason: "Missing k1, sig, or key" });
    }

    // Load challenge
    const lookup = await sbFetch(
      `/lnurl_challenges?k1=eq.${encodeURIComponent(k1Param)}&select=k1,expires_at,verified&limit=1`
    );
    const rows = (await lookup.json()) as {
      k1: string; expires_at: string; verified: boolean;
    }[];
    const challenge = rows[0];

    if (!challenge) {
      return res.status(400).json({ status: "ERROR", reason: "Unknown challenge" });
    }
    if (new Date(challenge.expires_at) < new Date()) {
      return res.status(400).json({ status: "ERROR", reason: "Challenge expired" });
    }
    if (challenge.verified) {
      return res.status(200).json({ status: "OK" }); // idempotent
    }

    // Verify secp256k1 DER signature
    let valid = false;
    try {
      // Uint8Array.from produces Uint8Array<ArrayBuffer>; Buffer extends Uint8Array<ArrayBufferLike>
      // and TypeScript strict mode rejects Buffer as Uint8Array here even though they match at runtime.
      const toU8 = (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
      valid = secp256k1.verify(toU8(sig), toU8(k1Param), toU8(key));
    } catch {
      return res.status(400).json({ status: "ERROR", reason: "Invalid signature encoding" });
    }

    if (!valid) {
      return res.status(400).json({ status: "ERROR", reason: "Signature verification failed" });
    }

    // Issue single-use deletion token
    const token = randomBytes(32).toString("hex");
    const token_expires_at = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    await sbFetch(`/lnurl_challenges?k1=eq.${encodeURIComponent(k1Param)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ verified: true, pubkey: key, token, token_expires_at }),
    });

    return res.status(200).json({ status: "OK" });
  }

  // ── Mode 3: Client polls for result ──────────────────────────────────────
  if (poll) {
    const lookup = await sbFetch(
      `/lnurl_challenges?k1=eq.${encodeURIComponent(poll)}&select=verified,token,token_expires_at&limit=1`
    );
    const rows = (await lookup.json()) as {
      verified: boolean; token: string | null; token_expires_at: string | null;
    }[];
    const row = rows[0];

    if (!row) return res.status(404).json({ error: "Challenge not found" });
    if (!row.verified || !row.token) return res.status(200).json({ verified: false });

    if (row.token_expires_at && new Date(row.token_expires_at) < new Date()) {
      return res.status(200).json({ verified: false, reason: "Token expired — restart flow" });
    }

    return res.status(200).json({ verified: true, token: row.token });
  }

  return res.status(400).json({ error: "Invalid request" });
}
