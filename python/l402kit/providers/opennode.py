import time, base64, json
import httpx
from ..types import Invoice


class OpenNodeProvider:
    def __init__(self, api_key: str, test_mode: bool = False):
        self.api_key = api_key
        self.base_url = "https://dev-api.opennode.com" if test_mode else "https://api.opennode.com"

    async def create_invoice(self, amount_sats: int) -> Invoice:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f"{self.base_url}/v1/charges",
                headers={"Authorization": self.api_key},
                json={"amount": amount_sats, "description": "L402 API access", "currency": "SATS"},
            )
            res.raise_for_status()
            data = res.json()["data"]
            macaroon = base64.b64encode(json.dumps({"hash": data["id"], "exp": int(time.time()) + 3600}).encode()).decode()
            return Invoice(data["lightning_invoice"]["payreq"], data["id"], macaroon, amount_sats, int(time.time()) + 3600)

    async def check_payment(self, charge_id: str) -> bool:
        async with httpx.AsyncClient() as client:
            res = await client.get(f"{self.base_url}/v1/charge/{charge_id}", headers={"Authorization": self.api_key})
            return res.is_success and res.json().get("data", {}).get("status") == "paid"
