"""
Full test suite for l402kit Python SDK.
Run with: cd python && python -m pytest tests/ -v
"""

import asyncio
import base64
import hashlib
import json
import os
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ─── helpers ─────────────────────────────────────────────────────────────────

def fresh_preimage() -> str:
    """Generate a unique 64-hex preimage each call."""
    return os.urandom(32).hex()


PREIMAGE = "a" * 64  # stable test preimage


def make_hash(preimage: str) -> str:
    return hashlib.sha256(bytes.fromhex(preimage)).hexdigest()


def make_macaroon(hash_: str, exp_offset: int = 3600, extra: dict = None) -> str:
    # exp in milliseconds — consistent with TS/Go SDKs and verify_token check
    payload = {"hash": hash_, "exp": int(time.time() * 1000) + exp_offset * 1000}
    if extra:
        payload.update(extra)
    return base64.b64encode(json.dumps(payload).encode()).decode()


def make_token(preimage: str = None, exp_offset: int = 3600) -> str:
    if preimage is None:
        preimage = fresh_preimage()
    h = make_hash(preimage)
    mac = make_macaroon(h, exp_offset)
    return f"{mac}:{preimage}"


# ─── verify_token ─────────────────────────────────────────────────────────────

class TestVerifyToken:
    def setup_method(self):
        from l402kit.verify import verify_token
        self.verify = verify_token

    # ── happy path ─────────────────────────────────────────────────────────

    def test_valid_token(self):
        assert self.verify(make_token()) is True

    def test_valid_token_expiring_far_future(self):
        assert self.verify(make_token(exp_offset=365 * 24 * 3600)) is True

    def test_valid_token_with_extra_macaroon_fields(self):
        """Forward-compat: extra fields in macaroon should not break verification."""
        preimage = fresh_preimage()
        h = make_hash(preimage)
        mac = make_macaroon(h, extra={"version": 2, "scope": "premium"})
        assert self.verify(f"{mac}:{preimage}") is True

    # ── expiry ─────────────────────────────────────────────────────────────

    def test_expired_token_minus_1s(self):
        assert self.verify(make_token(exp_offset=-1)) is False

    def test_expired_token_minus_1h(self):
        assert self.verify(make_token(exp_offset=-3600)) is False

    def test_expired_token_exp_zero(self):
        preimage = fresh_preimage()
        h = make_hash(preimage)
        mac = base64.b64encode(json.dumps({"hash": h, "exp": 0}).encode()).decode()
        assert self.verify(f"{mac}:{preimage}") is False

    def test_expired_token_negative_exp(self):
        preimage = fresh_preimage()
        h = make_hash(preimage)
        mac = base64.b64encode(json.dumps({"hash": h, "exp": -99999}).encode()).decode()
        assert self.verify(f"{mac}:{preimage}") is False

    # ── hash mismatch ──────────────────────────────────────────────────────

    def test_wrong_preimage(self):
        wrong_preimage = "b" * 64
        h = make_hash(PREIMAGE)
        mac = make_macaroon(h)
        assert self.verify(f"{mac}:{wrong_preimage}") is False

    def test_preimage_flipped_last_char(self):
        preimage = fresh_preimage()
        h = make_hash(preimage)
        mac = make_macaroon(h)
        tampered = preimage[:-1] + ("b" if preimage[-1] != "b" else "c")
        assert self.verify(f"{mac}:{tampered}") is False

    def test_all_zeros_preimage_against_real_hash(self):
        preimage = fresh_preimage()
        h = make_hash(preimage)
        mac = make_macaroon(h)
        assert self.verify(f"{mac}:{'0' * 64}") is False

    # ── format errors ──────────────────────────────────────────────────────

    def test_short_preimage(self):
        h = make_hash(PREIMAGE)
        mac = make_macaroon(h)
        assert self.verify(f"{mac}:aabbcc") is False

    def test_preimage_too_long(self):
        h = make_hash(PREIMAGE)
        mac = make_macaroon(h)
        assert self.verify(f"{mac}:{'a' * 128}") is False

    def test_non_hex_preimage(self):
        h = make_hash(PREIMAGE)
        mac = make_macaroon(h)
        assert self.verify(f"{mac}:{'z' * 64}") is False

    def test_empty_preimage(self):
        h = make_hash(PREIMAGE)
        mac = make_macaroon(h)
        assert self.verify(f"{mac}:") is False

    def test_missing_colon(self):
        assert self.verify("nocolon") is False

    def test_empty_string(self):
        assert self.verify("") is False

    def test_garbage_input(self):
        assert self.verify("!!!notavalidtoken!!!") is False

    def test_invalid_base64_macaroon(self):
        assert self.verify(f"!!!notbase64!!!:{PREIMAGE}") is False

    def test_macaroon_missing_hash(self):
        payload = {"exp": int(time.time()) + 3600}
        mac = base64.b64encode(json.dumps(payload).encode()).decode()
        assert self.verify(f"{mac}:{PREIMAGE}") is False

    def test_macaroon_missing_exp(self):
        payload = {"hash": make_hash(PREIMAGE)}
        mac = base64.b64encode(json.dumps(payload).encode()).decode()
        assert self.verify(f"{mac}:{PREIMAGE}") is False

    def test_macaroon_null_hash(self):
        payload = {"hash": None, "exp": int(time.time()) + 3600}
        mac = base64.b64encode(json.dumps(payload).encode()).decode()
        assert self.verify(f"{mac}:{PREIMAGE}") is False

    def test_macaroon_numeric_hash(self):
        payload = {"hash": 12345, "exp": int(time.time()) + 3600}
        mac = base64.b64encode(json.dumps(payload).encode()).decode()
        assert self.verify(f"{mac}:{PREIMAGE}") is False

    def test_macaroon_is_json_array_not_object(self):
        mac = base64.b64encode(b"[]").decode()
        assert self.verify(f"{mac}:{PREIMAGE}") is False

    def test_macaroon_valid_base64_but_not_json(self):
        mac = base64.b64encode(b"not json at all").decode()
        assert self.verify(f"{mac}:{PREIMAGE}") is False


