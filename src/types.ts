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
}

export interface L402Options {
  /** Price in satoshis per API call */
  priceSats: number;
  /**
   * Plug in any LightningProvider implementation.
   * Built-ins: BlinkProvider, OpenNodeProvider, LNbitsProvider
   */
  lightning: LightningProvider;
  /**
   * Supabase URL for logging transactions.
   * Falls back to process.env.SUPABASE_URL
   */
  supabaseUrl?: string;
  /** Falls back to process.env.SUPABASE_ANON_KEY */
  supabaseKey?: string;
  /** Called after a successful payment is verified */
  onPayment?: (token: L402Token, amountSats: number) => void | Promise<void>;
}

export interface PaymentRecord {
  id: string;
  paymentHash: string;
  preimage: string;
  amountSats: number;
  endpoint: string;
  paidAt: string;
}
