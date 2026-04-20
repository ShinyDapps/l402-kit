"""
Flask example — l402kit
Monetize any Flask route with Bitcoin Lightning (L402).

Install:
    pip install l402kit flask

Run:
    BLINK_API_KEY=blink_xxx BLINK_WALLET_ID=yyy python flask_example.py

Test without paying:
    curl http://localhost:5000/weather

Pay and access:
    curl -H "Authorization: L402 <macaroon>:<preimage>" http://localhost:5000/weather
"""

import os
from flask import Flask, jsonify
from l402kit import l402_required
from l402kit.providers.blink import BlinkProvider

app = Flask(__name__)

# ── Lightning provider ─────────────────────────────────────────────────────────
blink = BlinkProvider(
    api_key=os.environ["BLINK_API_KEY"],
    wallet_id=os.environ["BLINK_WALLET_ID"],
)

# ── Free endpoint ──────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return jsonify({
        "service": "Weather API",
        "pricing": "10 sats per forecast",
        "docs": "https://shinydapps-bd9fa40b.mintlify.app",
    })


# ── Paid endpoint (10 sats) ────────────────────────────────────────────────────
@app.route("/weather")
@l402_required(price_sats=10, lightning=blink)
def weather():
    return jsonify({
        "city": "São Paulo",
        "temp_c": 24,
        "condition": "Sunny",
        "humidity_pct": 62,
    })


# ── Another paid endpoint (50 sats) ───────────────────────────────────────────
@app.route("/forecast/<city>")
@l402_required(price_sats=50, lightning=blink)
def forecast(city: str):
    return jsonify({
        "city": city,
        "days": [
            {"day": "Mon", "temp_c": 23, "condition": "Cloudy"},
            {"day": "Tue", "temp_c": 26, "condition": "Sunny"},
            {"day": "Wed", "temp_c": 21, "condition": "Rain"},
        ],
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
