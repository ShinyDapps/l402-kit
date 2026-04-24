"""
L402 webhook verification — port do formato Stripe (HMAC-SHA256).

Assinar saída:
    header = build_signature_header(secret, int(time.time()), body)

Verificar entrada:
    event = verify_webhook(secret, raw_body, request.headers["l402-signature"])
"""

import hashlib
import hmac
import json
import math
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class WebhookEventData:
    endpoint: str
    amount_sats: int
    preimage: str
    payment_hash: str


@dataclass
class WebhookEvent:
    id: str
    type: str
    created: int
    data: WebhookEventData


def build_signature_header(secret: str, timestamp: int, body: str) -> str:
    """Return the ``l402-signature`` header value for a payload.

    Format: ``t=<unix_ts>,v1=<hmac_hex>`` — identical to Stripe's scheme.
    """
    mac = hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256)
    return f"t={timestamp},v1={mac.hexdigest()}"


def verify_webhook(
    secret: str,
    raw_body: str,
    signature_header: str,
    tolerance_secs: int = 300,
) -> WebhookEvent:
    """Verify an incoming webhook and return the parsed event.

    Raises ``ValueError`` if the signature is invalid or the timestamp is stale.

    Example (FastAPI)::

        @app.post("/webhook")
        async def webhook(request: Request):
            body = (await request.body()).decode()
            try:
                event = verify_webhook(
                    os.environ["L402_WEBHOOK_SECRET"],
                    body,
                    request.headers["l402-signature"],
                )
            except ValueError as e:
                raise HTTPException(status_code=401, detail=str(e))
            print(f"Payment: {event.data.amount_sats} sats")
            return {"ok": True}
    """
    if not signature_header:
        raise ValueError("[l402] Missing l402-signature header")

    parts: dict[str, str] = {}
    for chunk in signature_header.split(","):
        eq = chunk.find("=")
        if eq != -1:
            parts[chunk[:eq]] = chunk[eq + 1:]

    ts_str = parts.get("t")
    if not ts_str:
        raise ValueError("[l402] Invalid l402-signature: missing timestamp")
    try:
        ts = int(ts_str)
    except ValueError:
        raise ValueError("[l402] Invalid l402-signature: bad timestamp")

    drift = math.fabs(time.time() - ts)
    if drift > tolerance_secs:
        raise ValueError(
            f"[l402] Webhook timestamp too old ({drift:.0f}s drift, tolerance {tolerance_secs}s)"
        )

    v1 = parts.get("v1")
    if not v1:
        raise ValueError("[l402] Invalid l402-signature: missing v1")

    expected = hmac.new(secret.encode(), f"{ts}.{raw_body}".encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, v1):
        raise ValueError("[l402] Webhook signature mismatch")

    try:
        payload: dict[str, Any] = json.loads(raw_body)
    except json.JSONDecodeError:
        raise ValueError("[l402] Webhook body is not valid JSON")

    raw_data = payload.get("data", {})
    return WebhookEvent(
        id=payload.get("id", ""),
        type=payload.get("type", ""),
        created=payload.get("created", 0),
        data=WebhookEventData(
            endpoint=raw_data.get("endpoint", ""),
            amount_sats=raw_data.get("amountSats", 0),
            preimage=raw_data.get("preimage", ""),
            payment_hash=raw_data.get("paymentHash", ""),
        ),
    )
