"""AlbyWallet — DEPRECATED. Alby shared wallet was shut down 2025-01-04.

Migrate to NWC: use a Nostr Wallet Connect-compatible wallet (Alby Hub, Mutiny,
Coinos, Phoenix, etc.) and the upcoming `NWCWallet` adapter in l402kit 1.11.

For 1.10.x users with a self-hosted Alby endpoint, this class still works.
"""
from __future__ import annotations

import warnings

import httpx
from ..client import L402Wallet

_WARNED = False


class AlbyWallet(L402Wallet):
    """
    DEPRECATED — Alby shared wallet API shut down 2025-01-04.

    Use NWC (Nostr Wallet Connect) instead. NWCWallet ships in l402kit 1.11
    with support for Alby Hub, Mutiny, Coinos, Phoenix, and any NIP-47 wallet.

    See: https://docs.l402kit.com/agent/wallets

    Retained in 1.10.x for users with self-hosted Alby endpoints. Will be
    removed in 1.11 when NWCWallet ships in Python.
    """

    def __init__(self, access_token: str, base_url: str = "https://api.getalby.com") -> None:
        global _WARNED
        if not _WARNED:
            _WARNED = True
            warnings.warn(
                "AlbyWallet is deprecated — Alby shared wallet was shut down 2025-01-04. "
                "Migrate to NWC: see https://docs.l402kit.com/agent/wallets",
                DeprecationWarning,
                stacklevel=2,
            )
        self._token = access_token
        self._base = base_url.rstrip("/")

    def pay_invoice(self, bolt11: str) -> str:
        """Pay a BOLT11 invoice. Returns the preimage hex string."""
        r = httpx.post(
            f"{self._base}/payments/bolt11",
            headers={
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
            },
            json={"invoice": bolt11},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        preimage: str = data.get("payment_preimage") or data.get("preimage") or ""
        if not preimage:
            raise ValueError(f"Alby payment response missing preimage: {data}")
        return preimage
