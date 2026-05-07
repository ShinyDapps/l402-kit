import type { Env } from "../worker";

export async function sweepTransitWallet(env: Env): Promise<void> {
  if (!env.OWNER_LIGHTNING_ADDRESS || !env.BLINK_API_KEY_DEMO) return;

  try {
    // 1. Query +55 balance
    const r = await fetch("https://api.blink.sv/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": env.BLINK_API_KEY_DEMO },
      body: JSON.stringify({
        query: `{ me { defaultAccount { wallets { id walletCurrency balance } } } }`,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return;

    const data = await r.json() as { data?: { me?: { defaultAccount?: { wallets?: { id: string; walletCurrency: string; balance: number }[] } } } };
    const wallets = data?.data?.me?.defaultAccount?.wallets ?? [];
    const btcWallet = wallets.find(w => w.id === env.BLINK_WALLET_ID_DEMO || w.walletCurrency === "BTC");
    if (!btcWallet || btcWallet.balance <= 1) return; // keep 1 sat in +55

    const balanceSats = btcWallet.balance - 1; // always leave 1 sat behind

    // 2. Get invoice from OWNER_LIGHTNING_ADDRESS via LNURL
    const [user, domain] = env.OWNER_LIGHTNING_ADDRESS.split("@");
    if (!user || !domain) return;

    const lnurlRes = await fetch(`https://${domain}/.well-known/lnurlp/${user}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!lnurlRes.ok) return;

    const lnurlData = await lnurlRes.json() as { callback?: string; minSendable?: number; maxSendable?: number };
    if (!lnurlData.callback) return;

    const milliSats = balanceSats * 1000;
    if (lnurlData.minSendable && milliSats < lnurlData.minSendable) return;

    const cbRes = await fetch(`${lnurlData.callback}?amount=${milliSats}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!cbRes.ok) return;

    const cbData = await cbRes.json() as { pr?: string };
    if (!cbData.pr) return;

    // 3. Pay via Supabase (keeps BLINK_API_KEY usage centralized)
    await fetch(`${env.SUPABASE_URL}/functions/v1/pay-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ paymentRequest: cbData.pr }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // fire-and-forget — never throws
  }
}
