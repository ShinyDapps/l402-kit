import os
import time
import httpx
from ..types import Invoice


SHINYDAPPS_API = os.environ.get("SHINYDAPPS_API_URL", "https://l402kit.com")


class ManagedProvider:
    """
    Cloud-managed Lightning provider (l402kit.com hosted service).

    Zero infrastructure needed — invoices and splits are handled server-side.
    Fee: 0.3% per payment (99.7% goes to your Lightning Address).

    For sovereign mode (0% fee) use BlinkProvider, OpenNodeProvider, etc.

    Example::

        from l402kit import ManagedProvider, l402_required

        lightning = ManagedProvider.from_address("you@blink.sv")

        @app.get("/premium")
        @l402_required(price_sats=10, lightning=lightning)
        async def premium():
            return {"data": "paid content"}
    """

    def __init__(self, owner_address: str) -> None:
        self._owner_address = owner_address

    @classmethod
    def from_address(cls, address: str) -> "ManagedProvider":
        return cls(address)

    async def create_invoice(self, amount_sats: int) -> Invoice:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                f"{SHINYDAPPS_API}/api/invoice",
                json={"amountSats": amount_sats, "ownerAddress": self._owner_address},
            )
            res.raise_for_status()
            data = res.json()

        return Invoice(
            payment_request=data["paymentRequest"],
            payment_hash=data["paymentHash"],
            macaroon=data["macaroon"],
            amount_sats=amount_sats,
            expires_at=int(time.time()) + 3600,
        )

    async def check_payment(self, payment_hash: str) -> bool:
        return False
