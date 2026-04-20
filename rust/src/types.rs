use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use crate::errors::L402Error;

/// Parsed L402 authorization token.
#[derive(Debug, Clone)]
pub struct L402Token {
    pub macaroon: String,
    pub preimage: String,
}

/// A Lightning payment invoice returned by a provider.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct Invoice {
    pub payment_request: String,
    pub payment_hash: String,
    pub macaroon: String,
    pub amount_sats: u64,
}

/// Boxed future alias used for object-safe async trait.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Implement this trait to plug in any Lightning backend.
///
/// The object-safe design (returning a boxed future) allows storing
/// `Arc<dyn LightningProvider>` in `Options`.
pub trait LightningProvider: Send + Sync {
    fn create_invoice<'a>(&'a self, amount_sats: u64) -> BoxFuture<'a, Result<Invoice, L402Error>>;
}

/// Configuration for the L402 middleware.
pub struct Options {
    /// Price per API call in satoshis.
    pub price_sats: u64,

    /// Your Lightning Address — enables zero-config managed mode.
    /// Example: `"you@blink.sv"`
    pub owner_lightning_address: Option<String>,

    /// Custom Lightning provider (advanced). Overrides `owner_lightning_address`.
    pub lightning: Option<Arc<dyn LightningProvider>>,

    /// Optional callback after each verified payment.
    pub on_payment: Option<Box<dyn Fn(L402Token, u64) + Send + Sync>>,
}

impl std::fmt::Debug for Options {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Options")
            .field("price_sats", &self.price_sats)
            .field("owner_lightning_address", &self.owner_lightning_address)
            .field("lightning", &self.lightning.as_ref().map(|_| "<provider>"))
            .field("on_payment", &self.on_payment.as_ref().map(|_| "<callback>"))
            .finish()
    }
}

impl Options {
    pub fn new(price_sats: u64) -> Self {
        Self {
            price_sats,
            owner_lightning_address: None,
            lightning: None,
            on_payment: None,
        }
    }

    pub fn with_address(mut self, address: impl Into<String>) -> Self {
        self.owner_lightning_address = Some(address.into());
        self
    }

    pub fn with_provider(mut self, provider: Arc<dyn LightningProvider>) -> Self {
        self.lightning = Some(provider);
        self
    }
}
