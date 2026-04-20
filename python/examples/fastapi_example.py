import os
from fastapi import FastAPI, Request
from l402kit import l402_required, BlinkProvider
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

lightning = BlinkProvider(
    api_key=os.environ["BLINK_API_KEY"],
    wallet_id=os.environ["BLINK_WALLET_ID"],
)

@app.get("/")
async def root():
    return {"message": "L402-kit Python SDK. Try GET /premium"}

@app.get("/premium")
@l402_required(price_sats=100, lightning=lightning)
async def premium(request: Request):
    return {"data": "Conteúdo premium — você pagou 100 sats!"}
