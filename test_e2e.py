"""
End-to-end L402 test com Lightning real.
Flow: 402 → QR → paga com Bipa → poll server → token → BTC price
"""
import sys, time, hashlib, base64, json as jsonlib
sys.path.insert(0, "python")
import httpx, qrcode

BASE = "https://l402kit.com"

print("1) GET /api/demo/btc-price ...")
r = httpx.get(f"{BASE}/api/demo/btc-price")
assert r.status_code == 402, f"Expected 402, got {r.status_code}: {r.text}"
body = r.json()

invoice          = body["invoice"]
macaroon         = body["macaroon"]
blink_hash       = body["blinkPaymentHash"]  # Blink's payment hash — for polling
macaroon_hash    = jsonlib.loads(base64.b64decode(macaroon + "==").decode())["hash"]  # SHA256(serverPreimage)

print(f"   invoice:  {invoice[:60]}...")
print(f"   macaroon: {macaroon[:40]}...")
print(f"   blinkPaymentHash: {blink_hash[:20]}...")

print("\n2) Abrindo QR — pague com Bipa:")
qr = qrcode.make(invoice.upper())
qr.save("invoice_qr_live.png")
try:
    from PIL import Image
    Image.open("invoice_qr_live.png").show()
except Exception:
    pass

print("\n3) Aguardando confirmacao do pagamento...")
preimage = None
for i in range(90):
    rp = httpx.get(f"{BASE}/api/demo/preimage", params={"hash": blink_hash})
    if rp.status_code == 200:
        preimage = rp.json()["preimage"]
        print(f"   Preimage recebido apos {i*2}s: {preimage[:20]}...")
        break
    print(f"   [{i*2}s] aguardando... ({rp.status_code})")
    time.sleep(2)

assert preimage, "Timeout (3 min) esperando pagamento"

computed = hashlib.sha256(bytes.fromhex(preimage)).hexdigest()
assert computed == macaroon_hash, f"Hash invalido: {computed} != {macaroon_hash}"
print(f"   SHA256(preimage) == macaroon_hash: PASS")

print(f"\n4) Enviando token L402...")
token = f"{macaroon}:{preimage}"
r2 = httpx.get(f"{BASE}/api/demo/btc-price", headers={"Authorization": f"L402 {token}"})
assert r2.status_code == 200, f"Expected 200, got {r2.status_code}: {r2.text}"

result = r2.json()
print(f"\nSUCCESS - L402 com Lightning real funcionou!")
print(f"   BTC: ${result['bitcoin']['usd']:,} USD | EUR {result['bitcoin']['eur']:,} | GBP {result['bitcoin']['gbp']:,}")
print(f"   Pago com: Lightning L402")
print(f"   Protocol: {result['protocol']}")
