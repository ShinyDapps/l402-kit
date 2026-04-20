# l402kit — Rust SDK

L402 (HTTP 402 + Lightning Network) middleware for Rust. Supports **axum**.

## Install

```toml
[dependencies]
l402kit = { git = "https://github.com/shinydapps/l402-kit", version = "0.1.0" }
```

> Will be published to [crates.io](https://crates.io/crates/l402kit) soon.

## Usage (axum)

```rust
use axum::{middleware, routing::get, Router};
use l402kit::{l402_middleware, Options};
use std::sync::Arc;

#[tokio::main]
async fn main() {
    let opts = Arc::new(
        Options::new(10).with_address("you@blink.sv"),
    );

    let app = Router::new()
        .route("/api/data", get(handler))
        .route_layer(middleware::from_fn_with_state(opts, l402_middleware));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

## How it works

1. Request hits `/api/data` without a valid token → `402 Payment Required` + Lightning invoice
2. Client pays the invoice → receives a preimage
3. Client retries with `Authorization: L402 <macaroon>:<preimage>`
4. Middleware verifies `SHA256(preimage) == paymentHash` and grants access

## Options

```rust
let opts = Options::new(10)                          // 10 sats per call
    .with_address("you@blink.sv")                    // zero-config managed mode
    .with_provider(Arc::new(MyCustomProvider));      // or bring your own
```

## Custom provider

```rust
use l402kit::{BoxFuture, Invoice, L402Error, LightningProvider};

struct MyProvider;

impl LightningProvider for MyProvider {
    fn create_invoice<'a>(&'a self, amount_sats: u64) -> BoxFuture<'a, Result<Invoice, L402Error>> {
        Box::pin(async move {
            // Call your Lightning node here
            Ok(Invoice { ... })
        })
    }
}
```

## Run tests

```bash
cargo test
```

## Features

| Feature | Default | Description |
|---|---|---|
| `axum-middleware` | ✅ | Axum middleware + managed HTTP provider |
