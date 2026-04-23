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
   * Your Lightning provider — BTCPay, Alby, Blink, LNbits, OpenNode, or any
   * implementation of `LightningProvider`. This is required.
   *
   * @example
   * ```ts
   * import { AlbyProvider } from "l402-kit";
   * { lightning: new AlbyProvider(process.env.ALBY_TOKEN) }
   * ```
   */
  lightning: LightningProvider;
  /**
   * @deprecated Use `lightning` with a cloud provider instead.
   * Will be removed in v2.0.
   */
  ownerLightningAddress?: string;
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
  /**
   * Pluggable replay-protection backend.
   * - Default: in-memory (single instance, resets on restart)
   * - Production: `new RedisReplayAdapter(redis)` for multi-instance deployments
   *
   * @example
   * ```ts
   * import Redis from "ioredis";
   * import { RedisReplayAdapter } from "l402-kit";
   * { replayAdapter: new RedisReplayAdapter(new Redis(process.env.REDIS_URL)) }
   * ```
   */
  replayAdapter?: import("./replay").ReplayAdapter;
}

export interface PaymentRecord {
  id: string;
  paymentHash: string;
  preimage: string;
  amountSats: number;
  endpoint: string;
  paidAt: string;
}
