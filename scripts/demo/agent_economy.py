"""
demo_agent_economy.py — agente que RECEBE e PAGA via L402.

Dois agentes rodando ao mesmo tempo:
  AgentA (servidor) — oferece analise de sentimento por 5 sats
  AgentB (cliente)  — paga AgentA automaticamente e processa o resultado

Sem banco. Sem humano. Puro Lightning.

Rodar: python demo_agent_economy.py
"""
import sys, asyncio, threading, time
sys.path.insert(0, "python")

import httpx
import uvicorn
from fastapi import FastAPI, Request
from l402kit import l402_required
from l402kit.dev import DevProvider, DevWallet
from l402kit import L402Client

# ── AgentA: servidor que vende analise de sentimento ──────────────────────────

provider_a = DevProvider()
app_a = FastAPI()

@app_a.get("/analyze")
@l402_required(price_sats=5, lightning=provider_a)
async def analyze(request: Request):
    text = request.query_params.get("text", "")
    # Simulacao de analise de sentimento
    positive_words = {"good", "great", "love", "amazing", "bitcoin", "lightning"}
    score = sum(1 for w in text.lower().split() if w in positive_words)
    sentiment = "positive" if score > 0 else "neutral"
    return {
        "text": text,
        "sentiment": sentiment,
        "score": score,
        "priced_at": "5 sats",
        "agent": "AgentA",
    }

def run_agent_a():
    uvicorn.run(app_a, host="127.0.0.1", port=8100, log_level="error")

# ── AgentB: cliente que paga AgentA e usa o resultado ─────────────────────────

async def run_agent_b():
    await asyncio.sleep(2)  # aguarda AgentA subir

    wallet_b = DevWallet(provider_a)  # em prod: BlinkWallet(...)
    client   = L402Client(wallet=wallet_b)

    texts = [
        "Bitcoin Lightning is amazing",
        "Banks freeze accounts",
        "l402kit great for AI agents",
    ]

    print("\n" + "="*52)
    print("  AgentB pagando AgentA via L402")
    print("="*52)

    for text in texts:
        print(f"\n  > analisando: \"{text}\"")
        r = client.get(f"http://127.0.0.1:8100/analyze", params={"text": text})
        data = r.json()
        print(f"    sentiment : {data['sentiment']}")
        print(f"    score     : {data['score']}")
        print(f"    pagou     : {data['priced_at']}")
        await asyncio.sleep(0.5)

    print("\n" + "="*52)
    print("  3 analises concluidas. Zero humano. Zero banco.")
    print("  Agente pagou agente via Bitcoin Lightning.")
    print("="*52 + "\n")

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # AgentA roda em thread separada
    t = threading.Thread(target=run_agent_a, daemon=True)
    t.start()

    # AgentB roda no event loop principal
    asyncio.run(run_agent_b())
