# Benchmark — Alby AI Agents Landing vs l402kit.com

**Date:** 2026-05-19
**Source:** screenshot from user (Alby "Give your AI agent a wallet" page) + `getalby.com/ai` + 402index.io
**Goal:** identify what's working in their design, what to adopt, what NOT to copy, and concrete proposals.

---

## 1. Side-by-side at a glance

| Axis | Alby Hub (`getalby.com/ai`) | l402kit.com | Winner |
|---|---|---|---|
| **Hero headline** | "Give your AI agent a wallet" — concrete user outcome in 7 words | "Toda API é uma troca. Paga via Lightning — sem intermediário" — abstract philosophical | **Alby (much)** |
| **Hero demo** | Live terminal showing Claude executing real prompts ("Buy a $15 DoorDash gift card" → "Paying 45,210 sats" → "Done!") | Code snippet showing `import` lines | **Alby (huge)** |
| **Value props framing** | User concerns: Stay in Control / Private by Default / Instant Access | Dev concerns: MIT / TS / Python / Go / Rust / AI-native | **Alby** for user-first; us better for devs (but we need both) |
| **Interactive try-it** | Real input box: `> send $5 to hub@getalby.com for coffee` you can type into | Static code blocks | **Alby** |
| **Ecosystem proof** | Featured Services: Bitrefill, PPQ.ai, **402 Index** — concrete external products | "Use cases" copy + abstract diagrams | **Alby** |
| **Length** | Short, scannable, lots of whitespace | 3,678 lines HTML, heavy scroll | **Alby** |
| **Aesthetic** | Clean white + yellow accent, SaaS look | Bitcoin-orange dark, hacker/crypto look | Tie (different audiences) |
| **Information architecture** | Outcome → How → Ecosystem → Setup | Tagline → Code → Modes → MCP → Use Cases → Flow → Stats | **Alby** (linear) |
| **Multi-tab capabilities** | Wallet/Shopping/Creative/Services/Automation/Build Apps/Node | None (linear scroll) | **Alby** |
| **Strategic pitch direction** | "Your agent SPENDS via Alby" | "Your API EARNS sats from agents" | **Us** (earning > spending commercially) |

---

## 2. What Alby does that's structurally better

### 2.1 Outcome-led headline
"Give your AI agent a wallet" tells you what you GET. Ours tells you what we BELIEVE ("every API is an exchange"). User filter: does the reader know in 2 seconds what l402-kit does FOR THEM? Today: no. With Alby's: yes.

### 2.2 Terminal demo with real prompts, not code
Their demo shows the user typing natural-language commands and the agent responding with **Lightning settlement events** ("Paying 45,210 sats", "Sent! Payment confirmed"). This sells the OUTCOME — Bitcoin moved, things got done — not the implementation.

Ours leads with `import { l402 } from "l402-kit"` and three lines of middleware. That's correct for the install step but wrong for the *first* impression. Code is a credibility check at line 30 of attention, not the headline.

### 2.3 Three value props as user concerns
Stay in Control / Private by Default / Instant Access — these are user concerns, not product features. They map to the buyer's anxieties (will it overspend? is it private? does it work with what I already use?).

Our hero badge lists "MIT · TS · Python · Go · Rust · AI-native" — those are dev concerns, all after-purchase considerations. The buyer doesn't care if it's MIT until they've decided to install it.

### 2.4 Featured Services as ecosystem proof
By naming Bitrefill, PPQ.ai, 402 Index as featured services, Alby:
- Shows the agent can do REAL things (not theoretical)
- Lets external products do the credibility heavy-lifting
- Creates a network effect display: "look how much is here"

Our equivalent should be: VERITY's 11 services + any external L402 endpoints + companies using l402-kit. We have material — it's not surfaced.

### 2.5 Tabs to display breadth without overwhelm
Their "What can your agent do?" section has 7 tabs (Wallet/Shopping/Creative/Services/Automation/Build Apps/Node) — each surfaces ~3-5 example prompts. User skims the tab labels, picks the relevant one, sees concrete prompts. **No scrolling**.

