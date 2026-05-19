use base64::{engine::general_purpose, Engine as _};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};
use subtle::ConstantTimeEq;

use crate::{errors::L402Error, types::L402Token};

/// Reject oversized tokens before parsing (DoS guard) — parity with TS SDK.
const MAX_TOKEN_LEN: usize = 4096;
/// Cap on how far in the future a token may claim to expire. Mirrors the
/// TS SDK's 2-hour `MAX_EXP_MS` — prevents forged tokens with absurd `exp`.
const MAX_EXP_MS: u64 = 2 * 60 * 60 * 1000;

#[derive(Deserialize)]
struct MacaroonPayload {
    hash: String,
    exp: u64, // milliseconds since epoch
}

/// Splits an L402 token string `"macaroon:preimage"` into its components.
pub fn parse_token(token: &str) -> Result<L402Token, L402Error> {
    let idx = token.rfind(':').ok_or(L402Error::InvalidTokenFormat)?;
    Ok(L402Token {
        macaroon: token[..idx].to_string(),
        preimage: token[idx + 1..].to_string(),
    })
}

/// Verifies an L402 token with real cryptographic checks:
/// 1. Token length within `MAX_TOKEN_LEN` (DoS guard).
/// 2. Preimage must be 32 bytes (64 hex chars).
/// 3. Token must not be expired AND must expire within `MAX_EXP_MS` from now.
/// 4. `SHA256(preimage)` must equal the `paymentHash` stored in the macaroon
///    (constant-time compare via `subtle`).
pub fn verify_token(token: &str) -> bool {
    if token.len() > MAX_TOKEN_LEN {
        return false;
    }

    let Ok(t) = parse_token(token) else {
        return false;
    };

    // Preimage must be exactly 64 hex chars (32 bytes)
    if t.preimage.len() != 64 {
        return false;
    }
    let Ok(preimage_bytes) = hex::decode(&t.preimage) else {
        return false;
    };

    // Decode macaroon: base64 → JSON
    let raw = general_purpose::STANDARD
        .decode(&t.macaroon)
        .or_else(|_| general_purpose::URL_SAFE.decode(&t.macaroon));
    let Ok(raw) = raw else {
        return false;
    };

    let Ok(payload) = serde_json::from_slice::<MacaroonPayload>(&raw) else {
        return false;
    };

    if payload.hash.is_empty() || payload.exp == 0 {
        return false;
    }

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    if now_ms > payload.exp {
        return false;
    }
    // Forward-cap: reject tokens with exp more than 2h in the future
    if payload.exp > now_ms.saturating_add(MAX_EXP_MS) {
        return false;
    }

    // Core Lightning security: SHA256(preimage) must equal paymentHash
    let mut hasher = Sha256::new();
    hasher.update(&preimage_bytes);
    let digest = hex::encode(hasher.finalize());

    // Constant-time compare to defeat hash-prefix side-channel attacks
    if digest.len() != payload.hash.len() {
        return false;
    }
    digest.as_bytes().ct_eq(payload.hash.as_bytes()).into()
}
