"""make_gif.py — demo.gif simples e impactante."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 860, 480
BG   = "#0d1117"
PAD  = 60

def font(size):
    for p in ["C:/Windows/Fonts/CascadiaCode.ttf",
              "C:/Windows/Fonts/consola.ttf",
              "C:/Windows/Fonts/cour.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: pass
    return ImageFont.load_default()

F_HUGE  = font(36)
F_BIG   = font(24)
F_MED   = font(18)
F_SMALL = font(15)

def img():
    i = Image.new("RGB", (W, H), BG)
    return i, ImageDraw.Draw(i)

def center_text(d, y, text, color, f):
    w = f.getlength(text)
    d.text(((W - w) / 2, y), text, fill=color, font=f)
    return y + f.size + 12

def left_text(d, x, y, text, color, f):
    d.text((x, y), text, fill=color, font=f)
    return y + f.size + 8

# ── Frame 1: PROBLEMA ─────────────────────────────────────────────────────────
def f1():
    i, d = img()
    y = 100
    y = center_text(d, y, "Stripe rejects Nigeria.", "#f85149", F_BIG)
    y = center_text(d, y, "PayPal blocks Venezuela.", "#f85149", F_BIG)
    y = center_text(d, y, "Banks freeze your account.", "#f85149", F_BIG)
    y += 30
    center_text(d, y, "There's a better way.", "#e6edf3", F_MED)
    return i

# ── Frame 2: SOLUÇÃO ──────────────────────────────────────────────────────────
def f2():
    i, d = img()
    y = 130
    y = center_text(d, y, "l402-kit", "#d29922", F_HUGE)
    y += 10
    y = center_text(d, y, "Pay-per-call APIs with Bitcoin Lightning.", "#e6edf3", F_BIG)
    y += 16
    center_text(d, y, "Zero KYC. Zero account. Works in 180+ countries.", "#6e7681", F_MED)
    return i

# ── Frame 3: CÓDIGO servidor ──────────────────────────────────────────────────
def f3():
    i, d = img()
    # label
    d.text((PAD, 30), "server.py", fill="#6e7681", font=F_SMALL)
    # code box
    x = PAD
    y = 60
    lines = [
        ("# just add 2 lines to any endpoint",  "#6e7681", F_SMALL),
        ("",                                     "#e6edf3", F_SMALL),
        ("@app.get(\"/premium\")",               "#79c0ff", F_MED),
        ("@l402_required(price_sats=10,",        "#e6edf3", F_MED),
        ("                lightning=provider)",  "#e6edf3", F_MED),
        ("async def premium(request):",          "#e6edf3", F_MED),
        ("    return {\"data\": \"...\"}",        "#e6edf3", F_MED),
    ]
    d.rectangle([x-10, y-10, W-PAD+10, y + len(lines)*32 + 10],
                fill="#161b22", outline="#30363d", width=1)
    for text, color, f in lines:
        d.text((x+8, y), text, fill=color, font=f)
        y += f.size + 10
    return i

# ── Frame 4: CÓDIGO cliente ───────────────────────────────────────────────────
def f4():
    i, d = img()
    d.text((PAD, 30), "client.py", fill="#6e7681", font=F_SMALL)
    x, y = PAD, 70
    lines = [
        ("# L402Client handles payment automatically",  "#6e7681", F_SMALL),
        ("",                                            "#e6edf3", F_SMALL),
        ("client = L402Client(wallet=BlinkWallet(...))", "#e6edf3", F_MED),
        ("",                                            "#e6edf3", F_SMALL),
        ("data = client.get(\"https://api.example.com/premium\")", "#e6edf3", F_MED),
        ("       .json()",                              "#e6edf3", F_MED),
        ("",                                            "#e6edf3", F_SMALL),
        ("# pays 1 sat, retries, done.",                "#3fb950", F_SMALL),
    ]
    d.rectangle([x-10, y-10, W-PAD+10, y + len(lines)*28 + 10],
                fill="#161b22", outline="#30363d", width=1)
    for text, color, f in lines:
        d.text((x+8, y), text, fill=color, font=f)
        y += f.size + 8
    return i

# ── Frame 5: AI AGENTS ────────────────────────────────────────────────────────
def f5():
    i, d = img()
    y = 70
    y = center_text(d, y, "AI agents need to pay for APIs.", "#e6edf3", F_BIG)
    y += 10
    y = center_text(d, y, "L402 is the protocol.", "#d29922", F_BIG)
    y += 30
    lines = [
        ("client = L402Client(wallet=BlinkWallet(...))",  "#e6edf3", F_MED),
        ("agent.get(\"https://api.example.com/data\")",    "#e6edf3", F_MED),
        ("# agent pays autonomously — no human needed",   "#3fb950", F_SMALL),
    ]
    x = PAD
    bx = x - 10
    bh = sum(f.size + 10 for _, _, f in lines) + 20
    d.rectangle([bx, y-10, W-PAD+10, y+bh], fill="#161b22", outline="#30363d", width=1)
    for text, color, f in lines:
        d.text((x+8, y), text, fill=color, font=f)
        y += f.size + 10
    return i

# ── Frame 6: FLOW de pagamento ────────────────────────────────────────────────
def f6():
    i, d = img()
    y = 70
    steps = [
        ("agent calls  GET /data",                   "#6e7681"),
        ("← 402  Payment Required",                  "#d29922"),
        ("   wallet pays 1 sat via Lightning  ✓",    "#6e7681"),
        ("agent retries  GET /data  + L402 token",   "#6e7681"),
        ("← 200 OK  — autonomous, trustless, global","#3fb950"),
    ]
    for step, color in steps:
        w = F_MED.getlength(step)
        d.text(((W - w) / 2, y), step, fill=color, font=F_MED)
        y += F_MED.size + 22
    return i

# ── Frame 7: FECHAMENTO ───────────────────────────────────────────────────────
def f7():
    i, d = img()
    y = 80
    y = center_text(d, y, "No bank. No KYC. No Stripe.", "#e6edf3", F_BIG)
    y = center_text(d, y, "Pure Bitcoin. Pure Lightning.", "#d29922", F_BIG)
    y += 20
    y = center_text(d, y, "Works where traditional finance doesn't.", "#6e7681", F_MED)
    y += 30
    y = center_text(d, y, "pip install l402kit    npm install l402-kit", "#3fb950", F_MED)
    y += 6
    center_text(d, y, "l402kit.com", "#6e7681", F_MED)
    return i

# ── Montar GIF ────────────────────────────────────────────────────────────────
frames_data = [
    (f1(), 5500),   # Stripe rejects Nigeria
    (f2(), 5000),   # l402-kit
    (f3(), 5500),   # server code
    (f4(), 5500),   # client code
    (f5(), 5500),   # AI agents
    (f6(), 5000),   # payment flow
    (f7(), 6000),   # close
]

frames    = [f.convert("P", palette=Image.ADAPTIVE, colors=128) for f, _ in frames_data]
durations = [d for _, d in frames_data]

out = "docs/demo.gif"
frames[0].save(
    out,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    optimize=False,
)
print(f"Saved {out}  ({os.path.getsize(out)//1024} KB)  {len(frames)} frames")
