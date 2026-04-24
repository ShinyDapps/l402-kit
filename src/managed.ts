import type { LightningProvider, Invoice } from "./types";

const SHINYDAPPS_API = process.env.SHINYDAPPS_API_URL ?? "https://l402kit.com";
const SPLIT_SECRET   = process.env.SPLIT_SECRET ?? "";

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
 * ```
 */
export class ManagedProvider implements LightningProvider {
  private constructor(private ownerAddress: string) {}

  static fromAddress(address: string): ManagedProvider {
    return new ManagedProvider(address);
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