Our landing is 3,678 lines and forces the reader through every section linearly. We have the same breadth (TypeScript, Python, Go, Rust, MCP, demo flow, use cases) — but no progressive disclosure.

---

## 3. What NOT to copy

### 3.1 White aesthetic
Alby's white + yellow SaaS look is correct for their broader Lightning-consumer audience. Our audience is **Bitcoin-curious devs and AI agent builders** — orange-on-dark hacker aesthetic is an asset for that audience. Don't go white.

### 3.2 End-user framing
"Buy a $15 DoorDash gift card / send $5 to friend" is consumer Lightning. We are B2B/B2D infrastructure. Our prompts should be **B2D**: "Monetize my FastAPI endpoint" / "Charge agents per LLM call" / "Generate revenue from my open-source API".

### 3.3 Featured Services as the closer
For Alby, featured services are demand-side (where agents spend). For us, the equivalent would be either supply-side proof (APIs charging via l402-kit) or use-cases. The narrative shape is different — don't just clone the section.

---

## 4. The strategic asymmetry — our opportunity

Alby's pitch is **agent SPENDS**. Ours is **API EARNS**.

| | Alby | l402-kit |
|---|---|---|
| User | End user with AI agent | Developer with an API |
| Outcome | Agent buys stuff | API gets paid |
| Emotional pull | Cool / curious / convenient | Revenue / sovereignty / no-Stripe |
| Buyer urgency | Low (no AI agent yet) | High (devs already monetize) |
| Network position | Demand side | Supply side |

**Implication:** the two sides are **complementary**, not competing. Alby's "Featured Services" already features 402 Index, which is the directory of L402 supply. We are the toolkit that builds the supply Alby's users consume. We can lean into this:

> "Alby Hub lets agents spend. l402-kit lets your API earn. Plug them together and you have a closed loop where AI agents pay APIs directly."

That positioning eats Alby's audience growth as our growth — every new Alby Hub user is a potential customer for an l402-kit-protected API.

---

## 5. Top 5 concrete changes (prioritized)

### #1 — Rewrite the hero headline (1 day)

Current: "Toda API é uma troca. Paga via Lightning — sem intermediário."

Test 3 variants:
- **A:** "Your API earns Bitcoin from AI agents. Three lines of code."
- **B:** "Make your API pay-per-call. In sats. Settles in 1 second."
- **C:** "Give your API a Bitcoin price. AI agents pay automatically."

A is the strongest — it names the customer (your API), the outcome (earns Bitcoin), the buyer (AI agents), and the cost (3 lines). Mirrors Alby's compression.

### #2 — Replace code-first hero demo with outcome-first terminal (2 days)

Current: code snippets. Proposed:

```
> An AI agent calls https://your-api.com/forecast

  HTTP/1.1 402 Payment Required
  WWW-Authenticate: L402 invoice="lnbc100..."

> Agent pays 100 sats via Lightning

  ✓ Settled in 0.4s

> Agent receives:

  { "forecast": "rain expected at 14:00", "confidence": 0.87 }

  Revenue → your Lightning Address.
```

Identical structural pattern to Alby's Claude terminal — shows the OUTCOME, not the install.

### #3 — Add VERITY interactive demo box (3 days)

Alby has a typeable prompt input. We have **11 services live at l402kit.com/api/verity**. Put an interactive box on the landing:

```
[ try VERITY now → ] [dropdown: btc-price | search | translate | ...]
   ↓ click
   HTTP 402 returned · invoice generated · "pay 100 sats to continue" demo
```

Reader sees a REAL L402 flow firing live on our infra. Closes the credibility gap that no static demo can.

### #4 — Restructure to outcome → how → ecosystem → setup (1 day)

Cut the 3,678-line scroll-of-everything. New IA:

