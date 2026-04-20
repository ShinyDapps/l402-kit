use thiserror::Error;

#[derive(Debug, Error)]
pub enum L402Error {
    #[error("invalid L402 token format: expected macaroon:preimage")]
    InvalidTokenFormat,

    #[error("no Lightning provider configured — set owner_lightning_address or lightning")]
    NoProvider,

    #[error("invoice creation failed: {0}")]
    InvoiceCreationFailed(String),
}
