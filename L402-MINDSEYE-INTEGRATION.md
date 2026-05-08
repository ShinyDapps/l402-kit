# L402 × MindsEye — Integration Architecture

**Author:** Thiago (ShinyDapps / l402-kit)  
**Date:** May 2026  
**Status:** Draft — for async review by Peace (SAGEWORKS AI)

---

## 1. The L402 Event — What It Carries

Every successful L402 payment produces a structured, verifiable event. The fields are:

| Field | Type | Description |
|---|---|---|
| `payment_hash` | 32-byte hex | Unique identifier — SHA256 of the Lightning preimage. Cryptographically unforgeable. |
| `preimage` | 32-byte hex | Payment proof. Possession proves the invoice was settled. |
| `macaroon` | base64 JSON | Bearer credential. Contains `hash` + `exp` (expiry). Extensible with caveats. |
| `endpoint` | string | The API endpoint that was accessed. |
| `amount_sats` | integer | Amount paid in satoshis. |
| `timestamp` | Unix ms | When the payment was verified server-side. |
| `agent_id` | string (optional) | Caller identity if passed via header. |

This event is **self-contained and verifiable without a database call**. The server only runs `SHA256(preimage) == payment_hash` — one comparison, no network.

---

## 2. The Macaroon as Behavioral Contract

A standard L402 macaroon today carries two fields:

```json
{
  "hash": "239ed3c3...",
  "exp": 1778041791815
}
```

But the format supports **caveats** — additional constraints that narrow the credential's scope without invalidating its cryptographic chain. Examples:

```json
{
  "hash": "239ed3c3...",
  "exp": 1778041791815,
  "endpoint": "/api/summarize",
  "max_calls": 1,
  "agent_id": "agent-xyz-001",
  "outcome_required": "structured_json"
}
```

This transforms the macaroon from a payment receipt into a **behavioral contract**:
- The agent paid for a specific action (`/api/summarize`)
- It may call it exactly once
- It must return structured JSON
- The contract expires in 1 hour

Crucially: **these constraints are verifiable at the server without querying any external system.** The macaroon is the contract.

---

## 3. Proposed LAW-N Event Structure

An L402 payment event would slot into a LAW-N stream as a labeled, timestamped entry:

```json
{
  "event_type": "l402.payment.verified",
  "timestamp": 1778041791815,
  "agent_id": "agent-xyz-001",
  "payload": {
    "payment_hash": "239ed3c3...",
    "endpoint": "/api/summarize",
    "amount_sats": 10,
    "macaroon_exp": 1778041791815,
    "caveats": {
      "max_calls": 1,
      "outcome_required": "structured_json"
    },
    "verified": true
  }
}
```

Additional events in the same stream:

| Event | Trigger |
|---|---|
| `l402.payment.verified` | Preimage check passes |
| `l402.token.expired` | Request with expired macaroon |
| `l402.token.replayed` | Preimage already spent |
| `l402.caveat.violated` | Agent exceeded a macaroon constraint |
| `l402.payment.failed` | Invoice not paid within expiry |

---

## 4. Trust Signals from Payment History

Once L402 events are in the ledger, the LAW-N query layer can surface trust signals without a separate reputation system:

**Payment consistency**
```
agent-xyz-001 paid 847 times over 30 days, zero failed verifications
→ trust_score: high
```

**Caveat compliance**
```
agent-xyz-001: 847 payments, 0 caveat violations
→ behavioral_contract_compliance: 100%
```

**Endpoint pattern**
```
agent-xyz-001 always calls /api/summarize → /api/analyze in sequence
→ behavioral_fingerprint: stable
```

**Cross-agent agreement signal** (your idea — I want to understand this better)
```
agent-A and agent-B both paid the same endpoint, same time window
→ potential coordination signal?
```

These are observable, structured, and require no external oracle. Trust emerges from the ledger itself.

---

## 5. Integration Boundary — What Each Side Owns

```
l402-kit side                    MindsEye side
─────────────────────────────────────────────────
Issue macaroon                   Ingest l402.payment.verified event
Verify preimage                  Index by agent_id + endpoint + timestamp
Enforce caveats at call time     Query trust signals from history
Emit structured event            Surface behavioral patterns
```

The interface between the two systems is a **single event schema** — the table in section 3.

---

## 6. Open Questions for Peace

1. **LAW-N ingest format** — does LAW-N expect a push (webhook) or pull (polling) model for external events? l402-kit can emit either.

2. **Agent identity** — how does MindsEye currently identify agents? L402 is anonymous by default (payment hash is the only ID). We can add an `agent_id` header convention if the ledger needs a stable identifier across sessions.

3. **Caveat enforcement** — do you want caveat violations to emit a LAW-N event, or should l402-kit handle that silently? I'd lean toward emitting — behavioral violations are exactly the signal the trust layer needs.

4. **Cross-agent agreement signals** — can you say more about what you mean here? I see how payment timestamps could surface coordination patterns, but I want to understand what MindsEye already tracks before designing the signal.

---

*l402-kit is MIT licensed. All code at github.com/ShinyDapps/l402-kit.*
