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

// ─── splitPayment ─────────────────────────────────────────────────────────────

describe("splitPayment", () => {
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

  it("processes payment at MIN_SPLIT_SATS (10)", async () => {
    // LNURL metadata fetch
    queueResponse(mockOk({
      callback: "https://blink.sv/lnurlp/owner/callback",
      minSendable: 1000,
      maxSendable: 1_000_000_000,
    }));
    // LNURL callback
    queueResponse(mockOk({ pr: "lnbc9n1..." }));
    // Blink pay
    queueResponse(mockOk({
      data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } },
    }));

    await splitPayment(10, OWNER, API_KEY, WALLET_ID);
    expect(fetchCalls).toHaveLength(3);
  });

  it("calculates correct fee split (0.3%, min 1 sat)", async () => {
    // 100 sats → fee=1 sat (floor(100*0.003)=0, max(1,0)=1), owner=99
    queueResponse(mockOk({ callback: "https://blink.sv/lnurlp/o/cb", minSendable: 1000, maxSendable: 1_000_000_000 }));
    queueResponse(mockOk({ pr: "lnbc..." }));
    queueResponse(mockOk({ data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } } }));

    await splitPayment(100, OWNER, API_KEY, WALLET_ID);

    // Check the LNURL callback was called with 99000 msats (99 sats)
    const callbackUrl = fetchCalls[1];
    expect(callbackUrl).toContain("amount=99000");
  });

  it("calculates correct fee split for large amount (1000 sats → 3 sat fee)", async () => {
    // 1000 sats → fee=3 sats (floor(1000*0.003)=3), owner=997
    queueResponse(mockOk({ callback: "https://blink.sv/lnurlp/o/cb", minSendable: 1000, maxSendable: 1_000_000_000 }));
    queueResponse(mockOk({ pr: "lnbc..." }));
    queueResponse(mockOk({ data: { lnInvoicePaymentSend: { status: "SUCCESS", errors: [] } } }));

    await splitPayment(1000, OWNER, API_KEY, WALLET_ID);

    const callbackUrl = fetchCalls[1];
    expect(callbackUrl).toContain("amount=997000");
  });

  it("does not throw when LNURL fetch fails", async () => {
    queueResponse({ ok: false, status: 404, json: async () => ({}), text: async () => "Not Found" });

    // Should not throw — errors are swallowed
    await expect(splitPayment(100, OWNER, API_KEY, WALLET_ID)).resolves.toBeUndefined();
  });

  it("does not throw when Blink payment fails", async () => {
    queueResponse(mockOk({ callback: "https://blink.sv/lnurlp/o/cb", minSendable: 1000, maxSendable: 1_000_000_000 }));
    queueResponse(mockOk({ pr: "lnbc..." }));
    // Blink errors array
    queueResponse(mockOk({
      data: { lnInvoicePaymentSend: { status: "FAILED", errors: [{ message: "Insufficient balance" }] } },
    }));

    await expect(splitPayment(100, OWNER, API_KEY, WALLET_ID)).resolves.toBeUndefined();
  });
});
