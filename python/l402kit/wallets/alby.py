"""AlbyWallet — pays Lightning invoices via the Alby Hub REST API."""
from __future__ import annotations

import httpx
from ..client import L402Wallet


class AlbyWallet(L402Wallet):
    """
    Pay invoices via Alby Hub (getalby.com).
    Get your access token at: getalby.com → Settings → Access Tokens

    Usage:
        from l402kit.wallets import AlbyWallet
        wallet = AlbyWallet(os.environ["ALBY_TOKEN"])
    """

    def __init__(self, access_token: str, base_url: str = "https://api.getalby.com") -> None:
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
