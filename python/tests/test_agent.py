"""
Tests for L402Client agent SDK: budget control, wallets, and LangChain tool.
Run with: cd python && python -m pytest tests/test_agent.py -v
"""
from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch, PropertyMock

import pytest
import httpx


# ─── helpers ─────────────────────────────────────────────────────────────────

def _fake_wallet(preimage: str = "aa" * 32) -> Any:
    w = MagicMock()
    w.pay_invoice.return_value = preimage
    return w


def _make_402_response(
    invoice: str = "lnbc100n1...",
    macaroon: str = "mac123",
    price_sats: int | None = 10,
) -> httpx.Response:
    body: dict[str, Any] = {"invoice": invoice, "macaroon": macaroon}
    if price_sats is not None:
        body["priceSats"] = price_sats
    return httpx.Response(402, json=body)


def _make_200_response(body: dict | None = None) -> httpx.Response:
    return httpx.Response(200, json=body or {"ok": True})


# ─── BudgetExceededError ──────────────────────────────────────────────────────

class TestBudgetExceededError:
    def test_attributes(self):
        from l402kit import BudgetExceededError
        err = BudgetExceededError("https://api.example.com", 50, 30)
        assert err.url == "https://api.example.com"
        assert err.required == 50
        assert err.remaining == 30

    def test_message_contains_amounts(self):
        from l402kit import BudgetExceededError
        err = BudgetExceededError("https://api.example.com", 50, 30)
        msg = str(err)
        assert "50" in msg
        assert "30" in msg

    def test_is_exception(self):
        from l402kit import BudgetExceededError
        assert issubclass(BudgetExceededError, Exception)


# ─── SpendingReport ───────────────────────────────────────────────────────────

class TestSpendingReport:
    def test_fields(self):
        from l402kit import SpendingReport
        r = SpendingReport(total=100, remaining=900, by_domain={"a.com": 100}, transactions=[])
        assert r.total == 100
        assert r.remaining == 900
        assert r.by_domain == {"a.com": 100}
        assert r.transactions == []

    def test_defaults(self):
        from l402kit import SpendingReport
        r = SpendingReport(total=0, remaining=1000)
        assert r.by_domain == {}
        assert r.transactions == []


# ─── L402Client budget ────────────────────────────────────────────────────────

class TestL402ClientBudget:
    def _make_client(self, budget_sats=100, **kwargs):
        from l402kit import L402Client
        return L402Client(wallet=_fake_wallet(), budget_sats=budget_sats, **kwargs)

    def test_spending_report_none_without_budget(self):
        from l402kit import L402Client
        client = L402Client(wallet=_fake_wallet())
        assert client.spending_report() is None

    def test_spending_report_initial_state(self):
        client = self._make_client(budget_sats=500)
        report = client.spending_report()
        assert report is not None
        assert report.total == 0
        assert report.remaining == 500

    def test_budget_blocks_payment(self):
        from l402kit import BudgetExceededError
        client = self._make_client(budget_sats=5)
        response_sequence = [_make_402_response(price_sats=10), _make_200_response()]

        with patch.object(client._http, "request", side_effect=response_sequence):
            with pytest.raises(BudgetExceededError) as exc_info:
                client.get("https://api.example.com/data")

        assert exc_info.value.required == 10
        assert exc_info.value.remaining == 5

    def test_budget_deducted_after_payment(self):
        client = self._make_client(budget_sats=100)
        responses = [_make_402_response(price_sats=30), _make_200_response()]

        with patch.object(client._http, "request", side_effect=responses):
            client.get("https://api.example.com/data")

        report = client.spending_report()
        assert report.total == 30
        assert report.remaining == 70

    def test_multiple_payments_accumulate(self):
        client = self._make_client(budget_sats=100)

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=20), _make_200_response(),
            _make_402_response(price_sats=30), _make_200_response(),
        ]):
            client.get("https://api.example.com/a")
            client.get("https://api.example.com/b")

        report = client.spending_report()
        assert report.total == 50
        assert report.remaining == 50

    def test_by_domain_tracking(self):
        client = self._make_client(budget_sats=200)

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=20), _make_200_response(),
            _make_402_response(price_sats=30), _make_200_response(),
        ]):
            client.get("https://api.foo.com/a")
            client.get("https://api.bar.com/b")

        report = client.spending_report()
        assert report.by_domain.get("api.foo.com") == 20
        assert report.by_domain.get("api.bar.com") == 30

    def test_transaction_log(self):
        client = self._make_client(budget_sats=100)

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=15), _make_200_response(),
        ]):
            client.get("https://api.example.com/data")

        report = client.spending_report()
        assert len(report.transactions) == 1
        tx = report.transactions[0]
        assert tx["sats"] == 15
        assert "api.example.com" in tx["url"]
        assert "ts" in tx

    def test_on_spend_callback(self):
        spent_log = []
        client = self._make_client(budget_sats=100, on_spend=lambda sats, url: spent_log.append((sats, url)))

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=25), _make_200_response(),
        ]):
            client.get("https://api.example.com/data")

        assert len(spent_log) == 1
        assert spent_log[0][0] == 25

    def test_on_budget_exceeded_callback(self):
        exceeded_log = []
        client = self._make_client(
            budget_sats=5,
            on_budget_exceeded=lambda url, sats: exceeded_log.append((url, sats))
        )
        from l402kit import BudgetExceededError

        with patch.object(client._http, "request", side_effect=[_make_402_response(price_sats=10)]):
            with pytest.raises(BudgetExceededError):
                client.get("https://api.example.com/data")

        assert len(exceeded_log) == 1

    def test_per_domain_budget(self):
        from l402kit import BudgetExceededError, L402Client
        client = L402Client(
            wallet=_fake_wallet(),
            budget_per_domain={"api.example.com": 15},
        )

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=20),
        ]):
            with pytest.raises(BudgetExceededError):
                client.get("https://api.example.com/data")

    def test_zero_price_sats_no_deduction(self):
        client = self._make_client(budget_sats=100)

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=0), _make_200_response(),
        ]):
            client.get("https://api.example.com/data")

        report = client.spending_report()
        assert report.total == 0

    def test_missing_price_sats_no_budget_error(self):
        client = self._make_client(budget_sats=5)

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=None), _make_200_response(),
        ]):
            r = client.get("https://api.example.com/data")

        assert r.status_code == 200

    def test_price_sats_snake_case_alias(self):
        from l402kit import L402Client
        client = L402Client(wallet=_fake_wallet(), budget_sats=100)
        body = {"invoice": "lnbc...", "macaroon": "mac", "price_sats": 10}
        responses = [httpx.Response(402, json=body), _make_200_response()]

        with patch.object(client._http, "request", side_effect=responses):
            client.get("https://api.example.com/data")

        assert client.spending_report().total == 10

    def test_exact_budget_boundary_succeeds(self):
        client = self._make_client(budget_sats=50)

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=50), _make_200_response(),
        ]):
            r = client.get("https://api.example.com/data")

        assert r.status_code == 200
        assert client.spending_report().remaining == 0

    def test_one_over_budget_boundary_fails(self):
        from l402kit import BudgetExceededError
        client = self._make_client(budget_sats=50)

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=51),
        ]):
            with pytest.raises(BudgetExceededError):
                client.get("https://api.example.com/data")


