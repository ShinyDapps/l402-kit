import { createHash, randomBytes } from "crypto";
import express, { type Express } from "express";
import request from "supertest";
import { l402 } from "../middleware";
import type { LightningProvider, Invoice } from "../types";

// ─── mock provider ───────────────────────────────────────────────────────────

class MockProvider implements LightningProvider {
  public lastAmount = 0;
  private fixedHash: string;
  readonly fixedPreimage: string;

  constructor() {
    // Use a fresh random preimage per instance so tests don't share replay state
    this.fixedPreimage = randomBytes(32).toString("hex");
    this.fixedHash = createHash("sha256")
      .update(Buffer.from(this.fixedPreimage, "hex"))
      .digest("hex");
  }

  async createInvoice(amountSats: number): Promise<Invoice> {
    this.lastAmount = amountSats;
    const payload = {
      hash: this.fixedHash,
      exp: Date.now() + 3_600_000,
    };
    const macaroon = Buffer.from(JSON.stringify(payload)).toString("base64");
    return {
      paymentRequest: "lnbctest1234",
      paymentHash: this.fixedHash,
      macaroon,
      amountSats,
      expiresAt: Date.now() + 3_600_000,
    };
  }

  async checkPayment(): Promise<boolean> {
    return false;
  }

  getValidToken(): string {
    const payload = { hash: this.fixedHash, exp: Date.now() + 3_600_000 };
    const mac = Buffer.from(JSON.stringify(payload)).toString("base64");
    return `${mac}:${this.fixedPreimage}`;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeApp(provider: LightningProvider): Express {
  const app = express();
  app.get("/premium", l402({ priceSats: 10, lightning: provider }), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("l402 middleware", () => {
  let provider: MockProvider;
  let app: Express;

  beforeEach(() => {
    provider = new MockProvider();
    app = makeApp(provider);
  });

  it("returns 402 with invoice when no auth header", async () => {
    const res = await request(app).get("/premium");
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("Payment Required");
    expect(res.body.invoice).toBeTruthy();
    expect(res.body.macaroon).toBeTruthy();
    expect(res.body.priceSats).toBe(10);
  });

  it("sets WWW-Authenticate header on 402", async () => {
    const res = await request(app).get("/premium");
    expect(res.headers["www-authenticate"]).toMatch(/^L402 macaroon="/);
  });

  it("returns 200 with valid L402 token", async () => {
    const token = provider.getValidToken();
    const res = await request(app)
      .get("/premium")
      .set("Authorization", `L402 ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 402 with invalid preimage", async () => {
    const badToken = "bm90dmFsaWQ=:" + "e".repeat(64); // wrong hash
    const res = await request(app)
      .get("/premium")
      .set("Authorization", `L402 ${badToken}`);
    expect(res.status).toBe(402);
  });

  it("returns 401 on replay attack (same token used twice)", async () => {
    const token = provider.getValidToken();
    const first = await request(app)
      .get("/premium")
      .set("Authorization", `L402 ${token}`);
    expect(first.status).toBe(200);

    const second = await request(app)
      .get("/premium")
      .set("Authorization", `L402 ${token}`);
    expect(second.status).toBe(401);
    expect(second.body.error).toBe("Token already used");
  });

  it("calls onPayment callback when provided", async () => {
    const onPayment = jest.fn().mockResolvedValue(undefined);
    const appWithCb = express();
    appWithCb.get(
      "/premium",
      l402({ priceSats: 10, lightning: provider, onPayment }),
      (_req, res) => res.json({ ok: true }),
    );

    const token = provider.getValidToken();
    await request(appWithCb)
      .get("/premium")
      .set("Authorization", `L402 ${token}`);

    expect(onPayment).toHaveBeenCalledTimes(1);
    expect(onPayment).toHaveBeenCalledWith(
      expect.objectContaining({ macaroon: expect.any(String), preimage: expect.any(String) }),
      10,
    );
  });
});
