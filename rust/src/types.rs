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

    /// Your Lightning provider — required.
    /// Use `BlinkProvider`, `AlbyProvider`, `BtcPayProvider`, or `ManagedProvider`.
    pub lightning: Arc<dyn LightningProvider>,

    /// Optional callback after each verified payment.
    pub on_payment: Option<Box<dyn Fn(L402Token, u64) + Send + Sync>>,

    /// Deprecated: use `with_provider(ManagedProvider::new(address))` instead.
    #[doc(hidden)]
    pub owner_lightning_address: Option<String>,
}

impl std::fmt::Debug for Options {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Options")
            .field("price_sats", &self.price_sats)
            .field("lightning", &"<provider>")
            .field("on_payment", &self.on_payment.as_ref().map(|_| "<callback>"))
            .finish()
    }
}

impl Options {
    pub fn new(price_sats: u64, provider: Arc<dyn LightningProvider>) -> Self {
        Self {
            price_sats,
            lightning: provider,
            on_payment: None,
            owner_lightning_address: None,
        }
    }

    /// Deprecated: use `Options::new(sats, ManagedProvider::new(address))`.
    #[deprecated(since = "1.4.0", note = "use Options::new with an explicit provider")]
    pub fn with_address(mut self, address: impl Into<String>) -> Self {
        self.owner_lightning_address = Some(address.into());
        self
    }

    pub fn with_provider(mut self, provider: Arc<dyn LightningProvider>) -> Self {
        self.lightning = provider;
        self
    }

    pub fn on_payment(mut self, cb: impl Fn(L402Token, u64) + Send + Sync + 'static) -> Self {
        self.on_payment = Some(Box::new(cb));
        self
    }
}
