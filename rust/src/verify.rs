use base64::{engine::general_purpose, Engine as _};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{errors::L402Error, types::L402Token};

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
/// 1. Preimage must be 32 bytes (64 hex chars).
/// 2. Token must not be expired.
/// 3. `SHA256(preimage)` must equal the `paymentHash` stored in the macaroon.
pub fn verify_token(token: &str) -> bool {
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

    // Check expiry
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    if now_ms > payload.exp {
        return false;
    }

    // Core Lightning security: SHA256(preimage) must equal paymentHash
    let mut hasher = Sha256::new();
    hasher.update(&preimage_bytes);
    let digest = hex::encode(hasher.finalize());

    digest == payload.hash
}
