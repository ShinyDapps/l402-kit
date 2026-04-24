"""
Provider & Wallet unit tests — l402kit Python SDK.
All HTTP calls are mocked (no network required).

Run: cd python && python -m pytest tests/test_providers.py -v
"""

import asyncio
import base64
import json
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock


# ─── helpers ─────────────────────────────────────────────────────────────────

def make_async_client_mock(post_return=None, get_return=None):
    """Return an async context manager mock for httpx.AsyncClient."""
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False
    if post_return is not None:
        mock_client.post = AsyncMock(return_value=post_return)
    if get_return is not None:
        mock_client.get = AsyncMock(return_value=get_return)
    return mock_client


def http_response(json_data, status_code=200):
    """Build a mock httpx.Response."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    resp.is_success = (200 <= status_code < 300)
    resp.raise_for_status = MagicMock()
    if not resp.is_success:
        resp.raise_for_status.side_effect = Exception(f"HTTP {status_code}")
    return resp


# ─── BlinkProvider ───────────────────────────────────────────────────────────

class TestBlinkProvider:
    def setup_method(self):
        from l402kit.providers.blink import BlinkProvider
        self.provider = BlinkProvider(api_key="test_key", wallet_id="wallet_123")

    async def test_create_invoice_success(self):
        blink_resp = {
            "data": {
                "lnInvoiceCreate": {
                    "invoice": {
                        "paymentRequest": "lnbc10n1...",
                        "paymentHash": "abc123" + "0" * 58,
                    },
                    "errors": [],
                }
            }
        }
        mock_resp = http_response(blink_resp)
        mock_client = make_async_client_mock(post_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            inv = await self.provider.create_invoice(10)

        assert inv.payment_request == "lnbc10n1..."
        assert inv.payment_hash == "abc123" + "0" * 58
        assert inv.amount_sats == 10
        assert inv.expires_at > int(time.time())
        decoded = json.loads(base64.b64decode(inv.macaroon))
        assert decoded["hash"] == "abc123" + "0" * 58

    async def test_create_invoice_blink_error_raises(self):
        blink_resp = {
            "data": {
                "lnInvoiceCreate": {
                    "invoice": None,
                    "errors": [{"message": "Insufficient balance"}],
                }
            }
        }
        mock_resp = http_response(blink_resp)
        mock_client = make_async_client_mock(post_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(Exception, match="Insufficient balance"):
                await self.provider.create_invoice(10)

    async def test_create_invoice_http_error_raises(self):
        mock_resp = http_response({}, status_code=503)
        mock_client = make_async_client_mock(post_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(Exception):
                await self.provider.create_invoice(10)

    async def test_check_payment_paid(self):
        resp_data = {"data": {"lnInvoice": {"status": "PAID"}}}
        mock_resp = http_response(resp_data)
        mock_client = make_async_client_mock(post_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await self.provider.check_payment("abc123")

        assert result is True

    async def test_check_payment_pending(self):
        resp_data = {"data": {"lnInvoice": {"status": "PENDING"}}}
        mock_resp = http_response(resp_data)
        mock_client = make_async_client_mock(post_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await self.provider.check_payment("abc123")

        assert result is False

    async def test_check_payment_http_failure_returns_false(self):
        mock_resp = http_response({}, status_code=500)
        mock_client = make_async_client_mock(post_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await self.provider.check_payment("abc123")

        assert result is False


# ─── OpenNodeProvider ─────────────────────────────────────────────────────────

class TestOpenNodeProvider:
    def setup_method(self):
        from l402kit.providers.opennode import OpenNodeProvider
        self.provider = OpenNodeProvider(api_key="on_key")
        self.provider_test = OpenNodeProvider(api_key="on_key", test_mode=True)

    async def test_create_invoice_success(self):
        resp_data = {
            "data": {
                "id": "charge_xyz",
                "lightning_invoice": {"payreq": "lnbc1..."},
            }
        }
        mock_resp = http_response(resp_data)
        mock_client = make_async_client_mock(post_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            inv = await self.provider.create_invoice(21)

        assert inv.payment_request == "lnbc1..."
        assert inv.payment_hash == "charge_xyz"
        assert inv.amount_sats == 21
        decoded = json.loads(base64.b64decode(inv.macaroon))
        assert decoded["hash"] == "charge_xyz"

    async def test_test_mode_uses_dev_url(self):
        assert "dev-api" in self.provider_test.base_url

    async def test_create_invoice_http_error_raises(self):
        mock_resp = http_response({}, status_code=401)
        mock_client = make_async_client_mock(post_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(Exception):
                await self.provider.create_invoice(10)

    async def test_check_payment_paid(self):
        resp_data = {"data": {"status": "paid"}}
        mock_resp = http_response(resp_data)
        mock_client = make_async_client_mock(get_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await self.provider.check_payment("charge_xyz")

        assert result is True

    async def test_check_payment_unpaid(self):
        resp_data = {"data": {"status": "unpaid"}}
        mock_resp = http_response(resp_data)
        mock_client = make_async_client_mock(get_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await self.provider.check_payment("charge_xyz")

        assert result is False


# ─── LNbitsProvider ───────────────────────────────────────────────────────────

class TestLNbitsProvider:
    def setup_method(self):
        from l402kit.providers.lnbits import LNbitsProvider
        self.provider = LNbitsProvider(api_key="lnbits_key", base_url="https://lnbits.example.com")

    async def test_create_invoice_success(self):
        resp_data = {
            "payment_request": "lnbc1...",
            "payment_hash": "hash_abc",
        }
        mock_resp = http_response(resp_data)
        mock_client = make_async_client_mock(post_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            inv = await self.provider.create_invoice(100)

        assert inv.payment_request == "lnbc1..."
        assert inv.payment_hash == "hash_abc"
        assert inv.amount_sats == 100

    async def test_base_url_trailing_slash_stripped(self):
        from l402kit.providers.lnbits import LNbitsProvider
        p = LNbitsProvider("key", "https://lnbits.example.com/")
        assert not p.base_url.endswith("/")

    async def test_create_invoice_http_error_raises(self):
        mock_resp = http_response({}, status_code=403)
        mock_client = make_async_client_mock(post_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(Exception):
                await self.provider.create_invoice(10)

    async def test_check_payment_paid(self):
        resp_data = {"paid": True, "payment_hash": "hash_abc"}
        mock_resp = http_response(resp_data)
        mock_client = make_async_client_mock(get_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await self.provider.check_payment("hash_abc")

        assert result is True

    async def test_check_payment_unpaid(self):
        resp_data = {"paid": False}
        mock_resp = http_response(resp_data)
        mock_client = make_async_client_mock(get_return=mock_resp)

        with patch("httpx.AsyncClient", return_value=mock_client):
            result = await self.provider.check_payment("hash_abc")

        assert result is False


# ─── AlbyWallet ──────────────────────────────────────────────────────────────

class TestAlbyWallet:
    def setup_method(self):
        from l402kit.wallets.alby import AlbyWallet
        self.wallet = AlbyWallet(access_token="alby_token_xyz", base_url="https://api.getalby.com")

    def test_pay_invoice_success_payment_preimage(self):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {"payment_preimage": "deadbeef" * 8}

        with patch("httpx.post", return_value=resp):
            preimage = self.wallet.pay_invoice("lnbc1...")

        assert preimage == "deadbeef" * 8

    def test_pay_invoice_success_preimage_key(self):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {"preimage": "cafebabe" * 8}

        with patch("httpx.post", return_value=resp):
            preimage = self.wallet.pay_invoice("lnbc1...")

        assert preimage == "cafebabe" * 8

    def test_pay_invoice_missing_preimage_raises(self):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {"status": "ok"}

        with patch("httpx.post", return_value=resp):
            with pytest.raises(ValueError, match="missing preimage"):
                self.wallet.pay_invoice("lnbc1...")

    def test_pay_invoice_http_error_raises(self):
        resp = MagicMock()
        resp.raise_for_status.side_effect = Exception("HTTP 401")

        with patch("httpx.post", return_value=resp):
            with pytest.raises(Exception, match="HTTP 401"):
                self.wallet.pay_invoice("lnbc1...")

    def test_authorization_header_sent(self):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {"payment_preimage": "aa" * 32}

        with patch("httpx.post", return_value=resp) as mock_post:
            self.wallet.pay_invoice("lnbc1...")

        call_kwargs = mock_post.call_args
        headers = call_kwargs.kwargs.get("headers") or call_kwargs[1].get("headers", {})
        assert headers.get("Authorization") == "Bearer alby_token_xyz"


# ─── BlinkWallet ─────────────────────────────────────────────────────────────

class TestBlinkWallet:
    def setup_method(self):
        from l402kit.wallets.blink import BlinkWallet
        self.wallet = BlinkWallet(api_key="blink_key", wallet_id="wallet_123")

    def test_pay_invoice_success(self):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {
            "data": {
                "lnInvoicePaymentSend": {
                    "status": "SUCCESS",
                    "transaction": {"settlementVia": {"preImage": "deadbeef" * 8}},
                    "errors": [],
                }
            }
        }
        with patch("httpx.post", return_value=resp):
            preimage = self.wallet.pay_invoice("lnbc1...")
        assert preimage == "deadbeef" * 8

    def test_pay_invoice_blink_error_raises(self):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {
            "data": {
                "lnInvoicePaymentSend": {
                    "errors": [{"message": "Insufficient balance"}],
                    "transaction": None,
                }
            }
        }
        with patch("httpx.post", return_value=resp):
            with pytest.raises(ValueError, match="Insufficient balance"):
                self.wallet.pay_invoice("lnbc1...")

    def test_pay_invoice_missing_preimage_raises(self):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {
            "data": {
                "lnInvoicePaymentSend": {
                    "errors": [],
                    "transaction": {"settlementVia": {}},
                }
            }
        }
        with patch("httpx.post", return_value=resp):
            with pytest.raises(ValueError, match="missing preimage"):
                self.wallet.pay_invoice("lnbc1...")

    def test_pay_invoice_http_error_raises(self):
        resp = MagicMock()
        resp.raise_for_status.side_effect = Exception("HTTP 503")
        with patch("httpx.post", return_value=resp):
            with pytest.raises(Exception, match="HTTP 503"):
                self.wallet.pay_invoice("lnbc1...")


# ─── verify_token ─────────────────────────────────────────────────────────────

class TestVerifyToken:
    def _make_token(self, exp_offset_s: int = 3600) -> str:
        import os, hashlib, base64, json, time
        preimage = os.urandom(32).hex()
        payment_hash = hashlib.sha256(bytes.fromhex(preimage)).hexdigest()
        exp = int((time.time() + exp_offset_s) * 1000)
        macaroon = base64.b64encode(json.dumps({"hash": payment_hash, "exp": exp}).encode()).decode()
        return f"{macaroon}:{preimage}"

    def test_valid_token_returns_true(self):
        from l402kit.verify import verify_token
        assert verify_token(self._make_token()) is True

    def test_expired_token_returns_false(self):
        from l402kit.verify import verify_token
        assert verify_token(self._make_token(exp_offset_s=-10)) is False

    def test_wrong_preimage_returns_false(self):
        from l402kit.verify import verify_token
        token = self._make_token()
        macaroon = token.rsplit(":", 1)[0]
        assert verify_token(f"{macaroon}:{'aa' * 32}") is False

    def test_malformed_token_returns_false(self):
        from l402kit.verify import verify_token
        assert verify_token("not-a-valid-token") is False

    def test_short_preimage_returns_false(self):
        from l402kit.verify import verify_token
        import base64, json, time
        exp = int((time.time() + 3600) * 1000)
        mac = base64.b64encode(json.dumps({"hash": "a" * 64, "exp": exp}).encode()).decode()
        assert verify_token(f"{mac}:tooshort") is False

    def test_garbage_macaroon_returns_false(self):
        from l402kit.verify import verify_token
        assert verify_token(f"notbase64!!:{'aa' * 32}") is False


# ─── DevProvider + DevWallet ──────────────────────────────────────────────────

class TestDevProvider:
    def setup_method(self):
        from l402kit.dev import DevProvider
        self.provider = DevProvider()

    async def test_create_invoice_returns_dev_payment_request(self):
        inv = await self.provider.create_invoice(5)
        assert inv.payment_request.startswith("DEV:")
        assert inv.amount_sats == 5
        assert inv.payment_hash in inv.payment_request

    async def test_create_invoice_macaroon_contains_hash(self):
        import base64, json
        inv = await self.provider.create_invoice(1)
        payload = json.loads(base64.b64decode(inv.macaroon))
        assert payload["hash"] == inv.payment_hash

    async def test_check_payment_true_after_create(self):
        inv = await self.provider.create_invoice(1)
        assert await self.provider.check_payment(inv.payment_hash) is True

    async def test_check_payment_false_for_unknown(self):
        assert await self.provider.check_payment("unknown" * 8) is False

    async def test_get_preimage_verifies_cryptographically(self):
        import hashlib
        inv = await self.provider.create_invoice(1)
        preimage = self.provider.get_preimage(inv.payment_hash)
        assert hashlib.sha256(bytes.fromhex(preimage)).hexdigest() == inv.payment_hash

    async def test_each_invoice_has_unique_preimage(self):
        inv1 = await self.provider.create_invoice(1)
        inv2 = await self.provider.create_invoice(1)
        assert inv1.payment_hash != inv2.payment_hash
        assert self.provider.get_preimage(inv1.payment_hash) != self.provider.get_preimage(inv2.payment_hash)


class TestDevWallet:
    def setup_method(self):
        from l402kit.dev import DevProvider, DevWallet
        self.provider = DevProvider()
        self.wallet = DevWallet(self.provider)

    async def test_pay_invoice_returns_correct_preimage(self):
        import hashlib
        inv = await self.provider.create_invoice(1)
        preimage = self.wallet.pay_invoice(inv.payment_request)
        assert hashlib.sha256(bytes.fromhex(preimage)).hexdigest() == inv.payment_hash

    def test_pay_non_dev_invoice_raises(self):
        with pytest.raises(ValueError, match="DevWallet only works with DevProvider"):
            self.wallet.pay_invoice("lnbc1realinvoice...")


# ─── L402Client ───────────────────────────────────────────────────────────────

class TestL402Client:
    def setup_method(self):
        from l402kit.dev import DevProvider, DevWallet
        from l402kit.client import L402Client
        self.provider = DevProvider()
        self.wallet = DevWallet(self.provider)
        self.client = L402Client(wallet=self.wallet)

    async def test_non_402_response_returned_as_is(self):
        ok_resp = MagicMock()
        ok_resp.status_code = 200
        with patch.object(self.client._http, "request", return_value=ok_resp):
            result = self.client.get("http://example.com/api")
        assert result.status_code == 200

    async def test_402_triggers_payment_and_retry(self):
        import asyncio, base64, json, time, hashlib, os
        # Build a valid invoice + macaroon
        preimage = os.urandom(32).hex()
        payment_hash = hashlib.sha256(bytes.fromhex(preimage)).hexdigest()
        exp = int((time.time() + 3600) * 1000)
        macaroon = base64.b64encode(json.dumps({"hash": payment_hash, "exp": exp}).encode()).decode()
        bolt11 = f"DEV:{payment_hash}"

        # Pre-register preimage so DevWallet.pay_invoice succeeds
        self.provider._store[payment_hash] = preimage

        resp_402 = MagicMock()
        resp_402.status_code = 402
        resp_402.json.return_value = {"invoice": bolt11, "macaroon": macaroon}
        resp_402.headers = {}

        resp_200 = MagicMock()
        resp_200.status_code = 200

        with patch.object(self.client._http, "request", side_effect=[resp_402, resp_200]) as mock_req:
            result = self.client.get("http://example.com/premium")

        assert result.status_code == 200
        # Second call must include L402 Authorization header
        second_call_kwargs = mock_req.call_args_list[1]
        auth = second_call_kwargs.kwargs.get("headers", {}).get("Authorization", "")
        assert auth.startswith("L402 ")

    async def test_402_missing_invoice_raises(self):
        from l402kit.client import L402Error
        resp_402 = MagicMock()
        resp_402.status_code = 402
        resp_402.json.return_value = {}
        resp_402.headers = {}
        with patch.object(self.client._http, "request", return_value=resp_402):
            with pytest.raises(L402Error, match="missing invoice or macaroon"):
                self.client.get("http://example.com/premium")

    def test_context_manager_closes_client(self):
        from l402kit.client import L402Client
        with patch("httpx.Client") as mock_cls:
            mock_http = MagicMock()
            mock_cls.return_value = mock_http
            with L402Client(wallet=self.wallet):
                pass
            mock_http.close.assert_called_once()


# ─── l402_required — FastAPI middleware ───────────────────────────────────────

class TestL402RequiredFastAPI:
    async def test_no_auth_returns_402(self):
        from l402kit.dev import DevProvider
        from l402kit.middleware import l402_required
        from fastapi import Request as FARequest
        from starlette.testclient import TestClient
        from fastapi import FastAPI

        provider = DevProvider()
        app = FastAPI()

        @app.get("/premium")
        @l402_required(price_sats=1, lightning=provider)
        async def premium(request: FARequest):
            return {"data": "ok"}

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/premium")
        assert resp.status_code == 402
        body = resp.json()
        assert "invoice" in body
        assert "macaroon" in body

    async def test_valid_token_returns_200(self):
        from l402kit.dev import DevProvider, DevWallet
        from l402kit.middleware import l402_required
        from l402kit.replay import _used_preimages as replay_store
        from fastapi import Request as FARequest
        from starlette.testclient import TestClient
        from fastapi import FastAPI
        import hashlib, base64, json, os, time

        replay_store.clear()

        provider = DevProvider()
        app = FastAPI()

        @app.get("/premium")
        @l402_required(price_sats=1, lightning=provider)
        async def premium(request: FARequest):
            return {"data": "ok"}

        # Generate a valid token
        preimage = os.urandom(32).hex()
        payment_hash = hashlib.sha256(bytes.fromhex(preimage)).hexdigest()
        exp = int((time.time() + 3600) * 1000)
        macaroon = base64.b64encode(json.dumps({"hash": payment_hash, "exp": exp}).encode()).decode()

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/premium", headers={"Authorization": f"L402 {macaroon}:{preimage}"})
        assert resp.status_code == 200

    async def test_replayed_token_returns_401(self):
        from l402kit.dev import DevProvider
        from l402kit.middleware import l402_required
        from l402kit.replay import _used_preimages as replay_store
        from fastapi import Request as FARequest
        from starlette.testclient import TestClient
        from fastapi import FastAPI
        import hashlib, base64, json, os, time

        replay_store.clear()

        provider = DevProvider()
        app = FastAPI()

        @app.get("/premium")
        @l402_required(price_sats=1, lightning=provider)
        async def premium(request: FARequest):
            return {"data": "ok"}

        preimage = os.urandom(32).hex()
        payment_hash = hashlib.sha256(bytes.fromhex(preimage)).hexdigest()
        exp = int((time.time() + 3600) * 1000)
        macaroon = base64.b64encode(json.dumps({"hash": payment_hash, "exp": exp}).encode()).decode()

        client = TestClient(app, raise_server_exceptions=False)
        # First call succeeds
        client.get("/premium", headers={"Authorization": f"L402 {macaroon}:{preimage}"})
        # Second call with same token is a replay
        resp = client.get("/premium", headers={"Authorization": f"L402 {macaroon}:{preimage}"})
        assert resp.status_code == 401
        assert "already used" in resp.json().get("error", "").lower()
