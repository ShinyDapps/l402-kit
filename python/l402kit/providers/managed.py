import os
import time
import threading
from typing import Optional
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

        # With optional public directory registration:
        lightning = ManagedProvider.from_address("you@blink.sv", register_directory={
            "url": "https://api.you.com/v1/data",
            "name": "My Data API",
            "price_sats": 10,
            "category": "data",
        })
    """

    def __init__(self, owner_address: str) -> None:
        self._owner_address = owner_address

    @classmethod
    def from_address(
        cls,
        address: str,
        register_directory: Optional[dict] = None,
    ) -> "ManagedProvider":
        provider = cls(address)
        if register_directory:
            def _register() -> None:
                try:
                    with httpx.Client(timeout=10.0) as client:
                        client.post(
                            f"{SHINYDAPPS_API}/api/register",
                            json={
                                "url": register_directory.get("url"),
                                "name": register_directory.get("name"),
                                "price_sats": register_directory.get("price_sats"),
                                "lightning_address": address,
                                "description": register_directory.get("description"),
                                "category": register_directory.get("category", "other"),
                            },
                        )
                except Exception:
                    pass  # best-effort — never break server startup
            threading.Thread(target=_register, daemon=True).start()
        return provider

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
