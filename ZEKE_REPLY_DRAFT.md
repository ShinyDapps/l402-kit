# Reply to Zeke — x402-foundation/x402 PR #2262

**Post on:** https://github.com/x402-foundation/x402/pull/2262
**Recipient threads:** 4 emails from `zekebuilds-lab` (May 10–13)

---

## Single combined reply (recommended)

> @zekebuilds-lab — appreciate the depth across all four threads, batching the reply here.
>
> **On step 5 vs step 6 (substitution vs minted-invoice).** Good distinction, and you're right that our naming flattens them. What we label "Step 6 — invoice substitution guard" in `facilitator/scheme.ts` is your step 5 — three-way string compare. The cross-server replay (your step 6) is a real surface for multi-receiver facilitators, and the spec test matrix should cover it.
>
> Yes, please send the `cross_server_invoice` test in TS. Wiring it in will likely require surfacing some kind of optional minted-invoice hook on the receiver side; I'd rather see the test concrete before locking in the API shape, since the hook signature has implications for both the reference adapters and downstream impls. Drop the test in and we can settle the interface together in the review.
>
> **On `@powforge/l402-verify@0.1.0`.** Thanks for shipping the standalone, and the injectable `checkPaidFn` is the right cut. For the mechanism package in this PR I'm keeping verification inline — x402 mechanism packages are zero-dep by convention, and the JSDoc already cites `x402-verify.js#L172-L207` for the step-6-before-decode ordering. On the buyer half (downstream of this PR), I'll take a closer look at the package surface and decide on adoption when I cut the next minor of `l402-kit`. No timeline on that — I want to see how the spec tests settle here first.
>
> **On NWC (NIP-47) as a third backend.** Not a blocker on #2262, agreed. The operator angle (Alby Hub fronting an existing LND/CLN, no second custodial account) is genuinely the strongest argument for it — that's the gap LNBits + Blink leave open. Useful that you've validated it end-to-end in `@powforge/x402-lightning` and `@powforge/402-mcp`.
>
> On the interface: `LightningReceiver` (`types.ts` L40-55) is `createInvoice(amountMsat, memo, expirySeconds, network) → Promise<string>` and `lookupInvoice(invoice, network) → Promise<LightningInvoiceStatus | null>` — no URL fields, no fetch hooks, no transport-shaped assumptions in parameters or return types. If you see something that *would* be awkward over a relay, please flag it here before #2262 exits draft so we adjust in this PR. Otherwise I'd rather wait until I can read the follow-on diff before committing to a specific shape; happy to review on merits when you put it up.
>
> On settlement-notification design (polling `lookupInvoice` vs. Nostr-event subscription helper) — I don't want to anchor a preference before seeing how the adapter actually shapes up; whichever lands as the minimal-surface first cut is fine as long as it doesn't force a relay-client dependency into the base path. Open to whatever you think is cleanest, will weigh on the PR.
>
> `(timestamp + expiry) * 1000` alignment in step 8 was deliberate — your spec page was the cleanest source on the unit-mismatch foot-gun, and tests broke until we got it right. Glad it lands.
>
> — @ThiagoDataEngineer

---

## Why this response

| Zeke's offer | My reply | Why |
|---|---|---|
| Cross-server invoice test | **Accept** + add optional `mintedInvoices` hook | Real surface for multi-receiver facilitators. Costs ~30 LOC. His test for free. |
| `@powforge/l402-verify` dep in this PR | **Decline politely** — keep mechanism zero-dep | x402 mechanism packages are intentionally minimal. Cite him in JSDoc instead. |
| `@powforge/l402-verify` downstream | **Accept** — evaluate for `l402-kit@1.10` buyer side | Gives him a real consumer. Reduces our maintenance. Clear attribution. |
| NWC follow-on PR | **Accept** + ask if current interface needs adjustment | Self-custodial path is the missing third leg. Interface is already transport-agnostic, but better to lock that in his view before #2262 lands. |

---

## After he replies

1. **If he sends the cross_server test** → wire in, add `mintedInvoices?: Set<string> | (hash) => boolean` to `LightningReceiver`, ship.
2. **If he flags interface gaps** → fix in this PR, not follow-on.
3. **If he confirms interface is fine** → land #2262 (move from draft to ready-for-review), then he opens NWC PR.
4. **`l402-kit@1.10` evaluation** → separate session, after #2262 lands. Update `STATUS.md` and `project_l402kit.md`.
