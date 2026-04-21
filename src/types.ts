export interface Invoice {
  paymentRequest: string;
  paymentHash: string;
  macaroon: string;
  amountSats: number;
  expiresAt: number;
}

export interface L402Token {
  macaroon: string;
  preimage: string;
}

/** Implement this interface to plug in any Lightning provider */
export interface LightningProvider {
  createInvoice(amountSats: number): Promise<Invoice>;
  checkPayment(paymentHash: string): Promise<boolean>;
  /** Send sats to a Lightning Address (LNURL-pay) */
  sendPayment?(amountSats: number, lightningAddress: string): Promise<boolean>;
}

export interface L402Options {
  /** Price in satoshis per API call */
  priceSats: number;
  /**
   * Lightning Address of the API owner — receives 99.7% of each payment.
   * Example: "you@blink.sv"
   * When set, l402-kit manages everything: invoices via ShinyDapps account,
   * automatic split, and 0.3% fee to ShinyDapps.
   */
  ownerLightningAddress?: string;
  /**
   * Bring your own Lightning provider (advanced).
   * Use when you want full control over your Lightning backend.
   */
  lightning?: LightningProvider;
  /** Supabase URL for logging. Falls back to process.env.SUPABASE_URL */
  supabaseUrl?: string;
  /** Falls back to process.env.SUPABASE_ANON_KEY */
  supabaseKey?: string;
  /** Called after a successful payment is verified */
  onPayment?: (token: L402Token, amountSats: number) => void | Promise<void>;
  /**
   * HTTP endpoint on your server to receive signed payment events.
   * l402-kit will POST a `WebhookEvent` with an `l402-signature` header.
   * Use `verifyWebhook(secret, rawBody, signatureHeader)` to verify.
   */
  webhookUrl?: string;
  /**
   * Secret used to sign webhook payloads (HMAC-SHA256).
   * Required when `webhookUrl` is set.
   * Generate with: `openssl rand -hex 32`
   */
  webhookSecret?: string;
}

export interface PaymentRecord {
  id: string;
  paymentHash: string;
  preimage: string;
  amountSats: number;
  endpoint: string;
  paidAt: string;
}
