from .middleware import l402_required
from .client import L402Client, AsyncL402Client, L402Wallet, L402Error, BudgetExceededError, SpendingReport
from .providers.blink import BlinkProvider
from .providers.opennode import OpenNodeProvider
from .providers.lnbits import LNbitsProvider
from .providers.managed import ManagedProvider
from .types import LightningProvider, Invoice
from .replay import MemoryReplayAdapter, RedisReplayAdapter
from .webhook import verify_webhook, build_signature_header, WebhookEvent, WebhookEventData
from .wallets import BlinkWallet, AlbyWallet

__version__ = "1.8.0"
__all__ = [
    "l402_required",
    "L402Client",
    "AsyncL402Client",
    "L402Wallet",
    "L402Error",
    "BudgetExceededError",
    "SpendingReport",
    "BlinkProvider",
    "OpenNodeProvider",
    "LNbitsProvider",
    "ManagedProvider",
    "LightningProvider",
    "Invoice",
    "MemoryReplayAdapter",
    "RedisReplayAdapter",
    "verify_webhook",
    "build_signature_header",
    "WebhookEvent",
    "WebhookEventData",
    "BlinkWallet",
    "AlbyWallet",
]

# Dev/demo exports
from .dev import DevProvider, DevWallet

__all__ = [*__all__, "DevProvider", "DevWallet"]

# LangChain integration (optional)
try:
    from .langchain import L402Tool
    __all__ = [*__all__, "L402Tool"]
except ImportError:
    pass
