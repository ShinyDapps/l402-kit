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
