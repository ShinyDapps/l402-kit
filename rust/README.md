# l402kit — Rust SDK

**Add Bitcoin Lightning pay-per-call to any Rust API. 3 lines of code.**

[![crates.io](https://img.shields.io/crates/v/l402kit?color=ce422b&label=crates.io)](https://crates.io/crates/l402kit)
[![downloads](https://img.shields.io/crates/d/l402kit?color=ce422b&label=downloads)](https://crates.io/crates/l402kit)
[![docs.rs](https://img.shields.io/docsrs/l402kit?label=docs.rs)](https://docs.rs/l402kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ShinyDapps/l402-kit/blob/main/LICENSE)

L402 (HTTP 402 + Lightning Network) middleware for Rust. Supports **axum**.

📖 **Docs:** [l402kit.vercel.app/docs/sdk/rust](https://l402kit.com/docs/sdk/rust)

## Install

```bash
cargo add l402kit
```

## Usage (axum)

```rust
use axum::{middleware, routing::get, Router};
use l402kit::{l402_middleware, Options};
use std::sync::Arc;

#[tokio::main]
async fn main() {
    let opts = Arc::new(
        Options::new(10).with_address("you@yourdomain.com"),
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
    .with_address("you@yourdomain.com")                    // zero-config managed mode
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
