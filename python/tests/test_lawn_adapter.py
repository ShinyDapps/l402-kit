"""
TDD — l402kit.integrations.lawn_adapter

Port of TS src/integrations/law-n-adapter.ts. Forwards L402CloudEvent
to a LAW-N ingest endpoint with HMAC-SHA256 signing.

Contract:
  - Transport: POST JSON over HTTPS
  - Auth: X-LAW-N-Signature: sha256=<hex digest>
  - Request ID: X-LAW-N-Request-Id: <random hex>
  - Fire-and-forget — network errors must NOT raise
  - Configurable timeout
"""
import hmac
import hashlib
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from contextlib import contextmanager


# ─── Fake LAW-N server ────────────────────────────────────────────────────────

class _Capture:
    """Per-server state with a deterministic .wait(n) primitive — no polling."""

    def __init__(self):
        self.items = []
        self._lock = threading.Lock()
        self._event = threading.Event()

    def append(self, item):
        with self._lock:
            self.items.append(item)
            self._event.set()

    def wait_for(self, n: int, timeout: float = 5.0) -> bool:
        """Block until at least `n` items captured, or timeout."""
        deadline = threading.Event()
        import time
        start = time.monotonic()
        while True:
            with self._lock:
                if len(self.items) >= n:
                    return True
            remaining = timeout - (time.monotonic() - start)
            if remaining <= 0:
                return False
            self._event.wait(min(remaining, 0.25))
            self._event.clear()


@contextmanager
def fake_lawn_server():
    capture = _Capture()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode()
            capture.append({
                "path": self.path,
                "headers": dict(self.headers),
                "body": body,
            })
            self.send_response(202)
            self.end_headers()
            self.wfile.write(b"{}")

        def log_message(self, *_args):
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]

    # Warm-up via real HTTP: blocks until serve_forever is in the accept loop AND
    # ensures the first response cycle is hot. Without this, the first POST after
    # a fresh server start can race the accept loop under CPU contention.
    # We expect HTTP 501 (BaseHTTPRequestHandler default for unsupported method) —
    # any HTTP response = server is fully ready.
    import urllib.request
    import urllib.error
    import time as _time
    warm_url = f"http://127.0.0.1:{port}/__warmup"
    deadline = _time.monotonic() + 2.0
    while _time.monotonic() < deadline:
        try:
            urllib.request.urlopen(warm_url, timeout=0.2)
            break
        except urllib.error.HTTPError:
            break  # got HTTP-level response = server ready
        except (urllib.error.URLError, OSError):
            _time.sleep(0.01)

    try:
        yield f"http://127.0.0.1:{port}/ingest/events", capture
    finally:
        server.shutdown()


# ─── helpers ─────────────────────────────────────────────────────────────────

def sample_event():
    return {
        "specversion": "1.0",
        "type": "l402.payment.settled",
        "source": "l402-kit",
        "id": "abc123",
        "time": "2026-05-19T12:00:00Z",
        "subject": "agent-payment-flow",
        "datacontenttype": "application/json",
        "data": {
            "session_id": "sess-1",
            "request_id": "req-1",
            "endpoint": "https://api.example.com/data",
            "event_type": "settled",
            "payment": {"amount_sats": 100, "settled": True},
        },
    }


# ─── Tests ────────────────────────────────────────────────────────────────────

def test_adapter_posts_event_to_endpoint_with_hmac_signature():
    from l402kit.integrations.lawn_adapter import create_lawn_adapter

    with fake_lawn_server() as (url, capture):
        adapter = create_lawn_adapter(endpoint=url, secret="topsecret")
        event = sample_event()
        adapter(event)
        assert capture.wait_for(1), "adapter should POST to endpoint within timeout"

    assert len(capture.items) == 1
    req = capture.items[0]
    assert req["path"] == "/ingest/events"
    assert req["headers"]["Content-Type"] == "application/json"
    assert "X-LAW-N-Signature" in req["headers"]
    assert "X-LAW-N-Request-Id" in req["headers"]

    body = req["body"]
    parsed = json.loads(body)
    assert parsed["type"] == "l402.payment.settled"

    # Signature must match HMAC-SHA256(body) using secret
    expected = "sha256=" + hmac.new(b"topsecret", body.encode(), hashlib.sha256).hexdigest()
    assert req["headers"]["X-LAW-N-Signature"] == expected


def test_adapter_swallows_network_errors():
    from l402kit.integrations.lawn_adapter import create_lawn_adapter

    # Endpoint that doesn't exist — must NOT raise
    adapter = create_lawn_adapter(endpoint="http://127.0.0.1:1/never", secret="x", timeout=0.1)
    adapter(sample_event())  # if this raises, test fails


def test_adapter_emits_different_request_ids_per_call():
    from l402kit.integrations.lawn_adapter import create_lawn_adapter

    with fake_lawn_server() as (url, capture):
        adapter = create_lawn_adapter(endpoint=url, secret="s")
        adapter(sample_event())
        adapter(sample_event())
        assert capture.wait_for(2, timeout=5.0), "two POSTs should arrive"

    assert len(capture.items) == 2
    ids = {r["headers"]["X-LAW-N-Request-Id"] for r in capture.items}
    assert len(ids) == 2  # distinct per call


def test_adapter_signature_is_stable_for_same_input():
    from l402kit.integrations.lawn_adapter import create_lawn_adapter

    with fake_lawn_server() as (url, capture):
        adapter = create_lawn_adapter(endpoint=url, secret="constant")
        e = sample_event()
        e["id"] = "fixed-id"  # ensure body bytes identical
        adapter(e)
        adapter(e)
        assert capture.wait_for(2, timeout=5.0), "two POSTs should arrive"

    items = capture.items
    assert len(items) == 2
    assert items[0]["headers"]["X-LAW-N-Signature"] == items[1]["headers"]["X-LAW-N-Signature"]
