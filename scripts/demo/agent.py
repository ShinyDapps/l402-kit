"""
demo_agent.py — AI agent que paga L402 automaticamente com Lightning real.

Requer:
    pip install l402kit langchain langchain-anthropic qrcode pillow

Uso:
    python demo_agent.py
"""
import os, sys, time, hashlib, base64, json as jsonlib
sys.path.insert(0, "python")

import httpx

# ── Manual L402 Wallet (paga via QR + server preimage) ──────────────────────

class ManualL402Wallet:
    """
    Wallet para demo: mostra QR, espera pagamento externo (Bipa),
    busca o preimage do servidor l402kit.com.
    """
    BASE = "https://l402kit.com"

    def pay_invoice(self, bolt11: str, blink_payment_hash: str) -> str:
        import qrcode
        print(f"\n[L402Wallet] Pagando invoice de 1 sat via Lightning...")
        qr = qrcode.make(bolt11.upper())
        qr.save("agent_invoice_qr.png")
        try:
            from PIL import Image
            Image.open("agent_invoice_qr.png").show()
        except Exception:
            pass
        print(f"[L402Wallet] QR salvo em agent_invoice_qr.png — pague com Bipa!")

        print("[L402Wallet] Aguardando confirmacao do servidor...")
        for i in range(90):
            r = httpx.get(f"{self.BASE}/api/demo/preimage", params={"hash": blink_payment_hash})
            if r.status_code == 200:
                preimage = r.json()["preimage"]
                print(f"[L402Wallet] Preimage recebido em {i*2}s.")
                return preimage
            time.sleep(2)
        raise TimeoutError("Pagamento nao confirmado em 3 minutos")


# ── L402-aware HTTP tool ─────────────────────────────────────────────────────

def fetch_btc_price() -> dict:
    """Busca preco do BTC em l402kit.com/api/demo/btc-price pagando 1 sat."""
    wallet = ManualL402Wallet()
    base = "https://l402kit.com"

    # 1) Hit endpoint
    r = httpx.get(f"{base}/api/demo/btc-price")
    if r.status_code == 200:
        return r.json()

    assert r.status_code == 402, f"Unexpected status {r.status_code}"
    body = r.json()
    invoice          = body["invoice"]
    macaroon         = body["macaroon"]
    blink_hash       = body["blinkPaymentHash"]
    macaroon_hash    = jsonlib.loads(base64.b64decode(macaroon + "==").decode())["hash"]

    # 2) Pay
    preimage = wallet.pay_invoice(invoice, blink_hash)

    # 3) Verify locally
    computed = hashlib.sha256(bytes.fromhex(preimage)).hexdigest()
    assert computed == macaroon_hash, "Hash invalido — preimage corrompido"

    # 4) Retry with token
    token = f"{macaroon}:{preimage}"
    r2 = httpx.get(f"{base}/api/demo/btc-price", headers={"Authorization": f"L402 {token}"})
    assert r2.status_code == 200, f"Autorizacao rejeitada: {r2.text}"
    return r2.json()


# ── LangChain Agent ──────────────────────────────────────────────────────────

def run_agent():
    try:
        from langchain_anthropic import ChatAnthropic
        from langchain.agents import AgentExecutor, create_tool_calling_agent
        from langchain_core.tools import tool
        from langchain_core.prompts import ChatPromptTemplate
    except ImportError:
        print("Instale: pip install langchain langchain-anthropic")
        sys.exit(1)

    @tool
    def get_bitcoin_price() -> str:
        """
        Busca o preco atual do Bitcoin em USD, EUR e GBP.
        Requer pagamento de 1 sat via Lightning L402. Paga automaticamente.
        """
        data = fetch_btc_price()
        btc = data["bitcoin"]
        return (
            f"Bitcoin: ${btc['usd']:,} USD | {btc['eur']:,} EUR | {btc['gbp']:,} GBP "
            f"(fonte: {btc.get('source','?')})"
        )

    llm = ChatAnthropic(
        model="claude-sonnet-4-6",
        api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", (
            "Voce e um assistente financeiro que pode consultar o preco do Bitcoin. "
            "Cada consulta custa 1 satoshi via Lightning (L402). "
            "Use a tool get_bitcoin_price quando o usuario pedir o preco do BTC."
        )),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ])

    agent = create_tool_calling_agent(llm, [get_bitcoin_price], prompt)
    executor = AgentExecutor(agent=agent, tools=[get_bitcoin_price], verbose=True)

    print("\n=== L402 AI Agent Demo ===")
    print("Agent vai pagar 1 sat automaticamente para buscar o preco do BTC.\n")

    result = executor.invoke({"input": "Qual e o preco atual do Bitcoin?"})
    print(f"\nResposta: {result['output']}")


# ── Fallback sem LangChain ───────────────────────────────────────────────────

def run_simple():
    print("\n=== L402 Demo (sem LangChain) ===")
    print("Buscando preco do BTC pagando 1 sat via Lightning...\n")
    data = fetch_btc_price()
    btc = data["bitcoin"]
    print(f"BTC: ${btc['usd']:,} USD | {btc['eur']:,} EUR | {btc['gbp']:,} GBP")
    print(f"Pago com: Lightning L402")


if __name__ == "__main__":
    use_agent = "--agent" in sys.argv or os.environ.get("ANTHROPIC_API_KEY")
    if use_agent:
        run_agent()
    else:
        print("Tip: ANTHROPIC_API_KEY=sk-... python demo_agent.py --agent  (usa LangChain)")
        run_simple()
