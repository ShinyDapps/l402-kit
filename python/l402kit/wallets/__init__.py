import os
from typing import Mapping, Optional

from .alby import AlbyWallet
from .blink import BlinkWallet


def build_wallet(env: Optional[Mapping[str, str]] = None):
    """
    Auto-detects a Lightning wallet from an env-like dict (defaults to os.environ).

    Priority order:
      1. BLINK_API_KEY + BLINK_WALLET_ID → BlinkWallet
      2. ALBY_TOKEN                       → AlbyWallet

    Raises ValueError if no wallet credentials are available.

    Example:
        from l402kit.wallets import build_wallet
        wallet = build_wallet()  # reads from os.environ
    """
    if env is None:
        env = os.environ
    blink_key = env.get("BLINK_API_KEY")
    blink_id = env.get("BLINK_WALLET_ID")
    if blink_key and blink_id:
        return BlinkWallet(blink_key, blink_id)
    alby_token = env.get("ALBY_TOKEN")
    if alby_token:
        return AlbyWallet(alby_token)
    raise ValueError(
        "build_wallet: no wallet configured — set BLINK_API_KEY+BLINK_WALLET_ID or ALBY_TOKEN"
    )


__all__ = ["AlbyWallet", "BlinkWallet", "build_wallet"]
