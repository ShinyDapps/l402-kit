//! LAW-N adapter — forwards L402 behavioral events to a LAW-N ingest endpoint.
//!
//! Port of TS src/integrations/law-n-adapter.ts. Contract:
//!   - Transport: POST JSON over HTTPS
//!   - Auth: HMAC-SHA256 in `X-LAW-N-Signature: sha256=<hex>` header
//!   - Per-call random hex `X-LAW-N-Request-Id` for tracing
//!   - Delivery: fire-and-forget — spawns `tokio::task`, errors are swallowed
//!   - Configurable timeout
//!
//! Caller must be inside a Tokio runtime (any axum/tonic/hyper app already is).
//!
//! # Example
//!
//! ```ignore
//! use l402kit::integrations::create_lawn_adapter;
//! use std::time::Duration;
//!
//! let on_event = create_lawn_adapter(
//!     "https://law-n.sageworks.ai/ingest/events".into(),
//!     std::env::var("LAWN_SECRET").unwrap(),
//!     Duration::from_secs(5),
//! );
//! // Wire `on_event` into your L402 middleware's event hook
//! ```

use hmac::{Hmac, Mac};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::sync::Arc;
use std::time::Duration;

type HmacSha256 = Hmac<Sha256>;

// ─── Event types — mirror TS src/types/events.ts ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LawNNetwork {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    pub transport: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LawNPayment {
    pub amount_sats: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preimage_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LawNBehavior {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub budget_remaining: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub budget_exhausted: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caveat_violations: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proof_reuse_attempt: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LawNTiming {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_sent_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice_received_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_completed_at: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LawNRisk {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trust_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drift_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L402EventData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    pub session_id: String,
    pub request_id: String,
    pub endpoint: String,
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<LawNNetwork>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment: Option<LawNPayment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub behavior: Option<LawNBehavior>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing: Option<LawNTiming>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk: Option<LawNRisk>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct L402CloudEvent {
    pub specversion: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub source: String,
    pub id: String,
    pub time: String,
    pub subject: String,
    pub datacontenttype: String,
    pub data: L402EventData,
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

/// Returns a closure `Fn(L402CloudEvent)` that forwards events to LAW-N
/// asynchronously via `tokio::spawn`. Network errors are swallowed.
pub fn create_lawn_adapter(
    endpoint: String,
    secret: String,
    timeout: Duration,
) -> Arc<dyn Fn(L402CloudEvent) + Send + Sync> {
    let endpoint = Arc::new(endpoint);
    let secret = Arc::new(secret);

    Arc::new(move |event: L402CloudEvent| {
        let endpoint = endpoint.clone();
        let secret = secret.clone();

        tokio::spawn(async move {
            let body = match serde_json::to_string(&event) {
                Ok(b) => b,
                Err(_) => return,
            };
            let mut mac = match HmacSha256::new_from_slice(secret.as_bytes()) {
                Ok(m) => m,
                Err(_) => return,
            };
            mac.update(body.as_bytes());
            let sig = hex::encode(mac.finalize().into_bytes());

            let mut rid_bytes = [0u8; 8];
            rand::thread_rng().fill_bytes(&mut rid_bytes);
            let request_id = hex::encode(rid_bytes);

            let client = match reqwest::Client::builder().timeout(timeout).build() {
                Ok(c) => c,
                Err(_) => return,
            };

            let _ = client
                .post(endpoint.as_str())
                .header("Content-Type", "application/json")
                .header("X-LAW-N-Signature", format!("sha256={sig}"))
                .header("X-LAW-N-Request-Id", request_id)
                .body(body)
                .send()
                .await;
            // Errors silently swallowed — behavioral writes must never block payments
        });
    })
}
