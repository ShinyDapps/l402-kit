use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::sync::Arc;

use crate::{
    replay::check_and_mark_preimage,
    types::Options,
    verify::{parse_token, verify_token},
};

/// Axum middleware that enforces L402 payment before calling the next handler.
///
/// ```rust,no_run
/// use axum::{Router, routing::get, middleware};
/// use l402kit::{l402_middleware, ManagedProvider, Options};
/// use std::sync::Arc;
///
/// async fn my_handler() -> &'static str { "ok" }
///
/// let provider = ManagedProvider::new("you@yourdomain.com".into());
/// let opts = Arc::new(Options::new(10, provider));
/// let app: Router<()> = Router::new()
///     .route("/api/data", get(my_handler))
///     .route_layer(middleware::from_fn_with_state(opts, l402_middleware));
/// ```
pub async fn l402_middleware(
    State(opts): State<Arc<Options>>,
    request: Request,
    next: Next,
) -> Response {
    let auth = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    if let Some(auth) = auth {
        if let Some(token) = auth.strip_prefix("L402 ") {
            if verify_token(token) {
                if let Ok(t) = parse_token(token) {
                    if !check_and_mark_preimage(&t.preimage) {
                        return (
                            StatusCode::UNAUTHORIZED,
                            Json(json!({ "error": "Token already used" })),
                        )
                            .into_response();
                    }

                    if let Some(cb) = &opts.on_payment {
                        cb(t, opts.price_sats);
                    }

                    return next.run(request).await;
                }
            }
        }
    }

    // No valid token — create invoice and return 402
    match opts.lightning.create_invoice(opts.price_sats).await {
        Ok(inv) => {
            let www_auth = format!(
                r#"L402 macaroon="{}", invoice="{}""#,
                inv.macaroon, inv.payment_request
            );
            let mut response = (
                StatusCode::PAYMENT_REQUIRED,
                Json(json!({
                    "error": "Payment Required",
                    "priceSats": opts.price_sats,
                    "invoice": inv.payment_request,
                    "macaroon": inv.macaroon,
                })),
            )
                .into_response();
            response.headers_mut().insert(
                header::WWW_AUTHENTICATE,
                www_auth.parse().unwrap(),
            );
            response
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}
