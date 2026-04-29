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
    this.fixedPreimage = randomBytes(32).toString("hex");
    this.fixedHash = createHash("sha256")
      .update(Buffer.from(this.fixedPreimage, "hex"))
      .digest("hex");
  }

  async createInvoice(amountSats: number): Promise<Invoice> {
    this.lastAmount = amountSats;
    const payload = { hash: this.fixedHash, exp: Date.now() + 3_600_000 };
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

  getExpiredToken(): string {
    const payload = { hash: this.fixedHash, exp: Date.now() - 1_000 };
    const mac = Buffer.from(JSON.stringify(payload)).toString("base64");
    return `${mac}:${this.fixedPreimage}`;
  }
}

// ─── app builders ─────────────────────────────────────────────────────────────

function makeApp(provider: LightningProvider, price = 10): Express {
  const app = express();
  app.get("/premium", l402({ priceSats: price, lightning: provider }), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

function makeMultiRouteApp(provider: LightningProvider): Express {
  const app = express();
  app.get("/cheap", l402({ priceSats: 1, lightning: provider }), (_req, res) => {
    res.json({ route: "cheap" });
  });
  app.get("/expensive", l402({ priceSats: 1000, lightning: provider }), (_req, res) => {
    res.json({ route: "expensive" });
  });
  app.post("/premium", l402({ priceSats: 50, lightning: provider }), (req, res) => {
    res.json({ method: req.method });
  });
  return app;
}

// ─── 402 challenge behaviour ─────────────────────────────────────────────────

describe("l402 middleware — 402 challenge", () => {
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

  it("sets Accept-Payment header on 402", async () => {
    const res = await request(app).get("/premium");
    expect(res.headers["accept-payment"]).toBeDefined();
    expect(res.headers["accept-payment"]).toMatch(/^L402 /);
  });

  it("Accept-Payment header contains price and invoice", async () => {
    const res = await request(app).get("/premium");
    const header = res.headers["accept-payment"] as string;
    expect(header).toMatch(/price=10sat/);
    expect(header).toMatch(/invoice="lnbctest1234"/);
  });

  it("Accept-Payment header contains macaroon", async () => {
    const res = await request(app).get("/premium");
    const header = res.headers["accept-payment"] as string;
    expect(header).toMatch(/macaroon="[A-Za-z0-9+/=]+"/);
  });

  it("returns JSON content-type on 402", async () => {
    const res = await request(app).get("/premium");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("returns 402 when Authorization header is empty", async () => {
    const res = await request(app).get("/premium").set("Authorization", "");
    expect(res.status).toBe(402);
  });

  it("returns 402 when Authorization uses Bearer instead of L402", async () => {
    const token = provider.getValidToken();
    const res = await request(app).get("/premium").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(402);
  });

  it("returns 402 when Authorization uses Basic scheme", async () => {
    const res = await request(app)
      .get("/premium")
      .set("Authorization", "Basic dXNlcjpwYXNz");
    expect(res.status).toBe(402);
  });

  it("returns 402 when token has no preimage (only macaroon)", async () => {
    const mac = Buffer.from(JSON.stringify({ hash: "abc", exp: Date.now() + 3_600_000 })).toString("base64");
    const res = await request(app).get("/premium").set("Authorization", `L402 ${mac}`);
    expect(res.status).toBe(402);
  });

  it("returns 402 when token is completely garbage", async () => {
    const res = await request(app).get("/premium").set("Authorization", "L402 garbage!!!123");
    expect(res.status).toBe(402);
  });

  it("returns 402 with expired token", async () => {
    const token = provider.getExpiredToken();
    const res = await request(app).get("/premium").set("Authorization", `L402 ${token}`);
    expect(res.status).toBe(402);
  });

  it("invoice body contains amountSats equal to priceSats", async () => {
    const res = await request(app).get("/premium");
    expect(res.body.priceSats).toBe(10);
  });

  it("passes priceSats=100 correctly to provider.createInvoice", async () => {
    const p2 = new MockProvider();
    const app100 = makeApp(p2, 100);
    await request(app100).get("/premium");
    expect(p2.lastAmount).toBe(100);
  });

  it("passes priceSats=1 correctly to provider.createInvoice", async () => {
    const p1 = new MockProvider();
    const app1 = makeApp(p1, 1);
    await request(app1).get("/premium");
    expect(p1.lastAmount).toBe(1);
  });
});

// ─── successful payment flow ──────────────────────────────────────────────────

describe("l402 middleware — successful payment", () => {
  let provider: MockProvider;
  let app: Express;

  beforeEach(() => {
    provider = new MockProvider();
    app = makeApp(provider);
  });

  it("returns 200 with valid L402 token", async () => {
    const token = provider.getValidToken();
    const res = await request(app).get("/premium").set("Authorization", `L402 ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("calls onPayment callback with correct arguments", async () => {
    const onPayment = jest.fn().mockResolvedValue(undefined);
    const appWithCb = express();
    appWithCb.get(
      "/premium",
      l402({ priceSats: 10, lightning: provider, onPayment }),
      (_req, res) => res.json({ ok: true }),
    );

    const token = provider.getValidToken();
    await request(appWithCb).get("/premium").set("Authorization", `L402 ${token}`);

    expect(onPayment).toHaveBeenCalledTimes(1);
    expect(onPayment).toHaveBeenCalledWith(
      expect.objectContaining({ macaroon: expect.any(String), preimage: expect.any(String) }),
      10,
    );
  });

  it("does not call onPayment on 402 (no token)", async () => {
    const onPayment = jest.fn();
    const appWithCb = express();
    appWithCb.get(
      "/premium",
      l402({ priceSats: 10, lightning: provider, onPayment }),
      (_req, res) => res.json({ ok: true }),
    );
    await request(appWithCb).get("/premium");
    expect(onPayment).not.toHaveBeenCalled();
  });

  it("does not call onPayment on replay (401)", async () => {
    const onPayment = jest.fn().mockResolvedValue(undefined);
    const appWithCb = express();
    appWithCb.get(
      "/premium",
      l402({ priceSats: 10, lightning: provider, onPayment }),
      (_req, res) => res.json({ ok: true }),
    );
    const token = provider.getValidToken();
    await request(appWithCb).get("/premium").set("Authorization", `L402 ${token}`);
    await request(appWithCb).get("/premium").set("Authorization", `L402 ${token}`);
    expect(onPayment).toHaveBeenCalledTimes(1); // only on first successful use
  });
});

// ─── replay protection ────────────────────────────────────────────────────────

describe("l402 middleware — replay protection", () => {
  let provider: MockProvider;
  let app: Express;

  beforeEach(() => {
    provider = new MockProvider();
    app = makeApp(provider);
  });

  it("returns 401 on replay attack (same token used twice)", async () => {
    const token = provider.getValidToken();
    const first = await request(app).get("/premium").set("Authorization", `L402 ${token}`);
    expect(first.status).toBe(200);

    const second = await request(app).get("/premium").set("Authorization", `L402 ${token}`);
    expect(second.status).toBe(401);
    expect(second.body.error).toBe("Token already used");
  });

  it("different tokens from different providers work independently", async () => {
    const p1 = new MockProvider();
    const p2 = new MockProvider();
    const app1 = makeApp(p1);
    const app2 = makeApp(p2);

    const t1 = p1.getValidToken();
    const t2 = p2.getValidToken();

    const res1 = await request(app1).get("/premium").set("Authorization", `L402 ${t1}`);
    const res2 = await request(app2).get("/premium").set("Authorization", `L402 ${t2}`);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it("returns 401 with meaningful error on replay", async () => {
    const token = provider.getValidToken();
    await request(app).get("/premium").set("Authorization", `L402 ${token}`);
    const replay = await request(app).get("/premium").set("Authorization", `L402 ${token}`);
    expect(replay.status).toBe(401);
    expect(replay.body).toHaveProperty("error");
  });
});

// ─── multi-route / multi-method ───────────────────────────────────────────────

describe("l402 middleware — multiple routes and methods", () => {
  let provider: MockProvider;
  let app: Express;

  beforeEach(() => {
    provider = new MockProvider();
    app = makeMultiRouteApp(provider);
  });

  it("independent routes each issue their own 402", async () => {
    const cheap = await request(app).get("/cheap");
    const expensive = await request(app).get("/expensive");
    expect(cheap.status).toBe(402);
    expect(expensive.status).toBe(402);
    expect(cheap.body.priceSats).toBe(1);
    expect(expensive.body.priceSats).toBe(1000);
  });

  it("POST route also requires payment", async () => {
    const res = await request(app).post("/premium");
    expect(res.status).toBe(402);
  });

  it("valid token on POST route returns 200", async () => {
    // Need a fresh provider scoped to the POST route price
    const freshProvider = new MockProvider();
    const postApp = express();
    postApp.post(
      "/data",
      l402({ priceSats: 50, lightning: freshProvider }),
      (_req, res) => res.json({ posted: true }),
    );
    const token = freshProvider.getValidToken();
    const res = await request(postApp).post("/data").set("Authorization", `L402 ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.posted).toBe(true);
  });

  it("unprotected routes on same app still respond normally", async () => {
    const mixedApp = express();
    const p = new MockProvider();
    mixedApp.get("/public", (_req, res) => res.json({ free: true }));
    mixedApp.get("/paid", l402({ priceSats: 10, lightning: p }), (_req, res) => res.json({ ok: true }));

    const pub = await request(mixedApp).get("/public");
    expect(pub.status).toBe(200);
    expect(pub.body.free).toBe(true);

    const paid = await request(mixedApp).get("/paid");
    expect(paid.status).toBe(402);
  });
});

// ─── invalid preimage cases ────────────────────────────────────────────────────

describe("l402 middleware — invalid preimage", () => {
  let provider: MockProvider;
  let app: Express;

  beforeEach(() => {
    provider = new MockProvider();
    app = makeApp(provider);
  });

  it("returns 402 when preimage has wrong hash", async () => {
    const badToken = "bm90dmFsaWQ=:" + "e".repeat(64);
    const res = await request(app).get("/premium").set("Authorization", `L402 ${badToken}`);
    expect(res.status).toBe(402);
  });

  it("returns 402 with all-zeros preimage", async () => {
    const mac = Buffer.from(JSON.stringify({ hash: "a".repeat(64), exp: Date.now() + 3_600_000 })).toString("base64");
    const res = await request(app).get("/premium").set("Authorization", `L402 ${mac}:${"0".repeat(64)}`);
    expect(res.status).toBe(402);
  });

  it("returns 402 when preimage is too short", async () => {
    const mac = Buffer.from(JSON.stringify({ hash: "a".repeat(64), exp: Date.now() + 3_600_000 })).toString("base64");
    const res = await request(app).get("/premium").set("Authorization", `L402 ${mac}:abc`);
    expect(res.status).toBe(402);
  });
});

// ─── 402 response body structure ─────────────────────────────────────────────

describe("l402 middleware — 402 response body structure", () => {
  it("402 body has invoice field containing BOLT11 string", async () => {
    const p = new MockProvider();
    const app = makeApp(p);
    const res = await request(app).get("/premium");
    expect(res.status).toBe(402);
    expect(typeof res.body.invoice).toBe("string");
    expect(res.body.invoice).toMatch(/^lnbc/);
  });

  it("402 body has macaroon field as base64 string", async () => {
    const p = new MockProvider();
    const app = makeApp(p);
    const res = await request(app).get("/premium");
    expect(typeof res.body.macaroon).toBe("string");
    const decoded = JSON.parse(Buffer.from(res.body.macaroon, "base64").toString());
    expect(decoded).toHaveProperty("hash");
    expect(decoded).toHaveProperty("exp");
  });

  it("402 body has error field set to 'Payment Required'", async () => {
    const p = new MockProvider();
    const app = makeApp(p);
    const res = await request(app).get("/premium");
    expect(res.body.error).toBe("Payment Required");
  });

  it("WWW-Authenticate header includes macaroon and invoice", async () => {
    const p = new MockProvider();
    const app = makeApp(p);
    const res = await request(app).get("/premium");
    const wwwAuth = res.headers["www-authenticate"] as string;
    expect(wwwAuth).toContain("macaroon=");
    expect(wwwAuth).toContain("invoice=");
  });

  it("402 body priceSats matches configured price for large amounts", async () => {
    const p = new MockProvider();
    const app = makeApp(p, 9999);
    const res = await request(app).get("/premium");
    expect(res.body.priceSats).toBe(9999);
  });
});

// ─── provider error propagation ──────────────────────────────────────────────

describe("l402 middleware — provider error propagation", () => {
  it("returns 5xx when provider.createInvoice throws", async () => {
    const brokenProvider: LightningProvider = {
      createInvoice: async () => { throw new Error("Lightning node unavailable"); },
      checkPayment: async () => false,
    };
    const app = express();
    app.get("/premium", l402({ priceSats: 10, lightning: brokenProvider }), (_req, res) => {
      res.json({ ok: true });
    });
    const res = await request(app).get("/premium");
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it("200 handler is not called when provider throws", async () => {
    const brokenProvider: LightningProvider = {
      createInvoice: async () => { throw new Error("down"); },
      checkPayment: async () => false,
    };
    const handlerSpy = jest.fn((_req: any, res: any) => res.json({ ok: true }));
    const app = express();
    app.get("/premium", l402({ priceSats: 10, lightning: brokenProvider }), handlerSpy);
    await request(app).get("/premium");
    expect(handlerSpy).not.toHaveBeenCalled();
  });
});

// ─── concurrent requests ──────────────────────────────────────────────────────

describe("l402 middleware — concurrent requests", () => {
  it("handles concurrent 402 challenges independently", async () => {
    const p = new MockProvider();
    const app = makeApp(p, 50);
    const [r1, r2, r3] = await Promise.all([
      request(app).get("/premium"),
      request(app).get("/premium"),
      request(app).get("/premium"),
    ]);
    expect(r1.status).toBe(402);
    expect(r2.status).toBe(402);
    expect(r3.status).toBe(402);
  });

  it("handles concurrent valid token requests independently", async () => {
    const p1 = new MockProvider();
    const p2 = new MockProvider();
    const p3 = new MockProvider();
    const app1 = makeApp(p1);
    const app2 = makeApp(p2);
    const app3 = makeApp(p3);
    const [r1, r2, r3] = await Promise.all([
      request(app1).get("/premium").set("Authorization", `L402 ${p1.getValidToken()}`),
      request(app2).get("/premium").set("Authorization", `L402 ${p2.getValidToken()}`),
      request(app3).get("/premium").set("Authorization", `L402 ${p3.getValidToken()}`),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
  });

  it("token used on one app does not affect independent app", async () => {
    const p1 = new MockProvider();
    const p2 = new MockProvider();
    const app1 = makeApp(p1);
    const app2 = makeApp(p2);

    const t1 = p1.getValidToken();
    await request(app1).get("/premium").set("Authorization", `L402 ${t1}`);

    // Using token from p1 on app1 again should be 401 (replay)
    const replay = await request(app1).get("/premium").set("Authorization", `L402 ${t1}`);
    expect(replay.status).toBe(401);

    // But a fresh token on app2 should still work
    const fresh = await request(app2).get("/premium").set("Authorization", `L402 ${p2.getValidToken()}`);
    expect(fresh.status).toBe(200);
  });
});
