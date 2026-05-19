# DM to Moritz (Alby dev, browser extension) — Discord

**Recipient:** MoritzK / `moritz1509` / `moritz@getalby.com`
**Context:** Roland (Alby) recused us in DM 19 Mai ("we build competing solutions a bit"). Thiago wants to DM Moritz despite the risk of end-running Roland.

## Risk acknowledgement

Moritz works on the **browser extension** — different surface than Roland's stack. Alby is a small team (~10 devs); they talk. Best mitigation: **acknowledge Roland's recusal up front in the DM itself**, so it's transparent and not a back-channel. Then anchor the message in a narrow, code-level technical question that's plausibly more Moritz's wheelhouse than Roland's.

## The technical hook (real, verified)

Our `AlbyWallet` adapter in `src/agent/wallets/AlbyWallet.ts` uses the **legacy hosted HTTP path**: `POST https://getalby.com/api/payments` with bearer token. It does NOT use WebLN or NWC.

With Alby's direction being self-hosted Hub + NWC as canonical, the question "is the legacy `/api/payments` still maintained or should I cut to NWC?" is genuinely real, narrowly answerable, and respects Moritz's technical authority.

## DM body (copy-paste)

> Hey Moritz —
>
> Saw you build the browser extension; bumping into you here makes sense.
>
> Full transparency first: Roland and I had a DM thread this week where he flagged we land in overlapping territory ("competing solutions a bit"). Fair read on his part. Not routing around — here for a narrow code-level question that's plausibly more your wheelhouse than his.
>
> l402-kit ships an `AlbyWallet` adapter that pays L402 invoices through `https://getalby.com/api/payments` with a bearer token (Alby Hub → Settings → Developer → Access Tokens flow). With NWC clearly being the canonical interface going forward and self-hosted Hub the direction, is the hosted `/api/payments` path still maintained, or should the adapter be cut over to NWC now? Asking before I rewrite either way.
>
> No reply needed if the answer's obvious from your docs — I'd rather not bias you with my assumptions. File: `src/agent/wallets/AlbyWallet.ts` in `l402-kit` on npm if useful.
>
> — Thiago / shinydapps

## Why this works (and why this is the only DM that should be sent)

| Move | Effect |
|---|---|
| "Roland flagged we land in overlapping territory" | Kills the end-run perception. He sees we're not hiding the prior convo. |
| "Not routing around — here for a narrow code-level question" | Names the risk and disarms it. Self-aware = trustworthy. |
| Real technical question | He can answer in 30 seconds: "use NWC" or "/api/payments still maintained". Either resolves it. |
| "asking before I rewrite either way" | Implies we'll improve our code based on his answer. Pure upside for him, no ask of him. |
| "obvious from your docs" | Gives him the out. Doesn't force engagement. |
| File path cited | Concrete. He can grep, or ignore. |

## What this does NOT do

- ✗ Re-pitch l402-kit
- ✗ Ask for partnership / endorsement / integration
- ✗ Argue against Roland's framing
- ✗ Mention VERITY, RADAR, downloads, metrics
- ✗ Ask for meeting / call / DM follow-up

## Scenarios after sending

| Moritz response | Move |
|---|---|
| "Use NWC. `/api/payments` is legacy" | "Got it, will cut over. Thanks." Then actually do it — write `AlbyNWCWallet` adapter, ship in next minor. **Real work earned by the contact.** |
| "Still maintained. Either path fine" | "Good to know. Will leave as-is for now and add NWC adapter alongside in a follow-up." |
| Forwards to Roland or stays silent | Fine. We acknowledged Roland up front. Nothing to defend. Drop it. |
| "Why are you asking me instead of Roland?" | "Browser extension is the surface where WebLN/NWC routing decisions live in practice. Happy to ask Roland too." Then ask Roland the same. |

## What NOT to do if Moritz answers

- Don't immediately pitch other adapters
- Don't ask him to look at the code
- Don't invite him to anything
- Don't follow up after his answer unless we ship the rewrite and want to confirm it's correct