# ─── Token cache ─────────────────────────────────────────────────────────────

class TestTokenCache:
    def _make_client(self):
        from l402kit import L402Client
        return L402Client(wallet=_fake_wallet(), budget_sats=1000)

    def test_second_call_reuses_token(self):
        client = self._make_client()
        call_count = [0]

        def fake_request(method, url, **kwargs):
            call_count[0] += 1
            auth = (kwargs.get("headers") or {}).get("Authorization", "")
            if auth.startswith("L402 "):
                return _make_200_response()
            return _make_402_response(price_sats=10)

        with patch.object(client._http, "request", side_effect=fake_request):
            client.get("https://api.example.com/data")
            client.get("https://api.example.com/data")
            client.get("https://api.example.com/data")

        assert client.wallet.pay_invoice.call_count == 1

    def test_different_paths_pay_independently(self):
        client = self._make_client()

        def fake_request(method, url, **kwargs):
            auth = (kwargs.get("headers") or {}).get("Authorization", "")
            if auth.startswith("L402 "):
                return _make_200_response()
            return _make_402_response(price_sats=10)

        with patch.object(client._http, "request", side_effect=fake_request):
            client.get("https://api.example.com/a")
            client.get("https://api.example.com/b")

        assert client.wallet.pay_invoice.call_count == 2

    def test_rejected_cached_token_repays(self):
        client = self._make_client()
        # Seed token store with a fake cached token
        client._token_store["https://api.example.com/data"] = ("old_mac", "old_pre")

        responses = [
            _make_402_response(price_sats=10),  # cached token rejected
            _make_402_response(price_sats=10),  # fresh 402
            _make_200_response(),               # retry with new token
        ]

        with patch.object(client._http, "request", side_effect=responses):
            r = client.get("https://api.example.com/data")

        assert r.status_code == 200
        assert client.wallet.pay_invoice.call_count == 1

    def test_query_string_ignored_in_cache_key(self):
        client = self._make_client()

        def fake_request(method, url, **kwargs):
            auth = (kwargs.get("headers") or {}).get("Authorization", "")
            if auth.startswith("L402 "):
                return _make_200_response()
            return _make_402_response(price_sats=5)

        with patch.object(client._http, "request", side_effect=fake_request):
            client.get("https://api.example.com/data?city=london")
            client.get("https://api.example.com/data?city=tokyo")

        assert client.wallet.pay_invoice.call_count == 1


