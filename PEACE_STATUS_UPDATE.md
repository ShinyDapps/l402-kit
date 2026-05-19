# Status Update — L402 × LAW-N Integration

**To:** Peace (SAGEWORKS AI / PEACEBINFLOW)
**From:** ShinyDapps (l402-kit)
**Date:** 19 May 2026

---

## TL;DR

The L402 × LAW-N integration we discussed in early May is now shipped — `l402-kit@1.9.0` is live on npm, the LAW-N adapter exports cleanly, and the public `/api/lawn-events` HMAC-protected ingest is up. No client events flowing yet because no L402Client app is registered with an `agentId + onEvent` callback in production. Ready whenever you are on the LAW-N side.

---

## What shipped

| Piece | Where | Status |
|---|---|---|
| CloudEvents 1.0 types for 5 L402 events | `src/types/events.ts` | npm `l402-kit@1.9.0` |
| `L402Client` emit hooks (`agentId`, `onEvent`) | `src/client.ts` | npm `l402-kit@1.9.0` |
| `createLawNAdapter({ endpoint, secret })` | `src/integrations/law-n-adapter.ts` | npm `l402-kit/integrations/law-n-adapter` |
| HMAC-SHA256 envelope signing | adapter | tested + 8 TDD tests green |
| `/api/lawn-events` HMAC-protected ingest | l402kit.com Cloudflare Worker | `POST` → 401 without sig (correct) |
| Public agent activity dashboard | `https://l402kit.com/activity` | live, 0 events so far |
| Docs page | `https://docs.l402kit.com/agent/lawn-n` | live, EN + 10 locales |

Schema alignment commit: `35c33ec feat(events): align LAW-N schema with Peace ingest spec`

---

## Open questions on your side

1. **Real LAW-N endpoint URL** — we still have `https://law-n.sageworks.ai/api/l402-events` as the placeholder in the docs example. Should we point users at that, or is there a different production URL now?
2. **Test event** — want a single synthetic L402 event emitted from VERITY's wallet so you can verify ingest end-to-end? I can fire one in < 5 minutes with a real macaroon + preimage. Just say the word.
3. **Schema lock** — the CloudEvents envelope we shipped follows what you sent in early May (subject, type, datacontenttype, data block with payment_hash/preimage/macaroon/agent_id). Any changes since then? Easy to ship a patch release if needed.

---

## What I'd like back from you

- Confirmation that you saw v1.9.0 and the schema still matches your ingest
- Real endpoint URL (or "use the placeholder for now")
- Any thumbs-up I can quote in the docs page to give the integration credibility

No deadline pressure — just want to close the loop since we shipped a release based on your spec.

Sample usage in the wild:

```typescript
import { L402Client } from "l402-kit";
import { createLawNAdapter } from "l402-kit/integrations/law-n-adapter";

const client = new L402Client({
  wallet: myWallet,
  agentId: "agent:research-node-7",
  onEvent: createLawNAdapter({
    endpoint: process.env.LAWN_ENDPOINT,
    secret: process.env.LAWN_SECRET,
  }),
});
```

— Thiago / ShinyDapps
