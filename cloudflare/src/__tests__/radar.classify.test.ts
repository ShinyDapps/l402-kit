/**
 * TDD — isBuyerLead() rejects competitors, infra, examples.
 *
 * VERITY procura COMPRADORES (alguém que pagaria por L402 / monetizar API).
 * Antes rejeitava só seenBefore + isLiveRepo. Agora também filtra:
 *   - Infra do próprio L402 (lightninglabs/*, l402-protocol/*, Fewsats/awesome-*)
 *   - Competidores (posts promovendo DeepBlue/Fynx/x402-USDC/Solana pay-per-call)
 *   - Bibliotecas-cliente (refined-element/l402-requests etc — não compram)
 */

import { isBuyerLead } from "../verity/radar/scoring";

describe("isBuyerLead — infra rejection", () => {
  it("rejects lightninglabs/L402 (spec owner)", () => {
    expect(isBuyerLead("https://github.com/lightninglabs/L402", "L402: Lightning HTTP 402", "")).toBe(false);
  });

  it("rejects lightninglabs/aperture (reference impl)", () => {
    expect(isBuyerLead("https://github.com/lightninglabs/aperture", "aperture", "")).toBe(false);
  });

  it("rejects l402-protocol/* (org owns the spec)", () => {
    expect(isBuyerLead("https://github.com/l402-protocol/l402-server-example", "Example", "")).toBe(false);
  });

  it("rejects Fewsats/awesome-L402 (curated list, not a buyer)", () => {
    expect(isBuyerLead("https://github.com/Fewsats/awesome-L402", "awesome-L402", "")).toBe(false);
  });

  it("rejects client libraries (l402-requests)", () => {
    expect(isBuyerLead("https://github.com/refined-element/l402-requests", "Auto-paying L402 client", "")).toBe(false);
  });
});

describe("isBuyerLead — fiat gateway rejection", () => {
  it("rejects Payflow Pro credit card questions", () => {
    expect(isBuyerLead(
      "https://stackoverflow.com/questions/34090919/how-do-i-charge-a-stored-credit-card-with-the-payflow-pro-api",
      "How do I charge a stored credit card with the payflow pro API?",
      "I'm using the Payflow Pro API to charge stored credit cards",
    )).toBe(false);
  });

  it("rejects Stripe subscription billing posts", () => {
    expect(isBuyerLead(
      "https://example.com/billing-with-stripe",
      "Setting up Stripe subscription billing for your API",
      "Use Stripe to charge credit card and handle invoicing per call",
    )).toBe(false);
  });

  it("rejects PayPal API credit card processing", () => {
    expect(isBuyerLead(
      "https://example.com/paypal",
      "PayPal API integration",
      "Charge stored credit card via PayPal REST API",
    )).toBe(false);
  });
});

describe("isBuyerLead — Bitcoin L2 competitor rejection", () => {
  it("rejects PingPay on Rootstock", () => {
    expect(isBuyerLead(
      "https://rootstock.hashnode.dev/pingpay-pay-per-call-apis-on-rootstock",
      "Pay Per Call APIs with PingPay on Rootstock",
      "PingPay enables pay-per-call APIs on the Rootstock blockchain",
    )).toBe(false);
  });

  it("rejects Rootstock pay-per-call generally", () => {
    expect(isBuyerLead(
      "https://example.com/rsk",
      "Pay-per-call on Rootstock",
      "Build pay per call APIs using RBTC on Rootstock",
    )).toBe(false);
  });
});

describe("isBuyerLead — competitor rejection", () => {
  it("rejects x402 USDC promo posts (DeepBlue pattern)", () => {
    expect(isBuyerLead(
      "https://github.com/run-llama/llama_index/discussions/21114",
      "DeepBlue: x402 pay-per-call crypto data API — no API keys",
      "We built DeepBlue — agents pay per call in USDC (Base or Polygon)",
    )).toBe(false);
  });

  it("rejects Solana pay-per-call SDK promo (Fynx pattern)", () => {
    expect(isBuyerLead(
      "https://github.com/shibu0x/Fynx",
      "Fynx transforms your API routes",
      "Pay-per-call API monetization using Solana",
    )).toBe(false);
  });

  it("rejects x402-native framing", () => {
    expect(isBuyerLead(
      "https://github.com/huggingface/smolagents/discussions/2116",
      "DeepBlue: x402 crypto data API for smol agents",
      "We built DeepBlue around the x402 protocol",
    )).toBe(false);
  });
});

describe("isBuyerLead — real buyers pass", () => {
  it("accepts a dev asking how to monetize their API", () => {
    expect(isBuyerLead(
      "https://stackoverflow.com/questions/12345",
      "How do I charge per call on my Express API?",
      "I have a FastAPI endpoint and want to add pay-per-request without API keys",
    )).toBe(true);
  });

  it("accepts AI agent dev needing to pay external APIs", () => {
    expect(isBuyerLead(
      "https://github.com/some-org/agent-framework/issues/42",
      "Support for paid API calls",
      "Our agent needs to call paid APIs and we need a payment layer",
    )).toBe(true);
  });

  it("accepts micropayment discussions on neutral repos", () => {
    expect(isBuyerLead(
      "https://github.com/mempool/mempool/discussions/4649",
      "Lightning L402 API Pay-per-use",
      "we are working on L402, an API authentication protocol that leverages lightning",
    )).toBe(true);
  });

  it("accepts btcpayserver / lnbits discussions (potential buyers)", () => {
    expect(isBuyerLead(
      "https://github.com/btcpayserver/btcpayserver/discussions/123",
      "Adding API monetization layer",
      "How to add pay-per-request to BTCPay plugins",
    )).toBe(true);
  });
});
