import type { LightningProvider, Invoice } from "./types";

const SHINYDAPPS_API = process.env.SHINYDAPPS_API_URL ?? "https://l402kit.com";
const SPLIT_SECRET   = process.env.SPLIT_SECRET ?? "";

export interface DirectoryRegistration {
  /** Public URL of the L402-protected endpoint (e.g. "https://api.example.com/v1/weather") */
  url: string;
  /** Display name shown in the API directory */
  name: string;
  /** Price in satoshis — must match what the middleware actually charges */
  priceSats: number;
  description?: string;
  category?: "data" | "ai" | "finance" | "weather" | "compute" | "storage" | "other";
}

/**
 * Cloud-managed Lightning provider (l402kit.com hosted service).
 *
 * Invoices and splits are handled server-side. You receive 99.7% of each
 * payment directly to your Lightning Address. Explicit opt-in.
 *
 * For sovereign mode (0% fee), use AlbyProvider, BTCPayProvider, or BlinkProvider.
 *
 * @example
 * ```ts
 * import { ManagedProvider } from "l402-kit";
 * l402({ priceSats: 10, lightning: ManagedProvider.fromAddress("you@blink.sv") })
 * // with directory registration:
 * l402({ priceSats: 10, lightning: ManagedProvider.fromAddress("you@blink.sv", {
 *   registerDirectory: { url: "https://api.you.com/weather", name: "Weather API", priceSats: 10 }
 * }) })
 * ```
 */
export class ManagedProvider implements LightningProvider {
  private constructor(private ownerAddress: string) {}

  static fromAddress(
    address: string,
    opts?: { registerDirectory?: DirectoryRegistration },
  ): ManagedProvider {
    const provider = new ManagedProvider(address);
    if (opts?.registerDirectory) {
      const { url, name, priceSats, description, category } = opts.registerDirectory;
      fetch(`${SHINYDAPPS_API}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          name,
          price_sats: priceSats,
          lightning_address: address,
          description: description ?? undefined,
          category: category ?? "other",
        }),
      }).catch(() => { /* silent — directory registration is best-effort */ });
    }
    return provider;
  }

  async createInvoice(amountSats: number): Promise<Invoice> {
    const res = await fetch(`${SHINYDAPPS_API}/api/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountSats, ownerAddress: this.ownerAddress }),
    });
    if (!res.ok) throw new Error("ManagedProvider: invoice creation failed");
    const data = await res.json() as { paymentRequest: string; paymentHash: string; macaroon: string };
    return { ...data, amountSats, expiresAt: Date.now() + 3_600_000 };
  }

  // ManagedProvider uses Blink webhook for payment confirmation, not polling.
  // Verification happens via SHA256(preimage) == paymentHash in the middleware.
  async checkPayment(): Promise<boolean> { return false; }

  async sendSplit(amountSats: number): Promise<void> {
    const res = await fetch(`${SHINYDAPPS_API}/api/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-split-secret": SPLIT_SECRET },
      body: JSON.stringify({ amountSats, ownerAddress: this.ownerAddress }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ManagedProvider split ${res.status}: ${body.slice(0, 120)}`);
    }
  }
}
