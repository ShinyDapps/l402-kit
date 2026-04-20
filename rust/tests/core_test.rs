use base64::{engine::general_purpose, Engine as _};
use l402kit::{check_and_mark_preimage, parse_token, verify_token, Invoice, LightningProvider, Options};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

// --- Helpers ---

static COUNTER: AtomicU64 = AtomicU64::new(100);

/// Builds a valid L402 token with a unique preimage. exp_offset_ms can be negative (expired).
fn make_token(exp_offset_ms: i64) -> String {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut preimage_bytes = [0u8; 32];
    preimage_bytes[..8].copy_from_slice(&n.to_le_bytes());
    let preimage = hex::encode(preimage_bytes);

    let mut hasher = Sha256::new();
    hasher.update(preimage_bytes);
    let hash = hex::encode(hasher.finalize());

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let exp = now_ms + exp_offset_ms;

    let payload = serde_json::json!({ "hash": hash, "exp": exp });
    let macaroon = general_purpose::STANDARD.encode(payload.to_string());

    format!("{macaroon}:{preimage}")
}

// --- ParseToken ---

#[test]
fn test_parse_token_valid() {
    let t = parse_token("abc123:def456").expect("should parse");
    assert_eq!(t.macaroon, "abc123");
    assert_eq!(t.preimage, "def456");
}

#[test]
fn test_parse_token_no_colon() {
    assert!(parse_token("nodivider").is_err());
}

// --- VerifyToken ---

#[test]
fn test_verify_token_valid() {
    let token = make_token(3_600_000);
    assert!(verify_token(&token), "valid token should pass");
}

#[test]
fn test_verify_token_expired() {
    let token = make_token(-1_000);
    assert!(!verify_token(&token), "expired token should fail");
}

#[test]
fn test_verify_token_wrong_preimage() {
    let token = make_token(3_600_000);
    // Flip last char of preimage
    let mut chars: Vec<char> = token.chars().collect();
    let last = chars.len() - 1;
    chars[last] = if chars[last] == 'a' { 'b' } else { 'a' };
    let tampered: String = chars.into_iter().collect();
    assert!(!verify_token(&tampered), "tampered token should fail");
}

#[test]
fn test_verify_token_short_preimage() {
    assert!(!verify_token("somemacaroon:abc"));
}

#[test]
fn test_verify_token_garbage() {
    assert!(!verify_token("notavalidtoken"));
}

#[test]
fn test_verify_token_empty() {
    assert!(!verify_token(""));
}

// --- Replay protection ---

#[test]
fn test_replay_first_use_allowed() {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut bytes = [0u8; 32];
    bytes[..8].copy_from_slice(&n.to_le_bytes());
    let preimage = hex::encode(bytes);
    assert!(check_and_mark_preimage(&preimage), "first use should be allowed");
}

#[test]
fn test_replay_second_use_blocked() {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut bytes = [0u8; 32];
    bytes[..8].copy_from_slice(&n.to_le_bytes());
    let preimage = hex::encode(bytes);
    check_and_mark_preimage(&preimage);
    assert!(!check_and_mark_preimage(&preimage), "second use should be blocked");
}

// --- Middleware (axum) ---

#[cfg(feature = "axum-middleware")]
mod middleware_tests {
    use super::*;
    use axum::{body::Body, http::Request, middleware, routing::get, Router};
    use l402kit::l402_middleware;
    use tower::ServiceExt; // .oneshot()

    struct MockProvider;

    impl LightningProvider for MockProvider {
        fn create_invoice<'a>(
            &'a self,
            amount_sats: u64,
        ) -> l402kit::BoxFuture<'a, Result<Invoice, l402kit::L402Error>> {
            Box::pin(async move {
                Ok(Invoice {
                    payment_request: "lnbc10n1...".to_string(),
                    payment_hash: "mockhash".to_string(),
                    macaroon: "mockmacaroon".to_string(),
                    amount_sats,
                })
            })
        }
    }

    fn test_app() -> Router {
        let opts = Arc::new(
            Options::new(10).with_provider(Arc::new(MockProvider)),
        );
        Router::new()
            .route("/api/data", get(|| async { "ok" }))
            .route_layer(middleware::from_fn_with_state(opts, l402_middleware))
    }

    #[tokio::test]
    async fn test_no_token_returns_402() {
        let app = test_app();
        let req = Request::builder()
            .uri("/api/data")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), axum::http::StatusCode::PAYMENT_REQUIRED);
        assert!(resp.headers().contains_key("www-authenticate"));
    }

    #[tokio::test]
    async fn test_valid_token_returns_200() {
        let app = test_app();
        let token = make_token(3_600_000);
        let req = Request::builder()
            .uri("/api/data")
            .header("Authorization", format!("L402 {token}"))
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), axum::http::StatusCode::OK);
    }

    #[tokio::test]
    async fn test_replayed_token_returns_401() {
        let app = test_app();
        let token = make_token(3_600_000);

        let make_req = || {
            Request::builder()
                .uri("/api/data")
                .header("Authorization", format!("L402 {token}"))
                .body(Body::empty())
                .unwrap()
        };

        // First request should succeed
        let first = app.clone().oneshot(make_req()).await.unwrap();
        assert_eq!(first.status(), axum::http::StatusCode::OK);

        // Replay should be blocked
        let second = app.oneshot(make_req()).await.unwrap();
        assert_eq!(second.status(), axum::http::StatusCode::UNAUTHORIZED);
    }
}
