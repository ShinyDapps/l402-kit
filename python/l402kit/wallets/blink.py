"""BlinkWallet — pays Lightning invoices via the Blink (blink.sv) GraphQL API."""
from __future__ import annotations

import httpx
from ..client import L402Wallet

_GQL = "https://api.blink.sv/graphql"
_MUTATION = """
mutation PayInvoice($input: LnInvoicePaymentInput!) {
  lnInvoicePaymentSend(input: $input) {
    status
    transaction { settlementVia { ... on SettlementViaLn { preImage } } }
    errors { message }
  }
}
"""


class BlinkWallet(L402Wallet):
    """
    Pay invoices via Blink (blink.sv).
    Get credentials at: dashboard.blink.sv → API Keys

    Usage:
        from l402kit.wallets import BlinkWallet
        wallet = BlinkWallet(api_key=os.environ["BLINK_API_KEY"],
                             wallet_id=os.environ["BLINK_WALLET_ID"])
    """

    def __init__(self, api_key: str, wallet_id: str) -> None:
        self._key = api_key
        self._wallet_id = wallet_id

    def pay_invoice(self, bolt11: str) -> str:
        r = httpx.post(
            _GQL,
            headers={"X-API-KEY": self._key, "Content-Type": "application/json"},
            json={
                "query": _MUTATION,
                "variables": {"input": {"paymentRequest": bolt11, "walletId": self._wallet_id}},
            },
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        result = data.get("data", {}).get("lnInvoicePaymentSend", {})
        errors = result.get("errors") or []
        if errors:
            raise ValueError(f"Blink payment error: {errors[0]['message']}")
        preimage: str = (
            (result.get("transaction") or {})
            .get("settlementVia", {})
            .get("preImage", "")
        )
        if not preimage:
            raise ValueError(f"Blink payment response missing preimage: {data}")
        return preimage
