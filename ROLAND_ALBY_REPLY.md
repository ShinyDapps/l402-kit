# Reply to Roland (Alby dev) — Discord DM

**Thread:** ShinyDapps → Roland (`rolznz`, dev at getalby.com) on Discord
**Context:**
- 2026-05-03: Thiago DM'd Roland pitching l402-kit as complementary (NWC wallet side + l402-kit API paywall side = full agentic stack)
- 2026-05-12: Roland replied "we build competing solutions a bit 🙂"
- 2026-05-19: Reply needed

## What's at stake

Roland decided we compete on some axis. Arguing the point digs the hole. Better to:
1. Acknowledge his read without retreating
2. Reframe l402-kit's actual position (protocol layer with multi-wallet adapter slots)
3. Land the quiet fact: **we already ship Alby adapters on both halves** (`src/providers/alby.ts` server-side, `src/agent/wallets/AlbyWallet.ts` client-side). Not replacing Alby — using Alby.
4. Leave the door open without asking for anything

Don't:
- Defend the "complementary" framing (he rejected it)
- Pitch harder or ask for a call
- Mention metrics / downloads / users (defensive)
- Argue what Alby is or isn't

## Discord reply (copy-paste)

> Hey Roland — fair read, no argument on the surface overlap.
>
> The way I draw the line: l402-kit sits at the protocol layer (server-side 402 + macaroon issuance + verification), with adapter slots for whichever wallet mints/pays the invoice. Alby is already one of the adapters we ship on both halves — `providers/alby` for the receiving side, `AlbyWallet` for the autopay side. So the pitch was less "you should integrate" and more "if someone shows up wanting to charge sats and route through Alby, the wiring's already there."
>
> If that angle ever lines up on your side, I'm around. Otherwise no pressure — keep building.
>
> — Thiago

## Why this works

| Move | Effect |
|---|---|
| "fair read, no argument" | Removes the fight. He doesn't have to defend his framing |
| "The way I draw the line" | Reframes without contradicting — implies our box and his box are different shapes |
| "Alby is already one of the adapters we ship on both halves" | Quiet but decisive. Repositions us from competitor to consumer of Alby's surface |
| Naming files (`providers/alby`, `AlbyWallet`) | Concrete, verifiable, technical — he can grep |
| "if someone shows up wanting to..." | Decentralizes the ask. We're not asking HIM to do anything |
| "I'm around. Otherwise no pressure" | Door open without need |
| "keep building" | Genuine, brief, no flattery |

## What this does NOT commit to

- ✗ No call / meeting request
- ✗ No co-marketing / co-promotion offer
- ✗ No API integration commitment
- ✗ No claim that we're a fit for Alby's roadmap
- ✗ No claim about who's bigger / better / first

## If Roland replies

| Scenario | Move |
|---|---|
| "Cool, didn't know you wrapped us — what does the adapter actually do?" | Send him the file links. No more, no less. He'll read the code or not. |
| "We're working on our own L402 / API monetization thing" | "Makes sense — Alby Hub is the closest piece to it. Happy to keep our adapter aligned with whatever you ship." Don't probe for specs. |
| "What's the wallet adapter contract look like?" | TypeScript interface from `src/agent/wallets/index.ts`. Two methods: `payInvoice(invoice, network)` and `getBalance?()`. He can extend or critique. |
| Silence | Leave it. Don't double-tap. Re-engage only if there's a concrete new thing (Alby releases API monetization tool, or an Alby user files an l402-kit issue). |
