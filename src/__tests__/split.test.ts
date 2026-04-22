import { splitPayment } from "../split";

// ─── fetch mock ───────────────────────────────────────────────────────────────

type FetchResponse = { ok: boolean; status?: number; json: () => Promise<unknown>; text?: () => Promise<string> };

let fetchCalls: string[] = [];
let fetchResponses: FetchResponse[] = [];

function queueResponse(resp: FetchResponse) {
  fetchResponses.push(resp);
}

function mockOk(body: unknown): FetchResponse {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

function mockError(status: number): FetchResponse {
  return { ok: false, status, json: async () => ({}), text: async () => "Error" };
}

function queueFullSplit(ownerSats: number) {
  queueResponse(mockOk({
    callback: "https://blink.sv/lnurlp/owner/callback",
    minSendable: 1000,
    maxSendable: 1_000_000_000,
  }));
  queueResponse(mockOk({ pr: `lnbc${ownerSats}n1...` }));
  queueResponse(mockOk({
    data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
  }));
}

beforeEach(() => {
  fetchCalls = [];
  fetchResponses = [];
  globalThis.fetch = jest.fn().mockImplementation((url: string) => {
    fetchCalls.push(url);
    const resp = fetchResponses.shift();
    if (!resp) throw new Error(`Unexpected fetch call to ${url}`);
    return Promise.resolve(resp);
  }) as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── skip conditions ──────────────────────────────────────────────────────────

describe("splitPayment — skip conditions", () => {
  const OWNER = "owner@blink.sv";
  const API_KEY = "blink_testkey";
  const WALLET_ID = "wallet-abc";

  it("skips payment below MIN_SPLIT_SATS (10)", async () => {
    await splitPayment(9, OWNER, API_KEY, WALLET_ID);
    expect(fetchCalls).toHaveLength(0);
  });

  it("skips payment at exactly 0 sats", async () => {
    await splitPayment(0, OWNER, API_KEY, WALLET_ID);
    expect(fetchCalls).toHaveLength(0);
  });

  it("skips payment at 1 sat", async () => {
    await splitPayment(1, OWNER, API_KEY, WALLET_ID);
    expect(fetchCalls).toHaveLength(0);
  });

  it("skips payment at 9 sats (one below threshold)", async () => {
    await splitPayment(9, OWNER, API_KEY, WALLET_ID);
    expect(fetchCalls).toHaveLength(0);
  });

  it("does not skip payment at exactly MIN_SPLIT_SATS (10)", async () => {
    queueFullSplit(9);
    await splitPayment(10, OWNER, API_KEY, WALLET_ID);
    expect(fetchCalls).toHaveLength(3);
  });

  it("does not skip payment at 11 sats", async () => {
    queueFullSplit(10);
    await splitPayment(11, OWNER, API_KEY, WALLET_ID);
    expect(fetchCalls).toHaveLength(3);
  });
});

// ─── fee calculation ──────────────────────────────────────────────────────────

describe("splitPayment — fee calculation", () => {
  const OWNER = "owner@blink.sv";
  const API_KEY = "blink_testkey";
  const WALLET_ID = "wallet-abc";

  it("100 sats → 1 sat fee (min fee), 99 sats to owner", async () => {
    queueFullSplit(99);
    await splitPayment(100, OWNER, API_KEY, WALLET_ID);
    const callbackUrl = fetchCalls[1];
    expect(callbackUrl).toContain("amount=99000"); // 99 sats in msats
  });

  it("1000 sats → 3 sat fee (0.3%), 997 sats to owner", async () => {
    queueFullSplit(997);
    await splitPayment(1000, OWNER, API_KEY, WALLET_ID);
    const callbackUrl = fetchCalls[1];
    expect(callbackUrl).toContain("amount=997000");
  });

  it("10000 sats → 30 sat fee, 9970 sats to owner", async () => {
    queueFullSplit(9970);
    await splitPayment(10000, OWNER, API_KEY, WALLET_ID);
    const callbackUrl = fetchCalls[1];
    expect(callbackUrl).toContain("amount=9970000");
  });

  it("10 sats → 1 sat fee (minimum), 9 sats to owner", async () => {
    queueFullSplit(9);
    await splitPayment(10, OWNER, API_KEY, WALLET_ID);
    const callbackUrl = fetchCalls[1];
    expect(callbackUrl).toContain("amount=9000");
  });

  it("333 sats → 1 sat fee (floor(333*0.003)=0, max(1,0)=1), 332 to owner", async () => {
    queueFullSplit(332);
    await splitPayment(333, OWNER, API_KEY, WALLET_ID);
    const callbackUrl = fetchCalls[1];
    expect(callbackUrl).toContain("amount=332000");
  });

  it("owner amount is always in msats (multiply by 1000)", async () => {
    queueFullSplit(99);
    await splitPayment(100, OWNER, API_KEY, WALLET_ID);
    const callbackUrl = fetchCalls[1];
    expect(callbackUrl).toMatch(/amount=\d+000/); // must end in 3 zeros (msats)
  });
});

// ─── network error resilience ─────────────────────────────────────────────────

describe("splitPayment — error resilience", () => {
  const OWNER = "owner@blink.sv";
  const API_KEY = "blink_testkey";
  const WALLET_ID = "wallet-abc";

  it("does not throw when LNURL metadata fetch returns 404", async () => {
    queueResponse(mockError(404));
    await expect(splitPayment(100, OWNER, API_KEY, WALLET_ID)).resolves.toBeUndefined();
  });

  it("does not throw when LNURL metadata fetch returns 500", async () => {
    queueResponse(mockError(500));
    await expect(splitPayment(100, OWNER, API_KEY, WALLET_ID)).resolves.toBeUndefined();
  });

  it("does not throw when LNURL callback returns error", async () => {
    queueResponse(mockOk({ callback: "https://blink.sv/lnurlp/o/cb", minSendable: 1000, maxSendable: 1_000_000_000 }));
    queueResponse(mockError(500));
    await expect(splitPayment(100, OWNER, API_KEY, WALLET_ID)).resolves.toBeUndefined();
  });

  it("does not throw when Blink payment fails (status=FAILED)", async () => {
    queueResponse(mockOk({ callback: "https://blink.sv/lnurlp/o/cb", minSendable: 1000, maxSendable: 1_000_000_000 }));
    queueResponse(mockOk({ pr: "lnbc..." }));
    queueResponse(mockOk({
      data: { lnInvoicePaymentSend: { status: "FAILED", errors: [{ message: "Insufficient balance" }] } },
    }));
    await expect(splitPayment(100, OWNER, API_KEY, WALLET_ID)).resolves.toBeUndefined();
  });

  it("does not throw when Blink returns HTTP error", async () => {
    queueResponse(mockOk({ callback: "https://blink.sv/lnurlp/o/cb", minSendable: 1000, maxSendable: 1_000_000_000 }));
    queueResponse(mockOk({ pr: "lnbc..." }));
    queueResponse(mockError(500));
    await expect(splitPayment(100, OWNER, API_KEY, WALLET_ID)).resolves.toBeUndefined();
  });

  it("always returns undefined (fire-and-forget)", async () => {
    queueFullSplit(99);
    const result = await splitPayment(100, OWNER, API_KEY, WALLET_ID);
    expect(result).toBeUndefined();
  });
});

// ─── fetch call sequence ──────────────────────────────────────────────────────

describe("splitPayment — fetch call sequence", () => {
  const OWNER = "owner@blink.sv";
  const API_KEY = "blink_testkey";
  const WALLET_ID = "wallet-abc";

  it("makes exactly 3 fetch calls for a successful split", async () => {
    queueFullSplit(99);
    await splitPayment(100, OWNER, API_KEY, WALLET_ID);
    expect(fetchCalls).toHaveLength(3);
  });

  it("first fetch resolves LNURL metadata for owner address", async () => {
    queueFullSplit(99);
    await splitPayment(100, OWNER, API_KEY, WALLET_ID);
    expect(fetchCalls[0]).toContain("owner");
  });

  it("third fetch is a POST to Blink GraphQL API", async () => {
    queueFullSplit(99);
    await splitPayment(100, OWNER, API_KEY, WALLET_ID);
    expect(fetchCalls[2]).toContain("blink");
  });
});
