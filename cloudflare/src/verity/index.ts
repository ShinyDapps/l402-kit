import type { Env } from "../worker";
import { handleVeritySearch } from "./services/search";
import { handleVerityScrape } from "./services/scrape";
import { handleVerityBtcPrice } from "./services/btcprice";
import { handleVeritySummarize } from "./services/summarize";
import { handleVeritySentiment } from "./services/sentiment";
import { handleVerityDomainIntel } from "./services/domainIntel";
import { handleVerityIntegration } from "./services/integration";
import { getAllPrices } from "./pricing";
import { json } from "./l402";

export async function handleVerity(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const sub = url.pathname.replace(/^\/api\/verity\/?/, "").split("/")[0];

  switch (sub) {
    case "search":      return handleVeritySearch(req, env);
    case "scrape":      return handleVerityScrape(req, env);
    case "btc-price":   return handleVerityBtcPrice(req, env);
    case "summarize":   return handleVeritySummarize(req, env);
    case "sentiment":   return handleVeritySentiment(req, env);
    case "domain-intel": return handleVerityDomainIntel(req, env);
    case "integration": return handleVerityIntegration(req, env);
    default:            return handleVerityIndex(env);
  }
}

async function handleVerityIndex(env: Env): Promise<Response> {
  const prices = await getAllPrices(env);

  return json({
    name: "VERITY",
    description: "Autonomous AI agent. 7 services. Earns in sats, pays in sats.",
    agent_id: "agent:shinydapps.verity",
    wallet: "shinydapps@blink.sv",
    protocol: "L402 (Bitcoin Lightning)",
    services: [
      {
        id: "search",
        endpoint: "/api/verity/search",
        method: "GET or POST",
        params: "q (query string or body)",
        priceSats: prices.search,
        description: "Web search — returns top 10 organic results",
      },
      {
        id: "scrape",
        endpoint: "/api/verity/scrape",
        method: "POST",
        params: "{ url: string }",
        priceSats: prices.scrape,
        description: "Web scraping — returns page content as markdown",
      },
      {
        id: "btc-price",
        endpoint: "/api/verity/btc-price",
        method: "GET",
        params: "none",
        priceSats: prices.btcprice,
        description: "Real-time BTC price in USD, EUR, BRL",
      },
      {
        id: "summarize",
        endpoint: "/api/verity/summarize",
        method: "POST",
        params: "{ text: string, language?: string }",
        priceSats: prices.summarize,
        description: "Text summarization via AI — up to 50,000 chars",
      },
      {
        id: "sentiment",
        endpoint: "/api/verity/sentiment",
        method: "POST",
        params: "{ text: string }",
        priceSats: prices.sentiment,
        description: "Sentiment analysis — returns score, confidence, keywords",
      },
      {
        id: "domain-intel",
        endpoint: "/api/verity/domain-intel",
        method: "GET or POST",
        params: "domain (query string or body)",
        priceSats: prices.domainIntel,
        description: "Domain intelligence — WHOIS, DNS, SSL certificates",
      },
      {
        id: "integration",
        endpoint: "/api/verity/integration",
        method: "POST",
        params: "{ repoUrl: string }",
        priceSats: prices.integration,
        description: "l402-kit integration — analyzes your repo and generates complete middleware code",
      },
    ],
    how_to_pay: {
      step1: "Call any service endpoint → receive HTTP 402 + Lightning invoice",
      step2: "Pay invoice with any Lightning wallet → get preimage",
      step3: "Retry with: Authorization: L402 <macaroon>:<preimage>",
    },
  });
}
