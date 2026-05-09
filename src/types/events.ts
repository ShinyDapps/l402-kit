/** CloudEvents 1.0 envelope for L402 behavioral events (LAW-N integration). */

export type L402EventType =
  | "l402.payment_initiated"
  | "l402.payment_settled"
  | "l402.caveat_violation"
  | "l402.budget_exhausted"
  | "l402.retry_with_proof";

export interface L402PaymentInitiatedPayload {
  endpoint: string;
  amount_sats: number;
  invoice: string;
}

export interface L402PaymentSettledPayload {
  endpoint: string;
  amount_sats: number;
  macaroon_hash: string;
  outcome: "success" | "failure";
}

export interface L402CaveatViolationPayload {
  endpoint: string;
  macaroon_hash: string;
  reason: string;
}

export interface L402BudgetExhaustedPayload {
  endpoint: string;
  amount_sats: number;
  budget_sats: number;
}

export interface L402RetryWithProofPayload {
  endpoint: string;
  attempt: number;
}

export type L402EventPayload =
  | L402PaymentInitiatedPayload
  | L402PaymentSettledPayload
  | L402CaveatViolationPayload
  | L402BudgetExhaustedPayload
  | L402RetryWithProofPayload;

export interface L402CloudEvent {
  /** CloudEvents spec version */
  specversion: "1.0";
  /** Event type — one of the 5 L402 behavioral events */
  type: L402EventType;
  /** Producer identifier */
  source: "l402-kit";
  /** Persistent agent identity (namespace:name or UUID) */
  agent_id?: string;
  /** ISO 8601 UTC timestamp */
  timestamp: string;
  /** Unique event ID (hex random) */
  event_id: string;
  payload: L402EventPayload;
}