use reqwest::Client;
use serde::Deserialize;
use std::env;
use std::sync::Arc;

use crate::{
    errors::L402Error,
    types::{BoxFuture, Invoice, LightningProvider},
};

const SHINYDAPPS_API: &str = "https://l402kit.vercel.app";

pub struct ManagedProvider {
    owner_address: String,
    client: Client,
}

impl ManagedProvider {
    pub fn new(owner_address: String) -> Arc<Self> {
        Arc::new(Self {
            owner_address,
            client: Client::new(),
        })
    }

    async fn do_create_invoice(&self, amount_sats: u64) -> Result<Invoice, L402Error> {
        #[derive(Deserialize)]
        struct InvoiceResponse {
            #[serde(rename = "paymentRequest")]
            payment_request: String,
            #[serde(rename = "paymentHash")]
            payment_hash: String,
            macaroon: String,
        }

        let res = self
            .client
            .post(format!("{SHINYDAPPS_API}/api/invoice"))
            .json(&serde_json::json!({ "amountSats": amount_sats }))
            .send()
            .await
            .map_err(|e| L402Error::InvoiceCreationFailed(e.to_string()))?;

        if !res.status().is_success() {
            return Err(L402Error::InvoiceCreationFailed(format!(
                "API returned {}",
                res.status()
            )));
        }

        let data: InvoiceResponse = res
            .json()
            .await
            .map_err(|e| L402Error::InvoiceCreationFailed(e.to_string()))?;

        Ok(Invoice {
            payment_request: data.payment_request,
            payment_hash: data.payment_hash,
            macaroon: data.macaroon,
            amount_sats,
        })
    }

    /// Fire-and-forget: send split to ShinyDapps backend.
    pub async fn send_split(&self, amount_sats: u64) {
        let _ = self
            .client
            .post(format!("{SHINYDAPPS_API}/api/split"))
            .header("x-split-secret", env::var("SPLIT_SECRET").unwrap_or_default())
            .json(&serde_json::json!({
                "amountSats": amount_sats,
                "ownerAddress": self.owner_address,
            }))
            .send()
            .await;
    }
}

impl LightningProvider for ManagedProvider {
    fn create_invoice<'a>(&'a self, amount_sats: u64) -> BoxFuture<'a, Result<Invoice, L402Error>> {
        Box::pin(async move { self.do_create_invoice(amount_sats).await })
    }
}
