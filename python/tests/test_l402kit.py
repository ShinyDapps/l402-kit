"""
Full test suite for l402kit Python SDK.
Run with: cd python && python -m pytest tests/ -v
"""

import base64
import hashlib
import json
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ─── helpers ─────────────────────────────────────────────────────────────────

PREIMAGE = "a" * 64  # valid 64-hex preimage


def make_hash(preimage: str) -> str:
    return hashlib.sha256(bytes.fromhex(preimage)).hexdigest()


def make_macaroon(hash_: str, exp_offset: int = 3600) -> str:
    payload = {"hash": hash_, "exp": int(time.time()) + exp_offset}
    return base64.b64encode(json.dumps(payload).encode()).decode()


def make_token(preimage: str = PREIMAGE, exp_offset: int = 3600) -> str:
    h = make_hash(preimage)
    mac = make_macaroon(h, exp_offset)
    return f"{mac}:{preimage}"


# ─── verify_token ─────────────────────────────────────────────────────────────

class TestVerifyToken:
    def setup_method(self):
        # Re-import each time to avoid state pollution
        from l402kit.verify import verify_token
        self.verify = verify_token

    def test_valid_token(self):
        assert self.verify(make_token()) is True

    def test_expired_token(self):
        assert self.verify(make_token(exp_offset=-1)) is False

    def test_wrong_preimage(self):
        wrong_preimage = "b" * 64
        # hash is computed from PREIMAGE but we submit wrong_preimage
        h = make_hash(PREIMAGE)
        mac = make_macaroon(h)
        token = f"{mac}:{wrong_preimage}"
        assert self.verify(token) is False

    def test_short_preimage(self):
        h = make_hash(PREIMAGE)
        mac = make_macaroon(h)
        token = f"{mac}:aabbcc"
        assert self.verify(token) is False

    def test_non_hex_preimage(self):
        h = make_hash(PREIMAGE)
        mac = make_macaroon(h)
        token = f"{mac}:{'z' * 64}"
        assert self.verify(token) is False

    def test_missing_colon(self):
        assert self.verify("nocolon") is False

    def test_garbage_input(self):
        assert self.verify("!!!notavalidtoken!!!") is False

    def test_macaroon_missing_hash(self):
        payload = {"exp": int(time.time()) + 3600}
        mac = base64.b64encode(json.dumps(payload).encode()).decode()
        assert self.verify(f"{mac}:{PREIMAGE}") is False

    def test_macaroon_missing_exp(self):
        payload = {"hash": make_hash(PREIMAGE)}
        mac = base64.b64encode(json.dumps(payload).encode()).decode()
        assert self.verify(f"{mac}:{PREIMAGE}") is False

    def test_invalid_base64_macaroon(self):
        assert self.verify(f"!!!notbase64!!!:{PREIMAGE}") is False


# ─── check_and_mark_preimage ──────────────────────────────────────────────────

class TestReplay:
    def setup_method(self):
        # Reset internal set before each test
        import l402kit.replay as replay_module
        replay_module._used_preimages.clear()
        self.check = replay_module.check_and_mark_preimage

    def test_first_use_returns_true(self):
        assert self.check("deadbeef" * 8) is True

    def test_second_use_returns_false(self):
        p = "cafebabe" * 8
        assert self.check(p) is True
        assert self.check(p) is False  # replay attack blocked

    def test_different_preimages_independent(self):
        p1 = "aaaabbbb" * 8
        p2 = "ccccdddd" * 8
        assert self.check(p1) is True
        assert self.check(p2) is True
        assert self.check(p1) is False
        assert self.check(p2) is False


# ─── FastAPI middleware ───────────────────────────────────────────────────────

class TestFastAPIMiddleware:
    def setup_method(self):
        import l402kit.replay as replay_module
        replay_module._used_preimages.clear()

    @pytest.fixture
    def mock_provider(self):
        from l402kit.types import Invoice
        h = make_hash(PREIMAGE)
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
        return provider

    @pytest.fixture
    def app(self, mock_provider):
        from fastapi import FastAPI, Request
        from fastapi.testclient import TestClient
        from l402kit import l402_required

        app = FastAPI()

        @app.get("/premium")
        @l402_required(price_sats=100, lightning=mock_provider)
        async def premium(request: Request):
            return {"ok": True}

        return TestClient(app)

    def test_no_auth_returns_402(self, app):
        res = app.get("/premium")
        assert res.status_code == 402
        body = res.json()
        assert body["error"] == "Payment Required"
        assert "invoice" in body
        assert "macaroon" in body

    def test_www_authenticate_header_on_402(self, app):
        res = app.get("/premium")
        assert "www-authenticate" in res.headers
        assert res.headers["www-authenticate"].startswith("L402 macaroon=")

    def test_valid_token_returns_200(self, app, mock_provider):
        h = make_hash(PREIMAGE)
        mac = make_macaroon(h)
        token = f"{mac}:{PREIMAGE}"
        res = app.get("/premium", headers={"Authorization": f"L402 {token}"})
        assert res.status_code == 200
        assert res.json()["ok"] is True

    def test_replay_attack_returns_401(self, app, mock_provider):
        h = make_hash(PREIMAGE)
        mac = make_macaroon(h)
        token = f"{mac}:{PREIMAGE}"
        first = app.get("/premium", headers={"Authorization": f"L402 {token}"})
        assert first.status_code == 200

        second = app.get("/premium", headers={"Authorization": f"L402 {token}"})
        assert second.status_code == 401
        assert second.json()["error"] == "Token already used"

    def test_invalid_preimage_returns_402(self, app):
        # wrong hash — should not verify
        wrong_mac = base64.b64encode(
            json.dumps({"hash": "0" * 64, "exp": int(time.time()) + 3600}).encode()
        ).decode()
        token = f"{wrong_mac}:{PREIMAGE}"
        res = app.get("/premium", headers={"Authorization": f"L402 {token}"})
        assert res.status_code == 402
