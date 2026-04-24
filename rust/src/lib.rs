pub mod errors;
pub mod replay;
pub mod types;
pub mod verify;

#[cfg(feature = "axum-middleware")]
pub mod managed;
#[cfg(feature = "axum-middleware")]
pub mod middleware;

pub use errors::L402Error;
pub use replay::check_and_mark_preimage;
pub use types::{BoxFuture, Invoice, L402Token, LightningProvider, Options};
pub use verify::{parse_token, verify_token};

#[cfg(feature = "axum-middleware")]
pub use managed::ManagedProvider;
#[cfg(feature = "axum-middleware")]
pub use middleware::l402_middleware;
