/**
 * LNURL-auth endpoint — proves Lightning wallet ownership.
 *
 * Three modes (all GET):
 *   ?lightningAddress=<addr>      → delete flow: generate k1 challenge
 *   ?dashboard=1                  → dashboard login: generate k1 (no address needed)
 *   ?tag=login&k1=&sig=&key=      → wallet callback (LNURL-auth spec), verify secp256k1
 *   ?poll=<k1>                    → client polls; returns { verified, token }
 *
 * Dashboard mode:
 *   Only the wallet whose pubkey matches OWNER_PUBKEY env var can authenticate.
 *   Token TTL is 24 h (vs 10 min for delete tokens).
 *
 * Supabase table required — run supabase/schema.sql:
 *   lnurl_challenges (k1, lightning_address, verified, pubkey, token,
 *                     token_expires_at, expires_at, created_at)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
export default function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse>;
//# sourceMappingURL=lnurl-auth.d.ts.map