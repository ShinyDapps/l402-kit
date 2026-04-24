use base64::{engine::general_purpose, Engine as _};
use l402kit::{check_and_mark_preimage, parse_token, verify_token, Invoice, LightningProvider, Options};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

// ─── Helpers ─────────────────────────────────────────────────────────────────

static COUNTER: AtomicU64 = AtomicU64::new(100);

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

fn make_token_with_extra(exp_offset_ms: i64, extra_key: &str, extra_val: &str) -> String {
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

    let payload = serde_json::json!({ "hash": hash, "exp": exp, extra_key: extra_val });
    let macaroon = general_purpose::STANDARD.encode(payload.to_string());

    format!("{macaroon}:{preimage}")
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

// ─── parse_token ─────────────────────────────────────────────────────────────

#[test]
fn test_parse_token_valid() {
    let t = parse_token("abc123:def456").expect("should parse");
    assert_eq!(t.macaroon, "abc123");
    assert_eq!(t.preimage, "def456");
}

#[test]
fn test_parse_token_splits_on_last_colon() {
    let t = parse_token("abc:def:ghi").expect("should parse");
    assert_eq!(t.macaroon, "abc:def");
    assert_eq!(t.preimage, "ghi");
}

#[test]
fn test_parse_token_multiple_colons() {
    let t = parse_token("a:b:c:d:preimage").expect("should parse");
    assert_eq!(t.preimage, "preimage");
}

#[test]
fn test_parse_token_no_colon() {
    assert!(parse_token("nodivider").is_err());
}

#[test]
fn test_parse_token_empty_string() {
    assert!(parse_token("").is_err());
}

#[test]
fn test_parse_token_preserves_exact_chars() {
    let t = parse_token("eyJoYXNocg==:abc123def456").expect("should parse");
    assert_eq!(t.macaroon, "eyJoYXNocg==");
    assert_eq!(t.preimage, "abc123def456");
}

// ─── verify_token ─────────────────────────────────────────────────────────────

#[test]
fn test_verify_token_valid() {
    let token = make_token(3_600_000);
    assert!(verify_token(&token), "valid token should pass");
}

#[test]
fn test_verify_token_valid_far_future() {
    let token = make_token(365 * 24 * 3_600_000);
    assert!(verify_token(&token), "far-future expiry should pass");
}

#[test]
fn test_verify_token_extra_fields_forwards_compat() {
    let token = make_token_with_extra(3_600_000, "version", "2");
    assert!(verify_token(&token), "extra fields should not break verification");
}

#[test]
fn test_verify_token_expired_1s() {
    let token = make_token(-1_000);
    assert!(!verify_token(&token), "expired token should fail");
}

#[test]
fn test_verify_token_expired_1h() {
    let token = make_token(-3_600_000);
    assert!(!verify_token(&token), "token expired 1h ago should fail");
}

#[test]
fn test_verify_token_exp_zero() {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut preimage_bytes = [0u8; 32];
    preimage_bytes[..8].copy_from_slice(&n.to_le_bytes());
    let preimage = hex::encode(preimage_bytes);
    let mut hasher = Sha256::new();
    hasher.update(preimage_bytes);
    let hash = hex::encode(hasher.finalize());

    let payload = serde_json::json!({ "hash": hash, "exp": 0i64 });
    let macaroon = general_purpose::STANDARD.encode(payload.to_string());
    assert!(!verify_token(&format!("{macaroon}:{preimage}")), "exp=0 should fail");
}

#[test]
fn test_verify_token_wrong_preimage() {
    let token = make_token(3_600_000);
    let mut chars: Vec<char> = token.chars().collect();
    let last = chars.len() - 1;
    chars[last] = if chars[last] == 'a' { 'b' } else { 'a' };
    let tampered: String = chars.into_iter().collect();
    assert!(!verify_token(&tampered), "tampered token should fail");
}

#[test]
fn test_verify_token_all_zeros_preimage() {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut preimage_bytes = [0u8; 32];
    preimage_bytes[..8].copy_from_slice(&n.to_le_bytes());
    let mut hasher = Sha256::new();
    hasher.update(preimage_bytes);
    let hash = hex::encode(hasher.finalize());
    let payload = serde_json::json!({ "hash": hash, "exp": now_ms() + 3_600_000 });
    let macaroon = general_purpose::STANDARD.encode(payload.to_string());
    let zeros = "0".repeat(64);
    assert!(!verify_token(&format!("{macaroon}:{zeros}")), "all-zeros preimage should fail");
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

#[test]
fn test_verify_token_missing_hash_field() {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let payload = serde_json::json!({ "exp": now_ms() + 3_600_000, "n": n });
    let macaroon = general_purpose::STANDARD.encode(payload.to_string());
    let preimage = "a".repeat(64);
    assert!(!verify_token(&format!("{macaroon}:{preimage}")));
}

#[test]
fn test_verify_token_missing_exp_field() {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut preimage_bytes = [0u8; 32];
    preimage_bytes[..8].copy_from_slice(&n.to_le_bytes());
    let preimage = hex::encode(preimage_bytes);
    let mut hasher = Sha256::new();
    hasher.update(preimage_bytes);
    let hash = hex::encode(hasher.finalize());
    let payload = serde_json::json!({ "hash": hash });
    let macaroon = general_purpose::STANDARD.encode(payload.to_string());
    assert!(!verify_token(&format!("{macaroon}:{preimage}")));
}

#[test]
fn test_verify_token_invalid_base64_macaroon() {
    let preimage = "a".repeat(64);
    assert!(!verify_token(&format!("!!!notbase64!!!:{preimage}")));
}

#[test]
fn test_verify_token_macaroon_not_json() {
    let macaroon = general_purpose::STANDARD.encode("not json at all");
    let preimage = "a".repeat(64);
    assert!(!verify_token(&format!("{macaroon}:{preimage}")));
}

// ─── Replay protection ────────────────────────────────────────────────────────

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

#[test]
fn test_replay_third_use_blocked() {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut bytes = [0u8; 32];
    bytes[..8].copy_from_slice(&n.to_le_bytes());
    let preimage = hex::encode(bytes);
    check_and_mark_preimage(&preimage);
    check_and_mark_preimage(&preimage);
    assert!(!check_and_mark_preimage(&preimage), "third use should be blocked");
}

#[test]
fn test_replay_different_preimages_independent() {
    let n1 = COUNTER.fetch_add(1, Ordering::Relaxed);
    let n2 = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut b1 = [0u8; 32];
    let mut b2 = [0u8; 32];
    b1[..8].copy_from_slice(&n1.to_le_bytes());
    b2[..8].copy_from_slice(&n2.to_le_bytes());
    let p1 = hex::encode(b1);
    let p2 = hex::encode(b2);
    assert!(check_and_mark_preimage(&p1));
    assert!(check_and_mark_preimage(&p2));
    assert!(!check_and_mark_preimage(&p1));
    assert!(!check_and_mark_preimage(&p2));
}

#[test]
fn test_replay_concurrent_same_preimage_exactly_one_succeeds() {
    use std::sync::atomic::AtomicUsize;
    use std::thread;

    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut bytes = [0u8; 32];
    bytes[..8].copy_from_slice(&n.to_le_bytes());
    let preimage = hex::encode(bytes);

    let success_count = Arc::new(AtomicUsize::new(0));
    let mut handles = vec![];

    for _ in 0..20 {
        let p = preimage.clone();
        let counter = Arc::clone(&success_count);
        handles.push(thread::spawn(move || {
            if check_and_mark_preimage(&p) {
                counter.fetch_add(1, Ordering::Relaxed);
            }
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    assert_eq!(
        success_count.load(Ordering::Relaxed),
        1,
        "exactly one concurrent use should succeed"
    );
}

// ─── Middleware (axum) ────────────────────────────────────────────────────────

#[cfg(feature = "axum-middleware")]
mod middleware_tests {
    use super::*;
    use axum::{body::Body, http::Request, middleware, routing::get, Router};
    use l402kit::l402_middleware;
    use tower::ServiceExt;

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
            Options::new(10, Arc::new(MockProvider)),
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
    async fn test_empty_auth_returns_402() {
        let app = test_app();
        let req = Request::builder()
            .uri("/api/data")
            .header("Authorization", "")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), axum::http::StatusCode::PAYMENT_REQUIRED);
    }

    #[tokio::test]
    async fn test_bearer_scheme_returns_402() {
        let app = test_app();
        let token = make_token(3_600_000);
        let req = Request::builder()
            .uri("/api/data")
            .header("Authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), axum::http::StatusCode::PAYMENT_REQUIRED);
    }

    #[tokio::test]
    async fn test_garbage_token_returns_402() {
        let app = test_app();
        let req = Request::builder()
            .uri("/api/data")
            .header("Authorization", "L402 garbage!!!123")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), axum::http::StatusCode::PAYMENT_REQUIRED);
    }

    #[tokio::test]
    async fn test_expired_token_returns_402() {
        let app = test_app();
        let token = make_token(-1_000);
        let req = Request::builder()
            .uri("/api/data")
            .header("Authorization", format!("L402 {token}"))
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), axum::http::StatusCode::PAYMENT_REQUIRED);
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

        let first = app.clone().oneshot(make_req()).await.unwrap();
        assert_eq!(first.status(), axum::http::StatusCode::OK);

        let second = app.oneshot(make_req()).await.unwrap();
        assert_eq!(second.status(), axum::http::StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_different_valid_tokens_both_succeed() {
        let app = test_app();
        let token1 = make_token(3_600_000);
        let token2 = make_token(3_600_000);

        let req1 = Request::builder()
            .uri("/api/data")
            .header("Authorization", format!("L402 {token1}"))
            .body(Body::empty())
            .unwrap();
        let req2 = Request::builder()
            .uri("/api/data")
            .header("Authorization", format!("L402 {token2}"))
            .body(Body::empty())
            .unwrap();

        let (r1, r2) = tokio::join!(
            app.clone().oneshot(req1),
            app.clone().oneshot(req2),
        );
        assert_eq!(r1.unwrap().status(), axum::http::StatusCode::OK);
        assert_eq!(r2.unwrap().status(), axum::http::StatusCode::OK);
    }
}
