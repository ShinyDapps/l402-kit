from dataclasses import dataclass
from typing import Protocol


@dataclass
class Invoice:
    payment_request: str
    payment_hash: str
    macaroon: str
    amount_sats: int
    expires_at: int


class LightningProvider(Protocol):
    async def create_invoice(self, amount_sats: int) -> Invoice: ...
    async def check_payment(self, payment_hash: str) -> bool: ...
