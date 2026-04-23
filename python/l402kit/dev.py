"""
DevProvider + DevWallet — zero-config local development without a Lightning node.

Cryptographically identical to production: SHA256(preimage) === paymentHash.
No real Lightning payment — the DevWallet retrieves the preimage from the DevProvider directly.

Usage:
    from l402kit.dev import DevProvider, DevWallet
    from l402kit import L402Client, l402_required

    provider = DevProvider()
    wallet   = DevWallet(provider)

    # Server
    @app.get("/premium")
    @l402_required(price_sats=1, lightning=provider)
    async def premium(request: Request): ...

    # Client
    client = L402Client(wallet=wallet)
    data   = client.get("http://localhost:8000/premium").json()
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import time

from .client import L402Wallet
from .types import Invoice, LightningProvider


class DevProvider(LightningProvider):
    """
    Local provider for development and demos.
    Generates real cryptographic L402 invoices with no Lightning node.
    """

    def __init__(self) -> None:
        self._store: dict[str, str] = {}  # payment_hash → preimage

    async def create_invoice(self, amount_sats: int) -> Invoice:
        preimage = os.urandom(32).hex()
        payment_hash = hashlib.sha256(bytes.fromhex(preimage)).hexdigest()
        self._store[payment_hash] = preimage

        exp = int((time.time() + 3600) * 1000)
        macaroon = base64.b64encode(
            json.dumps({"hash": payment_hash, "exp": exp}).encode()
        ).decode()

        return Invoice(
            payment_request=f"DEV:{payment_hash}",
            payment_hash=payment_hash,
            macaroon=macaroon,
            amount_sats=amount_sats,
            expires_at=exp,
        )

    async def check_payment(self, payment_hash: str) -> bool:
        return payment_hash in self._store

    def get_preimage(self, payment_hash: str) -> str:
        return self._store[payment_hash]


class DevWallet(L402Wallet):
    """
    Local wallet for development and demos.
    'Pays' by retrieving the preimage directly from a DevProvider.
    """

    def __init__(self, provider: DevProvider) -> None:
        self._provider = provider

    def pay_invoice(self, bolt11: str) -> str:
        if not bolt11.startswith("DEV:"):
            raise ValueError(
                "DevWallet only works with DevProvider invoices (DEV:<hash>). "
                "For real Lightning payments use AlbyWallet or BlinkWallet."
            )
        payment_hash = bolt11[4:]
        return self._provider.get_preimage(payment_hash)
