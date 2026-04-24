import time
import base64
import json
import httpx
from ..types import Invoice


class BlinkProvider:
    """
    Blink Lightning provider — free, no node needed.
    Get API key at dashboard.blink.sv
    """

    def __init__(self, api_key: str, wallet_id: str):
        self.api_key = api_key
        self.wallet_id = wallet_id

    async def create_invoice(self, amount_sats: int) -> Invoice:
        query = """
        mutation CreateInvoice($input: LnInvoiceCreateInput!) {
          lnInvoiceCreate(input: $input) {
            invoice { paymentRequest paymentHash }
            errors { message }
          }
        }
        """
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.blink.sv/graphql",
                headers={"X-API-KEY": self.api_key},
                json={"query": query, "variables": {
                    "input": {"walletId": self.wallet_id, "amount": amount_sats, "memo": "L402 API access"}
                }},
            )
            res.raise_for_status()
            data = res.json()["data"]["lnInvoiceCreate"]

            if data.get("errors"):
                raise Exception(f"Blink error: {data['errors'][0]['message']}")

            inv = data["invoice"]
            exp_ms = int(time.time() * 1000) + 3_600_000
            macaroon = base64.b64encode(json.dumps({
                "hash": inv["paymentHash"],
                "exp": exp_ms,
            }).encode()).decode()

            return Invoice(
                payment_request=inv["paymentRequest"],
                payment_hash=inv["paymentHash"],
                macaroon=macaroon,
                amount_sats=amount_sats,
                expires_at=int(time.time()) + 3600,
            )

    async def check_payment(self, payment_hash: str) -> bool:
        query = """
        query CheckInvoice($paymentHash: PaymentHash!) {
          lnInvoice(paymentHash: $paymentHash) { status }
        }
        """
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.blink.sv/graphql",
                headers={"X-API-KEY": self.api_key},
                json={"query": query, "variables": {"paymentHash": payment_hash}},
            )
            if not res.is_success:
                return False
            return res.json().get("data", {}).get("lnInvoice", {}).get("status") == "PAID"
