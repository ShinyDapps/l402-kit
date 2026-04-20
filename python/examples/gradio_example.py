"""
Gradio + l402kit — Monetize an AI demo with Bitcoin Lightning.

Install:
    pip install l402kit[fastapi] gradio uvicorn

Run:
    BLINK_API_KEY=... BLINK_WALLET_ID=... python gradio_example.py

Then open http://localhost:7860 for the Gradio UI
or call GET http://localhost:8000/generate directly (pay-per-call API).

The /generate endpoint charges 50 sats per inference.
Any L402-compatible client (AI agent, curl, etc.) can pay and access it.
"""

import os
import threading
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from l402kit import l402_required, BlinkProvider

# ── FastAPI (pay-per-call backend) ──────────────────────────────────────────

app = FastAPI(title="l402kit Gradio Example")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

lightning = BlinkProvider(
    api_key=os.environ["BLINK_API_KEY"],
    wallet_id=os.environ["BLINK_WALLET_ID"],
)


@app.get("/")
async def root():
    return {"message": "Pay-per-call AI API. GET /generate costs 50 sats."}


@app.get("/generate")
@l402_required(
    price_sats=50,
    lightning=lightning,
    owner_lightning_address=os.environ.get("LIGHTNING_ADDRESS", "you@blink.sv"),
)
async def generate(request: Request, prompt: str = "Hello!"):
    """Paid inference endpoint — 50 sats per call."""
    # Replace this with any real ML model call
    words = len(prompt.split())
    return {
        "prompt": prompt,
        "response": f"[AI response to '{prompt}'] — {words} word(s) processed.",
        "model": "example-model-1.0",
        "cost_sats": 50,
    }


def run_api():
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")


# ── Gradio (public demo UI) ──────────────────────────────────────────────────

try:
    import gradio as gr
    import httpx

    async def call_api(prompt: str, auth_token: str):
        """Gradio wrapper — calls the paid API with an L402 token."""
        if not auth_token.strip():
            return (
                "No token provided.\n\n"
                "To get a token:\n"
                "1. Call GET http://localhost:8000/generate — you'll receive a 402\n"
                "2. Pay the Lightning invoice in the WWW-Authenticate header\n"
                "3. Paste the L402 token here (format: L402 <macaroon>:<preimage>)"
            )
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"http://localhost:8000/generate?prompt={prompt}",
                headers={"Authorization": auth_token},
            )
        if res.status_code == 200:
            data = res.json()
            return f"✅ Response: {data['response']}\n\nCost: {data['cost_sats']} sats"
        elif res.status_code == 402:
            www_auth = res.headers.get("WWW-Authenticate", "")
            return f"⚡ Payment required (402).\n\n{www_auth}\n\nPay the invoice and retry with the token."
        else:
            return f"Error {res.status_code}: {res.text}"

    demo = gr.Interface(
        fn=call_api,
        inputs=[
            gr.Textbox(label="Prompt", placeholder="Enter your prompt here…"),
            gr.Textbox(label="L402 Token", placeholder="L402 <macaroon>:<preimage>", lines=2),
        ],
        outputs=gr.Textbox(label="Response", lines=6),
        title="⚡ l402kit — Pay-per-Call AI Demo",
        description=(
            "This demo charges **50 sats** per inference via Bitcoin Lightning.\n\n"
            "Get an L402 token by calling `GET http://localhost:8000/generate` "
            "and paying the Lightning invoice."
        ),
        examples=[["What is the L402 protocol?", ""], ["How many sats in a bitcoin?", ""]],
    )

    if __name__ == "__main__":
        # Start FastAPI in background thread, then launch Gradio
        api_thread = threading.Thread(target=run_api, daemon=True)
        api_thread.start()
        print("API running at http://localhost:8000")
        demo.launch(server_port=7860)

except ImportError:
    # Gradio not installed — just run the API
    if __name__ == "__main__":
        print("Gradio not installed. Running API only at http://localhost:8000")
        print("Install Gradio: pip install gradio")
        uvicorn.run(app, host="0.0.0.0", port=8000)
