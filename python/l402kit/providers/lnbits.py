import time, base64, json
import httpx
from ..types import Invoice


class LNbitsProvider:
    def __init__(self, api_key: str, base_url: str = "https://legend.lnbits.com"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    async def create_invoice(self, amount_sats: int) -> Invoice:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{self.base_url}/api/v1/payments",
                headers={"X-Api-Key": self.api_key},
                json={"out": False, "amount": amount_sats, "memo": "L402 API access"},
            )
            res.raise_for_status()
            data = res.json()
            exp_ms = int(time.time() * 1000) + 3_600_000
            macaroon = base64.b64encode(json.dumps({"hash": data["payment_hash"], "exp": exp_ms}).encode()).decode()
            return Invoice(data["payment_request"], data["payment_hash"], macaroon, amount_sats, int(time.time()) + 3600)

    async def check_payment(self, payment_hash: str) -> bool:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self.base_url}/api/v1/payments/{payment_hash}", headers={"X-Api-Key": self.api_key})
            return res.is_success and res.json().get("paid", False)
