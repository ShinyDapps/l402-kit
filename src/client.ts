/**
 * L402Client — client-side SDK for consuming L402-protected APIs.
 *
 * Handles the full flow automatically:
 *   1. Make request → 402 Payment Required
 *   2. Extract invoice + macaroon from response
 *   3. Pay invoice via provided wallet
 *   4. Retry request with Authorization: L402 <macaroon>:<preimage>
 *   5. Return 200 OK response
 *
 * Also accepts x402 (Coinbase) responses for cross-protocol compatibility.
 *
 * @example
 * ```ts
 * import { L402Client } from "l402-kit/client";
 *
 * const client = new L402Client({
 *   wallet: {
 *     payInvoice: async (bolt11) => {
 *       // pay using any Lightning wallet SDK
 *       const preimage = await myWallet.pay(bolt11);
 *       return { preimage };
 *     }
 *   }
 * });
 *
 * const res = await client.fetch("https://api.example.com/premium");
 * const data = await res.json();
 * ```
 */

export interface L402Wallet {
  /** Pay a BOLT11 invoice. Must return the payment preimage as a hex string. */
  payInvoice(bolt11: string): Promise<{ preimage: string }>;
}

export interface TokenStore {
  get(url: string): { macaroon: string; preimage: string } | undefined;
  set(url: string, token: { macaroon: string; preimage: string }): void;
}

export interface L402ClientOptions {
  /** Wallet used to pay Lightning invoices. */
  wallet: L402Wallet;
  /**
   * Optional token store for caching paid tokens per endpoint.
   * Avoids re-paying if the same endpoint is called again within a session.
   * Default: in-memory Map (cleared on process restart).
   */
  tokenStore?: TokenStore;
  /** Maximum retry attempts after a payment. Default: 1. */
  maxRetries?: number;
}

class MemoryTokenStore implements TokenStore {
  private map = new Map<string, { macaroon: string; preimage: string }>();
  get(url: string) { return this.map.get(this._key(url)); }
  set(url: string, token: { macaroon: string; preimage: string }) { this.map.set(this._key(url), token); }
  private _key(url: string) {
    try { return new URL(url).origin + new URL(url).pathname; }
    catch { return url; }
  }
}

export class L402Client {
  private wallet: L402Wallet;
  private tokenStore: TokenStore;
  private maxRetries: number;

  constructor(options: L402ClientOptions) {
    this.wallet     = options.wallet;
    this.tokenStore = options.tokenStore ?? new MemoryTokenStore();
    this.maxRetries = options.maxRetries ?? 1;
  }

  /**
   * Drop-in replacement for `fetch` that handles L402 and x402 payment flows.
   */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    // Try cached token first
    const cached = this.tokenStore.get(url);
    if (cached) {
      const res = await this._fetchWithToken(url, init, cached.macaroon, cached.preimage);
      if (res.status !== 402) return res;
      // Token rejected — clear cache and fall through to fresh payment
      this.tokenStore.set(url, { macaroon: "", preimage: "" });
    }

    // Initial unauthenticated request
    const res402 = await fetch(url, init);

    if (res402.status !== 402) return res402;

    // Parse 402 response — supports both L402 and x402 formats
    const { macaroon, invoice } = await this._parse402(res402);

    // Pay invoice
    let preimage: string;
    try {
      const result = await this.wallet.payInvoice(invoice);
      preimage = result.preimage;
    } catch (err) {
      throw new L402PaymentError(`Payment failed: ${String(err)}`, invoice);
    }

    // Cache token for future calls
    this.tokenStore.set(url, { macaroon, preimage });

    // Retry with credentials
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const retryRes = await this._fetchWithToken(url, init, macaroon, preimage);
      if (retryRes.status !== 402) return retryRes;
    }

    throw new L402PaymentError("Server rejected payment after retries", invoice);
  }

  private async _fetchWithToken(
    url: string,
    init: RequestInit,
    macaroon: string,
    preimage: string,
  ): Promise<Response> {
    return fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        "Authorization": `L402 ${macaroon}:${preimage}`,
      },
    });
  }

  private async _parse402(res: Response): Promise<{ macaroon: string; invoice: string }> {
    let body: Record<string, unknown> = {};
    try { body = await res.clone().json() as Record<string, unknown>; } catch { /* non-JSON 402 */ }

    // L402 format: { macaroon, invoice }
    const macaroon = body.macaroon as string | undefined;
    const invoice  = (body.invoice ?? body.paymentRequest ?? body.payment_request) as string | undefined;

    // x402 (Coinbase) format: X-Payment-Required header with JSON
    if (!macaroon || !invoice) {
      const xHeader = res.headers.get("X-Payment-Required") ?? res.headers.get("x-payment-required");
      if (xHeader) {
        try {
          const xData = JSON.parse(xHeader) as Record<string, unknown>;
          const xInvoice  = xData.invoice as string | undefined;
          const xMacaroon = xData.macaroon ?? xData.token ?? xData.payment_token;
          if (xInvoice && xMacaroon) {
            return { macaroon: String(xMacaroon), invoice: xInvoice };
          }
        } catch { /* malformed header */ }
      }
    }

    if (!macaroon) throw new L402ParseError("402 response missing macaroon field", body);
    if (!invoice)  throw new L402ParseError("402 response missing invoice field", body);

    return { macaroon, invoice };
  }
}

export class L402PaymentError extends Error {
  constructor(message: string, public readonly invoice: string) {
    super(message);
    this.name = "L402PaymentError";
  }
}

export class L402ParseError extends Error {
  constructor(message: string, public readonly body: unknown) {
    super(message);
    this.name = "L402ParseError";
  }
}
