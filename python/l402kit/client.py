"""
L402Client — pays Lightning invoices automatically when an API returns 402.

Usage:
    from l402kit import L402Client
    from l402kit.wallets import BlinkWallet

    client = L402Client(
        wallet=BlinkWallet(os.environ["BLINK_API_KEY"], os.environ["BLINK_WALLET_ID"]),
        budget_sats=1000,
        on_spend=lambda sats, url: print(f"{sats} sats → {url}"),
    )
    data = client.get("https://api.example.com/premium")
    print(client.spending_report())
"""
from __future__ import annotations

import httpx
from typing import Any, Callable, Optional
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone


class L402Wallet(ABC):
    """Interface for wallets that can pay Lightning invoices."""

    @abstractmethod
    def pay_invoice(self, bolt11: str) -> str:
        """Pay a BOLT11 invoice. Returns the preimage (hex string)."""
        ...


@dataclass
class SpendingReport:
    total: int
    remaining: int
    by_domain: dict[str, int] = field(default_factory=dict)
    transactions: list[dict[str, Any]] = field(default_factory=list)


class BudgetExceededError(Exception):
    def __init__(self, url: str, required: int, remaining: int) -> None:
        super().__init__(
            f"Budget exceeded: need {required} sats but only {remaining} remaining ({url})"
        )
        self.url = url
        self.required = required
        self.remaining = remaining


class L402Client:
    """
    HTTP client that automatically handles L402 payment challenges.

    When a request returns 402, the client:
      1. Parses the invoice and macaroon from the response
      2. Checks budget (if configured) before paying
      3. Pays the invoice via the configured wallet
      4. Retries the request with Authorization: L402 <macaroon>:<preimage>
    """

    def __init__(
        self,
        wallet: L402Wallet,
        timeout: float = 30.0,
        budget_sats: Optional[int] = None,
        budget_per_domain: Optional[dict[str, int]] = None,
        on_spend: Optional[Callable[[int, str], None]] = None,
        on_budget_exceeded: Optional[Callable[[str, int], None]] = None,
    ) -> None:
        self.wallet = wallet
        self._http = httpx.Client(timeout=timeout)
        self._budget_limit = budget_sats
        self._budget_per_domain = budget_per_domain or {}
        self._on_spend = on_spend
        self._on_budget_exceeded = on_budget_exceeded
        self._spent = 0
        self._by_domain: dict[str, int] = {}
        self._transactions: list[dict[str, Any]] = []

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return self._request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> httpx.Response:
        return self._request("POST", url, **kwargs)

    def spending_report(self) -> Optional[SpendingReport]:
        """Returns spending breakdown. None if no budget configured."""
        if self._budget_limit is None:
            return None
        return SpendingReport(
            total=self._spent,
            remaining=max(0, self._budget_limit - self._spent),
            by_domain=dict(self._by_domain),
            transactions=list(self._transactions),
        )

    def _domain(self, url: str) -> str:
        try:
            from urllib.parse import urlparse
            return urlparse(url).hostname or url
        except Exception:
            return url

    def _check_budget(self, url: str, price_sats: int) -> None:
        if self._budget_limit is not None:
            remaining = self._budget_limit - self._spent
            if price_sats > remaining:
                if self._on_budget_exceeded:
                    self._on_budget_exceeded(url, price_sats)
                raise BudgetExceededError(url, price_sats, remaining)
        domain = self._domain(url)
        domain_limit = self._budget_per_domain.get(domain)
        if domain_limit is not None:
            domain_spent = self._by_domain.get(domain, 0)
            domain_remaining = domain_limit - domain_spent
            if price_sats > domain_remaining:
                if self._on_budget_exceeded:
                    self._on_budget_exceeded(url, price_sats)
                raise BudgetExceededError(url, price_sats, domain_remaining)

    def _record_spend(self, url: str, price_sats: int) -> None:
        self._spent += price_sats
        domain = self._domain(url)
        self._by_domain[domain] = self._by_domain.get(domain, 0) + price_sats
        self._transactions.append({
            "url": url, "sats": price_sats,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        if self._on_spend:
            self._on_spend(price_sats, url)

    def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        r = self._http.request(method, url, **kwargs)

        if r.status_code != 402:
            return r

        try:
            body = r.json()
        except Exception:
            body = {}

        invoice: str = (
            body.get("invoice")
            or body.get("paymentRequest")
            or body.get("payment_request")
            or _parse_www_authenticate(r.headers.get("WWW-Authenticate", ""), "invoice")
        )
        macaroon: str = (
            body.get("macaroon")
            or _parse_www_authenticate(r.headers.get("WWW-Authenticate", ""), "macaroon")
        )
        price_sats: Optional[int] = body.get("priceSats") or body.get("price_sats")

        if not invoice or not macaroon:
            raise L402Error("402 response missing invoice or macaroon")

        if price_sats is not None:
            self._check_budget(url, price_sats)

        preimage = self.wallet.pay_invoice(invoice)

        if price_sats is not None and price_sats > 0:
            self._record_spend(url, price_sats)

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
