/** CloudEvents 1.0 envelope for L402 behavioral events (LAW-N integration). */

export type L402EventType =
  | "l402.payment.initiated"
  | "l402.payment.settled"
  | "l402.caveat.violation"
  | "l402.budget.exhausted"
  | "l402.payment.retry_with_proof";

export interface LawNNetwork {
  provider?: string;
  transport: string;
  region?: string;
}

export interface LawNPayment {
  amount_sats: number;
  invoice_hash?: string;
  preimage_hash?: string;
  settled?: boolean;
  latency_ms?: number;
}

export interface LawNBehavior {
  retry_count?: number;
  budget_remaining?: number;
  budget_exhausted?: boolean;
  caveat_violations?: number;
  proof_reuse_attempt?: boolean;
}

export interface LawNTiming {
  client_sent_at?: number;
  invoice_received_at?: number;
  payment_completed_at?: number;
}

export interface LawNRisk {
  severity?: number;
  trust_score?: number;
  drift_score?: number;
}

export interface L402EventData {
  /** Persistent agent identity — strongly recommended for longitudinal analysis. */
  agent_id?: string;
  /** Per-client-instance session identifier. */
  session_id: string;
  /** Per-request identifier for causality tracing. */
  request_id: string;
  endpoint: string;
  event_type: string;
  network?: LawNNetwork;
  payment?: LawNPayment;
  behavior?: LawNBehavior;
  timing?: LawNTiming;
  /** Derived risk signals — optional, LAW-N can compute downstream. */
  risk?: LawNRisk;
}

/** CloudEvents 1.0 envelope aligned with LAW-N ingest schema. */
export interface L402CloudEvent {
  specversion: "1.0";
  type: L402EventType;
  source: "l402-kit";
  /** Unique event ID (hex random). */
  id: string;
  /** ISO 8601 UTC timestamp. */
  time: string;
  subject: "agent-payment-flow";
  datacontenttype: "application/json";
  data: L402EventData;
}