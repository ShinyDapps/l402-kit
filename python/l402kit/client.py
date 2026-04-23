"""
L402Client — pays Lightning invoices automatically when an API returns 402.

Usage:
    from l402kit import L402Client
    from l402kit.wallets import AlbyWallet

    client = L402Client(wallet=AlbyWallet(os.environ["ALBY_TOKEN"]))
    data = client.get("https://api.example.com/premium")
"""
from __future__ import annotations

import httpx
from typing import Any
from abc import ABC, abstractmethod


class L402Wallet(ABC):
    """Interface for wallets that can pay Lightning invoices."""

    @abstractmethod
    def pay_invoice(self, bolt11: str) -> str:
        """Pay a BOLT11 invoice. Returns the preimage (hex string)."""
        ...


class L402Client:
    """
    HTTP client that automatically handles L402 payment challenges.

    When a request returns 402, the client:
      1. Parses the invoice and macaroon from the response
      2. Pays the invoice via the configured wallet
      3. Retries the request with Authorization: L402 <macaroon>:<preimage>
    """

    def __init__(self, wallet: L402Wallet, timeout: float = 30.0) -> None:
        self.wallet = wallet
        self._http = httpx.Client(timeout=timeout)

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return self._request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> httpx.Response:
        return self._request("POST", url, **kwargs)

    def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        r = self._http.request(method, url, **kwargs)

        if r.status_code != 402:
            return r

        body = r.json()
        invoice: str = body.get("invoice") or _parse_www_authenticate(
            r.headers.get("WWW-Authenticate", ""), "invoice"
        )
        macaroon: str = body.get("macaroon") or _parse_www_authenticate(
            r.headers.get("WWW-Authenticate", ""), "macaroon"
        )

        if not invoice or not macaroon:
            raise L402Error("402 response missing invoice or macaroon")

        preimage = self.wallet.pay_invoice(invoice)

        headers = dict(kwargs.pop("headers", {}) or {})
        headers["Authorization"] = f"L402 {macaroon}:{preimage}"
        return self._http.request(method, url, headers=headers, **kwargs)

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "L402Client":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()


class L402Error(Exception):
    pass


def _parse_www_authenticate(header: str, field: str) -> str:
    """Extract field="value" from a WWW-Authenticate: L402 header."""
    import re
    m = re.search(rf'{field}="([^"]+)"', header)
    return m.group(1) if m else ""
