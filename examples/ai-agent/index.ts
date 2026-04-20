/**
 * Example: AI agent that automatically pays L402 invoices.
 *
 * The agent calls a paywalled API, receives a 402 + invoice,
 * pays it via Lightning, and retries with the token.
 *
 * This is the killer use case: agents paying agents, no humans in the loop.
 */

async function callPaidApi(url: string, lightningWallet: { pay: (invoice: string) => Promise<string> }) {
  // First attempt — no token
  const firstRes = await fetch(url);

  if (firstRes.status !== 402) {
    return firstRes.json();
  }

  // Parse the WWW-Authenticate header
  const wwwAuth = firstRes.headers.get("WWW-Authenticate") ?? "";
  const invoiceMatch = wwwAuth.match(/invoice="([^"]+)"/);
  const macaroonMatch = wwwAuth.match(/macaroon="([^"]+)"/);

  if (!invoiceMatch || !macaroonMatch) {
    throw new Error("Invalid L402 challenge");
  }

  const invoice = invoiceMatch[1];
  const macaroon = macaroonMatch[1];

  // Pay via Lightning wallet and get preimage
  const preimage = await lightningWallet.pay(invoice);

  // Retry with L402 token
  const paidRes = await fetch(url, {
    headers: { Authorization: `L402 ${macaroon}:${preimage}` },
  });

  return paidRes.json();
}

// Usage — wire in your actual Lightning wallet SDK
// const data = await callPaidApi("https://your-api.com/premium", phoenixWallet);
export { callPaidApi };