# ─── AsyncL402Client ──────────────────────────────────────────────────────────

class TestAsyncL402Client:
    def _make_client(self, budget_sats=200):
        from l402kit import AsyncL402Client
        return AsyncL402Client(wallet=_fake_wallet(), budget_sats=budget_sats)

    @pytest.mark.asyncio
    async def test_free_endpoint_passes_through(self):
        client = self._make_client()
        with patch.object(client._http, "request", return_value=_make_200_response()):
            r = await client.get("https://api.example.com/free")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_402_pays_and_retries(self):
        client = self._make_client()
        responses = [_make_402_response(price_sats=10), _make_200_response()]
        with patch.object(client._http, "request", side_effect=responses):
            r = await client.get("https://api.example.com/paid")
        assert r.status_code == 200
        assert client.wallet.pay_invoice.call_count == 1

    @pytest.mark.asyncio
    async def test_token_cache_reuses_on_second_call(self):
        client = self._make_client()

        async def fake_request(method, url, **kwargs):
            auth = (kwargs.get("headers") or {}).get("Authorization", "")
            if auth.startswith("L402 "):
                return _make_200_response()
            return _make_402_response(price_sats=10)

        with patch.object(client._http, "request", side_effect=fake_request):
            await client.get("https://api.example.com/data")
            await client.get("https://api.example.com/data")

        assert client.wallet.pay_invoice.call_count == 1

    @pytest.mark.asyncio
    async def test_budget_enforced(self):
        from l402kit import BudgetExceededError
        client = self._make_client(budget_sats=5)
        with patch.object(client._http, "request", side_effect=[_make_402_response(price_sats=10)]):
            with pytest.raises(BudgetExceededError):
                await client.get("https://api.example.com/data")

    @pytest.mark.asyncio
    async def test_spending_report(self):
        client = self._make_client(budget_sats=100)
        responses = [_make_402_response(price_sats=15), _make_200_response()]
        with patch.object(client._http, "request", side_effect=responses):
            await client.get("https://api.example.com/paid")
        report = client.spending_report()
        assert report.total == 15
        assert report.remaining == 85

    @pytest.mark.asyncio
    async def test_context_manager(self):
        from l402kit import AsyncL402Client
        async with AsyncL402Client(wallet=_fake_wallet()) as client:
            with patch.object(client._http, "request", return_value=_make_200_response()):
                r = await client.get("https://api.example.com/free")
        assert r.status_code == 200


# ─── L402Tool (LangChain) ─────────────────────────────────────────────────────