1. Hero — outcome (#1 above)
2. Live demo — terminal (#2 above)
3. Three concerns — built for **earning** APIs:
   - Settles in 1 second (concrete)
   - No bank, no chargebacks (concrete)
   - Works with any stack (TS/Python/Go/Rust at the END, not the START)
4. What can your API charge for? — tabs (LLM calls / Data / Scraping / Compute / MCP tools)
5. Featured APIs using l402-kit — show VERITY + any external
6. Three-line install — code at the END as proof, not headline
7. Docs / GitHub

### #5 — Get listed on 402index.io (1 hour)

Per memory `credentials.md`: 402 Index says we're "verified ✅" since 2026-04-29 with `services_count: 0` (auto-indexação pendente). Per WebFetch of `402index.io`: we are NOT listed in the directory. **Alby features 402 Index in their landing.** Their users browse 402 Index → currently can't find us.

Action: re-submit endpoints (the 11 VERITY services) to 402 Index. Now. This is the cheapest distribution win of the day — Alby is literally sending traffic there.

---

## 6. Things we have that Alby DOESN'T (don't bury)

- **VERITY** — an autonomous agent that earns sats AND pays sats. Alby's customers will eventually want this; we already shipped it.
- **Multi-language** — Alby is Node/TS-shaped. We ship TypeScript, Python, Go, Rust.
- **LAW-N integration** — behavioral event bridge to MindsEye. No payment infra has this.
- **MCP server** — published, Glama 92% A-A-B. Alby also has MCP but ours is L402-specific.
- **0.3% fee or 0% sovereign mode** — Alby Hub is self-hosted-only (free) but we offer both managed-with-tiny-fee AND fully sovereign.

The redesign should foreground these, not hide them at line 2,500.

---

## 7. Today's low-hanging actions (< 4 hours total)

| Action | Time | Impact |
|---|---|---|
| Resubmit VERITY services to 402index.io | 30 min | Direct distribution from Alby's landing |
| Draft 3 hero headline variants in a copy doc | 20 min | Foundation for redesign |
| Capture screenshot of Alby's terminal for design reference | 5 min | Visual template for our terminal |
| Read our `/api/verity/services` JSON to see what's exposed | 10 min | Pick the cleanest service to demo |
| Try `https://l402kit.com/api/verity/btc-price` in browser and capture the 402 response | 5 min | Real demo material |

---

## 8. What I'd NOT do without thinking first

- **Rewrite the whole landing in one shot.** 3,678 lines of HTML is a known-working artifact. Iterate hero + demo first, ship, measure, then go deeper.
- **Drop the multi-language hero badge.** Devs picking l402-kit DO care that it's not Node-only. The fix is reordering, not removing.
- **Copy Alby's white aesthetic.** Our brand palette is approved (memory `project_brand_palette`). Bitcoin-orange dark is an asset for our audience.
- **Pitch Alby as competitor on the landing.** They're complementary supply/demand. Mentioning them is fine; positioning against them isn't.

---

## 9. Open questions for Thiago

1. **Hero headline preference?** A/B/C above, or different angle entirely?
2. **Interactive demo on landing — yes or wait?** Real call to `/api/verity/btc-price` returning 402 is feasible today but adds runtime cost (100 sats per real call). Synthetic visualization is free but less honest.
3. **Resubmit to 402index.io now?** Memory says auto-indexação foi prometida em Abr-29 mas serviços ainda não aparecem. Vale re-submit manual.
4. **VERITY's 11 services as Featured APIs?** Or wait until we have external customers using l402-kit and show those instead?

---

Sources:
- [Alby Hub](https://albyhub.com/)
- [Alby AI page](https://getalby.com/ai)
- [Alby Bitcoin Payments MCP Server](https://blog.getalby.com/alby-mcp-server-payments-for-your-ai-agent/)
- [402 Index](https://402index.io)
- [getalby.com/claude](https://getalby.com/claude)
