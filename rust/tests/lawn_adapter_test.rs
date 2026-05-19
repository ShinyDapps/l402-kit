#![cfg(feature = "lawn-adapter")]
//! TDD — l402kit::integrations::lawn_adapter
//!
//! Port of TS src/integrations/law-n-adapter.ts. Forwards behavioral events
//! to a LAW-N ingest endpoint with HMAC-SHA256 signing.
//!
//! Contract:
//!   - Transport: POST JSON over HTTPS
//!   - Auth: X-LAW-N-Signature: sha256=<hex digest>
//!   - X-LAW-N-Request-Id: random hex per call
//!   - Fire-and-forget — errors must not propagate
//!   - Configurable timeout

use hmac::{Hmac, Mac};
use l402kit::integrations::{create_lawn_adapter, L402CloudEvent, L402EventData};
use sha2::Sha256;
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

type HmacSha256 = Hmac<Sha256>;

// ─── Fake LAW-N server ───────────────────────────────────────────────────────

#[derive(Clone, Default)]
struct CapturedReq {
    path: String,
    headers: std::collections::HashMap<String, String>,
    body: String,
}

#[derive(Clone)]
struct FakeServer {
    addr: String,
    captured: Arc<Mutex<Vec<CapturedReq>>>,
}

async fn start_fake_server() -> FakeServer {
    let std_listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = std_listener.local_addr().unwrap().to_string();
    std_listener.set_nonblocking(true).unwrap();
    let listener = tokio::net::TcpListener::from_std(std_listener).unwrap();

    let captured = Arc::new(Mutex::new(Vec::<CapturedReq>::new()));
    let captured_clone = captured.clone();

    tokio::spawn(async move {
        loop {
            let (mut sock, _) = match listener.accept().await {
                Ok(s) => s,
                Err(_) => break,
            };
            let captured = captured_clone.clone();
            tokio::spawn(async move {
                let mut buf = vec![0u8; 64 * 1024];
                let mut total = String::new();
                // Read until end of headers + likely body (single-shot, small bodies)
                loop {
                    match sock.read(&mut buf).await {
                        Ok(0) => break,
                        Ok(n) => {
                            total.push_str(&String::from_utf8_lossy(&buf[..n]));
                            if let Some(headers_end) = total.find("\r\n\r\n") {
                                let header_part = &total[..headers_end];
                                let body_part = &total[headers_end + 4..];
                                // Parse Content-Length
                                let mut cl: usize = 0;
                                for line in header_part.lines() {
                                    if line.to_lowercase().starts_with("content-length:") {
                                        cl = line.split(':').nth(1).unwrap_or("0").trim().parse().unwrap_or(0);
                                    }
                                }
                                if body_part.len() >= cl {
                                    // Parse first line: METHOD PATH HTTP/1.1
                                    let mut path = String::new();
                                    let mut hmap = std::collections::HashMap::new();
                                    for (i, line) in header_part.lines().enumerate() {
                                        if i == 0 {
                                            let parts: Vec<&str> = line.split_whitespace().collect();
                                            if parts.len() >= 2 {
                                                path = parts[1].to_string();
                                            }
                                        } else if let Some((k, v)) = line.split_once(':') {
                                            // HTTP headers are case-insensitive; normalize to lower
                                            hmap.insert(k.trim().to_lowercase(), v.trim().to_string());
                                        }
                                    }
                                    captured.lock().unwrap().push(CapturedReq {
                                        path,
                                        headers: hmap,
                                        body: body_part[..cl].to_string(),
                                    });
                                    let resp = "HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\n\r\n";
                                    let _ = sock.write_all(resp.as_bytes()).await;
                                    let _ = sock.flush().await;
                                    break;
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
            });
        }
    });

    FakeServer { addr, captured }
}

async fn wait_for_captured(server: &FakeServer, n: usize, timeout: Duration) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        if server.captured.lock().unwrap().len() >= n {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    false
}

fn sample_event() -> L402CloudEvent {
    L402CloudEvent {
        specversion: "1.0".into(),
        r#type: "l402.payment.settled".into(),
        source: "l402-kit".into(),
        id: "abc123".into(),
        time: "2026-05-19T12:00:00Z".into(),
        subject: "agent-payment-flow".into(),
        datacontenttype: "application/json".into(),
        data: L402EventData {
            session_id: "sess-1".into(),
            request_id: "req-1".into(),
            endpoint: "https://api.example.com/data".into(),
            event_type: "settled".into(),
            agent_id: Some("agent:research-node-7".into()),
            network: None,
            payment: None,
            behavior: None,
            timing: None,
            risk: None,
        },
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn adapter_posts_event_with_hmac_signature() {
    let server = start_fake_server().await;
    let url = format!("http://{}/ingest/events", server.addr);
    let adapter = create_lawn_adapter(url.clone(), "topsecret".into(), Duration::from_secs(2));

    adapter(sample_event());

    assert!(wait_for_captured(&server, 1, Duration::from_secs(5)).await, "request should arrive");
    let items = server.captured.lock().unwrap().clone();
    assert_eq!(items.len(), 1);

    let req = &items[0];
    assert_eq!(req.path, "/ingest/events");
    assert_eq!(req.headers.get("content-type").map(String::as_str), Some("application/json"));
    assert!(req.headers.contains_key("x-law-n-signature"));
    assert!(req.headers.contains_key("x-law-n-request-id"));

    // Signature must match HMAC-SHA256(body) using secret
    let mut mac = HmacSha256::new_from_slice(b"topsecret").unwrap();
    mac.update(req.body.as_bytes());
    let expected = format!("sha256={}", hex::encode(mac.finalize().into_bytes()));
    assert_eq!(req.headers.get("x-law-n-signature"), Some(&expected));
}

#[tokio::test]
async fn adapter_swallows_network_errors() {
    // Unreachable endpoint — must NOT panic, must return immediately
    let adapter = create_lawn_adapter(
        "http://127.0.0.1:1/never".into(),
        "x".into(),
        Duration::from_millis(100),
    );
    adapter(sample_event());
    tokio::time::sleep(Duration::from_millis(300)).await;
    // If we get here without panic, test passes
}

#[tokio::test]
async fn adapter_emits_unique_request_ids_per_call() {
    let server = start_fake_server().await;
    let url = format!("http://{}/ingest/events", server.addr);
    let adapter = create_lawn_adapter(url, "s".into(), Duration::from_secs(2));

    adapter(sample_event());
    adapter(sample_event());

    assert!(wait_for_captured(&server, 2, Duration::from_secs(5)).await);
    let items = server.captured.lock().unwrap().clone();
    assert_eq!(items.len(), 2);

    let id1 = items[0].headers.get("x-law-n-request-id").unwrap();
    let id2 = items[1].headers.get("x-law-n-request-id").unwrap();
    assert_ne!(id1, id2);
}
