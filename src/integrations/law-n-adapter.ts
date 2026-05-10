import { createHmac, randomBytes } from "crypto";
import type { L402CloudEvent } from "../types/events";

export interface LawNAdapterOptions {
  /**
   * LAW-N ingest endpoint.
   * @example "https://law-n.sageworks.ai/ingest/events"
   */
  endpoint: string;
  /** HMAC-SHA256 shared secret for request signing. */
  secret: string;
  /** Optional timeout in ms. Default: 5000. */
  timeoutMs?: number;
}

/**
 * Creates an `onEvent` handler that forwards L402CloudEvents to a LAW-N ingest endpoint.
 *
 * - Transport: POST JSON over HTTPS (no gRPC/event bus required initially)
 * - Auth: HMAC-SHA256 in X-LAW-N-Signature header
 * - Delivery: fire-and-forget, at-least-once — LAW-N handles dedup/windowing
 * - Network errors are swallowed — behavioral writes must never block payments
 *
 * @example
 * ```ts
 * import { L402Client } from "l402-kit";
 * import { createLawNAdapter } from "l402-kit/integrations/law-n-adapter";
 *
 * const client = new L402Client({
 *   wallet: myWallet,
 *   agentId: "agent:research-node-7",
 *   network: { provider: "blink", transport: "lightning", region: "global" },
 *   onEvent: createLawNAdapter({
 *     endpoint: "https://law-n.sageworks.ai/ingest/events",
 *     secret: process.env.LAWN_SECRET!,
 *   }),
 * });
 * ```
 */
export function createLawNAdapter(options: LawNAdapterOptions): (event: L402CloudEvent) => void {
  const { endpoint, secret, timeoutMs = 5000 } = options;

  return function forwardToLawN(event: L402CloudEvent): void {
    const body = JSON.stringify(event);
    const sig  = createHmac("sha256", secret).update(body).digest("hex");
    const id   = randomBytes(8).toString("hex");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LAW-N-Signature": `sha256=${sig}`,
        "X-LAW-N-Request-Id": id,
      },
      body,
      signal: controller.signal,
    })
      .then(() => clearTimeout(timer))
      .catch(() => clearTimeout(timer));
  };
}