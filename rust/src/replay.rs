use once_cell::sync::Lazy;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::sync::Mutex;

// In-memory anti-replay store.
// For multi-instance deployments, replace with Redis or a shared database.
static REPLAY_STORE: Lazy<Mutex<HashSet<String>>> =
    Lazy::new(|| Mutex::new(HashSet::new()));

/// Returns `true` if the preimage has NOT been seen before, and atomically
/// marks it as used. Returns `false` if the preimage was already used (replay attack).
pub fn check_and_mark_preimage(preimage: &str) -> bool {
    let mut hasher = Sha256::new();
    hasher.update(preimage.as_bytes());
    let key = hex::encode(hasher.finalize());

    let mut store = REPLAY_STORE.lock().unwrap_or_else(|e| e.into_inner());

    if store.contains(&key) {
        return false;
    }
    store.insert(key);
    true
}
