"""
LAW-N adapter — forwards L402CloudEvent to a LAW-N ingest endpoint.

Port of TS src/integrations/law-n-adapter.ts. Contract:
  - Transport: POST JSON over HTTPS
  - Auth: HMAC-SHA256 in X-LAW-N-Signature header (sha256=<hex digest>)
  - Each call gets a unique X-LAW-N-Request-Id (8-byte hex)
  - Delivery: fire-and-forget, at-least-once — LAW-N handles dedup/windowing
  - Network errors are swallowed — behavioral writes must NEVER block payments
  - Configurable timeout (default 5s)

Example:
    from l402kit.integrations import create_lawn_adapter
    import os

    on_event = create_lawn_adapter(
        endpoint="https://law-n.sageworks.ai/ingest/events",
        secret=os.environ["LAWN_SECRET"],
    )

    # Use `on_event` as the L402Client onEvent callback
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import threading
from typing import Any, Callable, Dict

import httpx


def create_lawn_adapter(
    endpoint: str,
    secret: str,
    timeout: float = 5.0,
) -> Callable[[Dict[str, Any]], None]:
    """
    Returns a callable `(event: dict) -> None` that asynchronously forwards
    the event to a LAW-N ingest endpoint signed with HMAC-SHA256.

    The returned callable returns immediately — the HTTP request runs on a
    daemon thread and any error is silently swallowed.
    """
    secret_bytes = secret.encode()

    def forward(event: Dict[str, Any]) -> None:
        body = json.dumps(event, separators=(",", ":"))
        sig = hmac.new(secret_bytes, body.encode(), hashlib.sha256).hexdigest()
        request_id = os.urandom(8).hex()
        headers = {
            "Content-Type": "application/json",
            "X-LAW-N-Signature": f"sha256={sig}",
            "X-LAW-N-Request-Id": request_id,
        }

        def _send():
            try:
                with httpx.Client(timeout=timeout) as client:
                    client.post(endpoint, content=body, headers=headers)
            except Exception:
                # Behavioral events must never block payments — swallow errors
                pass

        threading.Thread(target=_send, daemon=True).start()

    return forward