# ─── check_and_mark_preimage ──────────────────────────────────────────────────

class TestReplay:
    def setup_method(self):
        import l402kit.replay as replay_module
        replay_module._used_preimages.clear()
        self.check = replay_module.check_and_mark_preimage

    def test_first_use_returns_true(self):
        assert self.check(fresh_preimage()) is True

    def test_second_use_returns_false(self):
        p = fresh_preimage()
        assert self.check(p) is True
        assert self.check(p) is False

    def test_third_use_also_false(self):
        p = fresh_preimage()
        self.check(p)
        self.check(p)
        assert self.check(p) is False

    def test_different_preimages_independent(self):
        p1, p2 = fresh_preimage(), fresh_preimage()
        assert self.check(p1) is True
        assert self.check(p2) is True
        assert self.check(p1) is False
        assert self.check(p2) is False

    def test_100_unique_preimages_all_succeed(self):
        results = [self.check(fresh_preimage()) for _ in range(100)]
        assert all(results)

    def test_empty_string_preimage(self):
        assert self.check("") is True
        assert self.check("") is False

    def test_very_long_preimage(self):
        long = "a" * 512
        assert self.check(long) is True
        assert self.check(long) is False

    def test_different_lengths_independent(self):
        p1 = "a" * 64
        p2 = "a" * 63
        assert self.check(p1) is True
        assert self.check(p2) is True
        assert self.check(p1) is False


# ─── FastAPI middleware ───────────────────────────────────────────────────────