class TestL402Tool:
    @pytest.fixture(autouse=True)
    def require_langchain(self):
        pytest.importorskip("langchain")
        pytest.importorskip("pydantic")

    def _make_tool(self, budget_sats=500):
        from l402kit.langchain import L402Tool
        return L402Tool(wallet=_fake_wallet(), budget_sats=budget_sats)

    def test_tool_name(self):
        tool = self._make_tool()
        assert tool.name == "l402_fetch"

    def test_tool_description_mentions_payment(self):
        tool = self._make_tool()
        assert "payment" in tool.description.lower() or "L402" in tool.description

    def test_free_url_returns_response(self):
        tool = self._make_tool()
        client = tool._L402Tool__dict__.get("_client") or object.__getattribute__(tool, "_client")

        with patch.object(client._http, "request", return_value=_make_200_response({"price": 42000})):
            result = tool._run("https://api.example.com/btc-price")

        assert "200" in result
        assert "42000" in result

    def test_paid_url_includes_sats_prefix(self):
        tool = self._make_tool(budget_sats=100)
        client = object.__getattribute__(tool, "_client")

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=10), _make_200_response({"data": "ok"}),
        ]):
            result = tool._run("https://api.example.com/premium")

        assert "[Paid 10 sats]" in result

    def test_budget_exceeded_returns_blocked_message(self):
        tool = self._make_tool(budget_sats=5)
        client = object.__getattribute__(tool, "_client")

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=10),
        ]):
            result = tool._run("https://api.example.com/premium")

        assert "[BLOCKED]" in result
        assert "Budget exceeded" in result

    def test_network_error_returns_error_message(self):
        tool = self._make_tool()
        client = object.__getattribute__(tool, "_client")

        with patch.object(client._http, "request", side_effect=Exception("Connection refused")):
            result = tool._run("https://api.example.com/data")

        assert "[ERROR]" in result
        assert "Connection refused" in result

    def test_post_method_forwarded(self):
        tool = self._make_tool()
        client = object.__getattribute__(tool, "_client")
        captured = []

        def fake_request(method, url, **kwargs):
            captured.append(method)
            return _make_200_response()

        with patch.object(client._http, "request", side_effect=fake_request):
            tool._run("https://api.example.com/data", method="POST", body='{"q":1}')

        assert captured[0] == "POST"

    def test_json_response_pretty_printed(self):
        tool = self._make_tool()
        client = object.__getattribute__(tool, "_client")

        with patch.object(client._http, "request", return_value=_make_200_response({"key": "val"})):
            result = tool._run("https://api.example.com/data")

        assert '"key"' in result
        assert '"val"' in result

    def test_non_json_response_returns_text(self):
        tool = self._make_tool()
        client = object.__getattribute__(tool, "_client")

        with patch.object(client._http, "request", return_value=httpx.Response(200, text="plain text")):
            result = tool._run("https://api.example.com/data")

        assert "plain text" in result

    def test_arun_delegates_to_run(self):
        import asyncio
        tool = self._make_tool()
        client = object.__getattribute__(tool, "_client")

        with patch.object(client._http, "request", return_value=_make_200_response()):
            result = asyncio.get_event_loop().run_until_complete(
                tool._arun("https://api.example.com/data")
            )

        assert "200" in result

    def test_spending_report_method(self):
        tool = self._make_tool(budget_sats=100)
        client = object.__getattribute__(tool, "_client")

        with patch.object(client._http, "request", side_effect=[
            _make_402_response(price_sats=20), _make_200_response(),
        ]):
            tool._run("https://api.example.com/premium")

        report = tool.spending_report()
        assert report is not None
        assert report.total == 20
        assert report.remaining == 80

    def test_import_error_without_langchain(self):
        import sys
        import importlib

        langchain_modules = [k for k in sys.modules if k.startswith("langchain")]
        saved = {k: sys.modules.pop(k) for k in langchain_modules}

        try:
            import builtins
            real_import = builtins.__import__

            def mock_import(name, *args, **kwargs):
                if name.startswith("langchain"):
                    raise ImportError(f"No module named '{name}'")
                return real_import(name, *args, **kwargs)

            builtins.__import__ = mock_import
            if "l402kit.langchain" in sys.modules:
                del sys.modules["l402kit.langchain"]

            from l402kit.langchain import L402Tool as ToolCls
            with pytest.raises(ImportError, match="langchain"):
                ToolCls(wallet=_fake_wallet())
        finally:
            builtins.__import__ = real_import
            sys.modules.update(saved)


# ─── wallets (unit / mock) ────────────────────────────────────────────────────

class TestBlinkWallet:
    def test_pay_invoice_calls_graphql(self):
        from l402kit.wallets import BlinkWallet
        wallet = BlinkWallet("api-key-123", "wallet-id-456")

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "data": {
                "lnInvoicePaymentSend": {
                    "transaction": {
                        "settlementVia": {
                            "preImage": "bb" * 32
                        }
                    }
                }
            }
        }
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.post", return_value=mock_resp) as mock_post:
            preimage = wallet.pay_invoice("lnbc100...")

        assert preimage == "bb" * 32
        assert "api.blink.sv" in str(mock_post.call_args)

    def test_pay_invoice_raises_on_error(self):
        from l402kit.wallets import BlinkWallet
        wallet = BlinkWallet("key", "wallet")

        mock_resp = MagicMock()
        mock_resp.json.return_value = {"errors": [{"message": "payment failed"}]}
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.post", return_value=mock_resp):
            with pytest.raises(Exception, match="payment failed"):
                wallet.pay_invoice("lnbc...")

    def test_implements_l402_wallet(self):
        from l402kit import L402Wallet
        from l402kit.wallets import BlinkWallet
        assert issubclass(BlinkWallet, L402Wallet)


class TestAlbyWallet:
    def test_pay_invoice_calls_rest(self):
        from l402kit.wallets import AlbyWallet
        wallet = AlbyWallet("alby-token-123")

        mock_resp = MagicMock()
        mock_resp.json.return_value = {"payment_preimage": "cc" * 32}
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.post", return_value=mock_resp) as mock_post:
            preimage = wallet.pay_invoice("lnbc100...")

        assert preimage == "cc" * 32
        assert "/payments/bolt11" in str(mock_post.call_args)

    def test_custom_base_url(self):
        from l402kit.wallets import AlbyWallet
        wallet = AlbyWallet("token", base_url="https://my-hub.example.com")

        mock_resp = MagicMock()
        mock_resp.json.return_value = {"preimage": "dd" * 32}
        mock_resp.raise_for_status = MagicMock()

        with patch("httpx.post", return_value=mock_resp) as mock_post:
            preimage = wallet.pay_invoice("lnbc100...")

        assert preimage == "dd" * 32
        assert "my-hub.example.com" in str(mock_post.call_args)

    def test_implements_l402_wallet(self):
        from l402kit import L402Wallet
        from l402kit.wallets import AlbyWallet
        assert issubclass(AlbyWallet, L402Wallet)
