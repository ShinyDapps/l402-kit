"""
L402Tool — LangChain tool for paying L402-protected APIs automatically.

Usage:
    from l402kit.langchain import L402Tool
    from l402kit.wallets import BlinkWallet
    from langchain.agents import initialize_agent, AgentType
    from langchain_openai import ChatOpenAI

    tools = [
        L402Tool(
            wallet=BlinkWallet(os.environ["BLINK_API_KEY"], os.environ["BLINK_WALLET_ID"]),
            budget_sats=1000,
        )
    ]
    agent = initialize_agent(tools, ChatOpenAI(), agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION)
    agent.run("fetch the BTC price from https://api.example.com/btc-price")
"""
from __future__ import annotations

import json
from typing import Any, Callable, Optional, Type

from .client import L402Client, L402Wallet, BudgetExceededError

try:
    from langchain.tools import BaseTool
    from langchain.callbacks.manager import CallbackManagerForToolRun
    from pydantic import BaseModel, Field

    class _L402FetchInput(BaseModel):
        url: str = Field(description="The URL to fetch. Must be an L402-protected API endpoint.")
        method: str = Field(default="GET", description="HTTP method: GET, POST, PUT, DELETE")
        body: Optional[str] = Field(default=None, description="Request body as JSON string (for POST/PUT)")

    _LANGCHAIN_AVAILABLE = True
except ImportError:
    _LANGCHAIN_AVAILABLE = False
    BaseTool = object  # type: ignore
    BaseModel = object  # type: ignore
    _L402FetchInput = None  # type: ignore


class L402Tool(BaseTool):  # type: ignore
    """
    LangChain tool that fetches L402-protected URLs automatically —
    handles the full Lightning payment flow transparently.
    """

    name: str = "l402_fetch"
    description: str = (
        "Fetch data from an L402-protected API that requires a Lightning micropayment. "
        "Handles the payment automatically. "
        "Input: a URL (and optionally method/body). "
        "Output: the API response as text."
    )
    args_schema: Type[BaseModel] = _L402FetchInput  # type: ignore

    _client: Any = None

    def __init__(
        self,
        wallet: L402Wallet,
        budget_sats: Optional[int] = None,
        budget_per_domain: Optional[dict[str, int]] = None,
        on_spend: Optional[Callable[[int, str], None]] = None,
        **kwargs: Any,
    ) -> None:
        if not _LANGCHAIN_AVAILABLE:
            raise ImportError(
                "langchain is required to use L402Tool. "
                "Install it with: pip install langchain langchain-community"
            )
        super().__init__(**kwargs)
        object.__setattr__(self, "_client", L402Client(
            wallet=wallet,
            budget_sats=budget_sats,
            budget_per_domain=budget_per_domain,
            on_spend=on_spend,
        ))

    def _run(
        self,
        url: str,
        method: str = "GET",
        body: Optional[str] = None,
        run_manager: Optional[Any] = None,
    ) -> str:
        client: L402Client = object.__getattribute__(self, "_client")
        try:
            kwargs: dict[str, Any] = {}
            if body:
                kwargs["content"] = body
                kwargs["headers"] = {"Content-Type": "application/json"}

            r = client._request(method.upper(), url, **kwargs)

            report = client.spending_report()
            spent = report.transactions[-1]["sats"] if report and report.transactions else 0
            prefix = f"[Paid {spent} sats] " if spent > 0 else ""

            try:
                data = r.json()
                return f"{prefix}HTTP {r.status_code}\n{json.dumps(data, indent=2)}"
            except Exception:
                return f"{prefix}HTTP {r.status_code}\n{r.text}"

        except BudgetExceededError as e:
            return f"[BLOCKED] Budget exceeded: {e}"
        except Exception as e:
            return f"[ERROR] {e}"

    async def _arun(
        self,
        url: str,
        method: str = "GET",
        body: Optional[str] = None,
        run_manager: Optional[Any] = None,
    ) -> str:
        return self._run(url, method, body, run_manager)

    def spending_report(self) -> Any:
        """Returns a spending report for this tool session."""
        client: L402Client = object.__getattribute__(self, "_client")
        return client.spending_report()
