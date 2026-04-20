# l402kit

**Bitcoin Lightning payment middleware for FastAPI and Flask. 3 lines of code.**

```bash
pip install l402kit
```

## Usage

```python
from l402kit import l402_required, BlinkProvider

lightning = BlinkProvider(api_key="...", wallet_id="...")

@app.get("/premium")
@l402_required(price_sats=100, lightning=lightning)
async def premium(request: Request):
    return {"data": "You paid 100 sats!"}
```

Full docs: https://shinydapps.mintlify.app
GitHub: https://github.com/ShinyDapps/l402-kit
