use axum::{middleware, routing::get, Router};
use l402kit::{l402_middleware, Options};
use std::sync::Arc;

async fn data_handler() -> &'static str {
    r#"{"message": "paid access", "data": "your premium content"}"#
}

#[tokio::main]
async fn main() {
    let opts = Arc::new(
        Options::new(10).with_address("you@blink.sv"),
    );

    let app = Router::new()
        .route("/api/data", get(data_handler))
        .route_layer(middleware::from_fn_with_state(opts, l402_middleware))
        .route("/health", get(|| async { r#"{"status":"ok"}"# }));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    println!("Server running on http://localhost:8080");
    axum::serve(listener, app).await.unwrap();
}