class TestFastAPIMiddleware:
    def setup_method(self):
        import l402kit.replay as replay_module
        replay_module._used_preimages.clear()

    def _make_provider_and_preimage(self):
        from l402kit.types import Invoice
        preimage = fresh_preimage()
        h = make_hash(preimage)
        mac = make_macaroon(h)
        invoice = Invoice(
            payment_request="lnbctest1234",
            payment_hash=h,
            macaroon=mac,
            amount_sats=100,
            expires_at=int(time.time()) + 3600,
        )
        provider = MagicMock()
        provider.create_invoice = AsyncMock(return_value=invoice)
        return provider, preimage, mac

    def _make_app(self, provider, price_sats=100):
        from fastapi import FastAPI, Request
        from fastapi.testclient import TestClient
        from l402kit import l402_required

        app = FastAPI()

        @app.get("/premium")
        @l402_required(price_sats=price_sats, lightning=provider)
        async def premium(request: Request):
            return {"ok": True}

        return TestClient(app)

    # ── 402 challenge ─────────────────────────────────────────────────────

    def test_no_auth_returns_402(self):
        provider, _, _ = self._make_provider_and_preimage()
        client = self._make_app(provider)
        res = client.get("/premium")
        assert res.status_code == 402
        body = res.json()
        assert body["error"] == "Payment Required"
        assert "invoice" in body
        assert "macaroon" in body

    def test_www_authenticate_header_on_402(self):
        provider, _, _ = self._make_provider_and_preimage()
        client = self._make_app(provider)
        res = client.get("/premium")
        assert "www-authenticate" in res.headers
        assert res.headers["www-authenticate"].startswith("L402 macaroon=")

    def test_402_body_contains_price_sats(self):
        provider, _, _ = self._make_provider_and_preimage()
        client = self._make_app(provider, price_sats=250)
        res = client.get("/premium")
        assert res.status_code == 402
        assert res.json().get("price_sats") == 250

    def test_empty_auth_returns_402(self):
        provider, _, _ = self._make_provider_and_preimage()
        client = self._make_app(provider)
        res = client.get("/premium", headers={"Authorization": ""})
        assert res.status_code == 402

    def test_bearer_scheme_returns_402(self):
        provider, preimage, mac = self._make_provider_and_preimage()
        client = self._make_app(provider)
        token = f"{mac}:{preimage}"
        res = client.get("/premium", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 402

    def test_garbage_token_returns_402(self):
        provider, _, _ = self._make_provider_and_preimage()
        client = self._make_app(provider)
        res = client.get("/premium", headers={"Authorization": "L402 garbage!!!123"})
        assert res.status_code == 402

    def test_expired_token_returns_402(self):
        provider, preimage, _ = self._make_provider_and_preimage()
        client = self._make_app(provider)
        h = make_hash(preimage)
        mac = make_macaroon(h, exp_offset=-1)
        res = client.get("/premium", headers={"Authorization": f"L402 {mac}:{preimage}"})
        assert res.status_code == 402

    # ── successful payment ────────────────────────────────────────────────

    def test_valid_token_returns_200(self):
        provider, preimage, mac = self._make_provider_and_preimage()
        client = self._make_app(provider)
        res = client.get("/premium", headers={"Authorization": f"L402 {mac}:{preimage}"})
        assert res.status_code == 200
        assert res.json()["ok"] is True

    # ── replay protection ─────────────────────────────────────────────────

    def test_replay_attack_returns_401(self):
        provider, preimage, mac = self._make_provider_and_preimage()
        client = self._make_app(provider)
        token = f"{mac}:{preimage}"
        first = client.get("/premium", headers={"Authorization": f"L402 {token}"})
        assert first.status_code == 200
        second = client.get("/premium", headers={"Authorization": f"L402 {token}"})
        assert second.status_code == 401
        assert second.json()["error"] == "Token already used"

    def test_replay_third_use_also_401(self):
        provider, preimage, mac = self._make_provider_and_preimage()
        client = self._make_app(provider)
        token = f"{mac}:{preimage}"
        client.get("/premium", headers={"Authorization": f"L402 {token}"})
        client.get("/premium", headers={"Authorization": f"L402 {token}"})
        third = client.get("/premium", headers={"Authorization": f"L402 {token}"})
        assert third.status_code == 401

    # ── invalid preimage ──────────────────────────────────────────────────

    def test_invalid_preimage_returns_402(self):
        provider, _, _ = self._make_provider_and_preimage()
        client = self._make_app(provider)
        wrong_mac = base64.b64encode(
            json.dumps({"hash": "0" * 64, "exp": int(time.time()) + 3600}).encode()
        ).decode()
        res = client.get("/premium", headers={"Authorization": f"L402 {wrong_mac}:{PREIMAGE}"})
        assert res.status_code == 402

    def test_short_preimage_returns_402(self):
        provider, _, _ = self._make_provider_and_preimage()
        client = self._make_app(provider)
        h = make_hash(PREIMAGE)
        mac = make_macaroon(h)
        res = client.get("/premium", headers={"Authorization": f"L402 {mac}:abc"})
        assert res.status_code == 402

    # ── multiple independent endpoints ────────────────────────────────────

    def test_two_endpoints_independent_replay_protection(self):
        from fastapi import FastAPI, Request
        from fastapi.testclient import TestClient
        from l402kit import l402_required

        p1 = MagicMock()
        p2 = MagicMock()

        preimage1 = fresh_preimage()
        h1 = make_hash(preimage1)
        mac1 = make_macaroon(h1)

        preimage2 = fresh_preimage()
        h2 = make_hash(preimage2)
        mac2 = make_macaroon(h2)

        from l402kit.types import Invoice

        p1.create_invoice = AsyncMock(return_value=Invoice(
            payment_request="ln1", payment_hash=h1, macaroon=mac1, amount_sats=10, expires_at=int(time.time()) + 3600
        ))
        p2.create_invoice = AsyncMock(return_value=Invoice(
            payment_request="ln2", payment_hash=h2, macaroon=mac2, amount_sats=50, expires_at=int(time.time()) + 3600
        ))

        app = FastAPI()

        @app.get("/cheap")
        @l402_required(price_sats=10, lightning=p1)
        async def cheap(request: Request):
            return {"route": "cheap"}

        @app.get("/premium")
        @l402_required(price_sats=50, lightning=p2)
        async def premium(request: Request):
            return {"route": "premium"}

        client = TestClient(app)

        r1 = client.get("/cheap", headers={"Authorization": f"L402 {mac1}:{preimage1}"})
        r2 = client.get("/premium", headers={"Authorization": f"L402 {mac2}:{preimage2}"})
        assert r1.status_code == 200
        assert r2.status_code == 200


# ─── Flask middleware ─────────────────────────────────────────────────────────

class TestFlaskMiddleware:
    def setup_method(self):
        import l402kit.replay as replay_module
        replay_module._used_preimages.clear()

    def _make_flask_app(self, price_sats=100):
        pytest.importorskip("flask")
        from flask import Flask, jsonify
        from l402kit import l402_required

        preimage = fresh_preimage()
        h = make_hash(preimage)
        mac = make_macaroon(h)

        from l402kit.types import Invoice
        provider = MagicMock()
        provider.create_invoice = AsyncMock(return_value=Invoice(
            payment_request="lnbctest1234",
            payment_hash=h,
            macaroon=mac,
            amount_sats=price_sats,
            expires_at=int(time.time()) + 3600,
        ))

        app = Flask(__name__)
        app.config["TESTING"] = True

        @app.route("/premium")
        @l402_required(price_sats=price_sats, lightning=provider)
        def premium():
            return jsonify({"ok": True})

        return app.test_client(), preimage, mac

    def test_flask_no_auth_returns_402(self):
        client, _, _ = self._make_flask_app()
        res = client.get("/premium")
        assert res.status_code == 402
        body = res.get_json()
        assert body["error"] == "Payment Required"

    def test_flask_valid_token_returns_200(self):
        client, preimage, mac = self._make_flask_app()
        res = client.get("/premium", headers={"Authorization": f"L402 {mac}:{preimage}"})
        assert res.status_code == 200
        assert res.get_json()["ok"] is True

    def test_flask_replay_returns_401(self):
        client, preimage, mac = self._make_flask_app()
        token = f"{mac}:{preimage}"
        first = client.get("/premium", headers={"Authorization": f"L402 {token}"})
        assert first.status_code == 200
        second = client.get("/premium", headers={"Authorization": f"L402 {token}"})
        assert second.status_code == 401

    def test_flask_expired_token_returns_402(self):
        client, preimage, _ = self._make_flask_app()
        h = make_hash(preimage)
        expired_mac = make_macaroon(h, exp_offset=-10)
        res = client.get("/premium", headers={"Authorization": f"L402 {expired_mac}:{preimage}"})
        assert res.status_code == 402

    def test_flask_garbage_token_returns_402(self):
        client, _, _ = self._make_flask_app()
        res = client.get("/premium", headers={"Authorization": "L402 garbage!!!123"})
        assert res.status_code == 402
