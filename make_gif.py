"""make_gif.py — gera demo.gif do l402-kit sem gravação de tela."""
from PIL import Image, ImageDraw, ImageFont
import os, sys

# ── Config ────────────────────────────────────────────────────────────────────
W, H       = 860, 480
BG         = "#0d1117"   # GitHub dark
FG         = "#e6edf3"
DIM        = "#6e7681"
GREEN      = "#3fb950"
YELLOW     = "#d29922"
RED        = "#f85149"
ORANGE     = "#ffa657"
BLUE       = "#79c0ff"
BORDER_Y   = "#d29922"
BORDER_G   = "#3fb950"
BORDER_R   = "#f85149"
PAD        = 36

def font(size=15, bold=False):
    candidates = [
        "C:/Windows/Fonts/CascadiaCode.ttf",
        "C:/Windows/Fonts/CascadiaCodePL.ttf",
        "C:/Windows/Fonts/consola.ttf",
        "C:/Windows/Fonts/cour.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: pass
    return ImageFont.load_default()

FONT   = font(16)
FONT_B = font(18)
FONT_S = font(14)

def new_img():
    img = Image.new("RGB", (W, H), BG)
    return img, ImageDraw.Draw(img)

def text(d, x, y, s, color=FG, f=None):
    d.text((x, y), s, fill=color, font=f or FONT)
    return y + (f or FONT).size + 4

def box(d, x1, y1, x2, y2, border):
    d.rectangle([x1, y1, x2, y2], outline=border, width=2)

def panel(d, lines, y_start, border_color, width=W - PAD*2):
    x1, x2 = PAD, PAD + width
    line_h = FONT.size + 6
    h = len(lines) * line_h + 28
    y2 = y_start + h
    d.rectangle([x1, y_start, x2, y2], outline=border_color, width=2)
    y = y_start + 14
    for color, txt in lines:
        d.text((x1 + 18, y), txt, fill=color, font=FONT)
        y += line_h
    return y2 + 16

def rule(d, y, label, color=DIM):
    d.line([(PAD, y+9), (PAD+80, y+9)], fill=color, width=1)
    d.text((PAD+88, y), label, fill=color, font=FONT_S)
    lx = PAD + 88 + FONT_S.getlength(label) + 8
    d.line([(lx, y+9), (W-PAD, y+9)], fill=color, width=1)
    return y + 24

def code_block(d, lines, y, lang_colors=None):
    x = PAD + 18
    line_h = FONT.size + 5
    d.rectangle([PAD, y, W-PAD, y + len(lines)*line_h + 16], fill="#161b22", outline="#30363d", width=1)
    y += 8
    for line in lines:
        d.text((x, y), line, fill=FG, font=FONT)
        y += line_h
    return y + 12

# ── Frames ───────────────────────────────────────────────────────────────────

def frame_problem():
    img, d = new_img()
    y = 60
    lines = [
        (RED,    "  Stripe rejects Nigeria."),
        (RED,    "  PayPal blocks Venezuela."),
        (RED,    "  Banks freeze developer accounts."),
        (FG,     ""),
        (FG,     "  What if any API could accept payments"),
        (FG,     "  from anyone, anywhere — in seconds?"),
    ]
    panel(d, lines, y, BORDER_R)
    return img

def frame_solution():
    img, d = new_img()
    y = 80
    lines = [
        (YELLOW, "  l402-kit"),
        (FG,     ""),
        (FG,     "  Bitcoin Lightning pay-per-call."),
        (FG,     "  3 lines of code. Zero KYC. Zero account."),
        (FG,     "  Works in 180+ countries."),
    ]
    panel(d, lines, y, BORDER_Y)
    return img

def frame_server():
    img, d = new_img()
    y = PAD
    y = rule(d, y, "server — 3 lines")
    lines = [
        "from l402kit import l402_required",
        "from l402kit.providers.blink import BlinkProvider",
        "",
        'lightning = BlinkProvider(api_key="...", wallet_id="...")',
        "",
        '@app.get("/data")',
        "@l402_required(price_sats=10, lightning=lightning)",
        "async def data(request: Request):",
        '    return {"result": "premium content"}',
    ]
    code_block(d, lines, y)
    return img

def frame_client():
    img, d = new_img()
    y = PAD
    y = rule(d, y, "client — 1 line")
    lines = [
        'client = L402Client(wallet=BlinkWallet(api_key="...", wallet_id="..."))',
        'data   = client.get("https://api.example.com/data").json()',
        "# pays automatically via Lightning. No code changes needed.",
    ]
    code_block(d, lines, y)
    return img

def frame_flow(step=0):
    img, d = new_img()
    y = PAD
    y = rule(d, y, "live — payment flow")

    all_steps = [
        (DIM,   "  GET  /data"),
        (YELLOW,"  402  Payment Required   lnbc10n1p574qdfsp5..."),
        (DIM,   "       wallet pays 10 sat via Lightning......"),
        (DIM,   "       preimage : a3f8c2d1e9b047..."),
        (DIM,   "       SHA256   : 7e4a19f2c8d0b3...  ✓ OK"),
        (DIM,   "  GET  /data   Authorization: L402 eyJhbGci..."),
        (GREEN, "  200  OK"),
    ]

    line_h = FONT.size + 8
    for i, (color, txt) in enumerate(all_steps):
        if i <= step:
            c = color if i == step or i == len(all_steps)-1 else DIM
            d.text((PAD + 10, y), txt, fill=c, font=FONT)
        y += line_h

    if step >= 6:
        y += 4
        result = '  { "result": "premium content", "sats_paid": 10, "protocol": "L402" }'
        d.rectangle([PAD, y, W-PAD, y+34], fill="#161b22", outline="#30363d", width=1)
        d.text((PAD+10, y+8), result, fill=GREEN, font=FONT_S)

    return img

def frame_extension():
    img, d = new_img()
    y = PAD
    y = rule(d, y, "VS Code Extension")
    lines = [
        (FG,    "  ShinyDapps.shinydapps-l402"),
        (FG,    ""),
        (GREEN, "  >  l402-kit: Add to endpoint"),
        (GREEN, "  >  l402-kit: Test payment flow"),
        (GREEN, "  >  l402-kit: Open payment stats"),
        (FG,    ""),
        (DIM,   "  Installs decorator + provider in 1 click"),
    ]
    panel(d, lines, y, DIM)
    return img

def frame_close():
    img, d = new_img()
    y = 50
    lines = [
        (FG,     "  No bank. No KYC. No Stripe."),
        (YELLOW, "  Pure Bitcoin. Pure Lightning."),
        (FG,     ""),
        (DIM,    "  Sovereign mode: 0% fee — payments go straight to your wallet."),
        (DIM,    "  Any wallet. Any country. Any API."),
        (FG,     ""),
        (YELLOW, "  pip install l402kit  ·  npm install l402-kit  ·  l402kit.com"),
    ]
    panel(d, lines, y, BORDER_G)
    return img

# ── Assemble GIF ─────────────────────────────────────────────────────────────

frames = []
durations = []

def add(img, ms):
    frames.append(img.convert("P", palette=Image.ADAPTIVE, colors=128))
    durations.append(ms)

add(frame_problem(),    2500)
add(frame_solution(),   2000)
add(frame_server(),     2200)
add(frame_client(),     1800)
add(frame_flow(0),       700)
add(frame_flow(1),       800)
add(frame_flow(2),       900)
add(frame_flow(3),       600)
add(frame_flow(4),       600)
add(frame_flow(5),       700)
add(frame_flow(6),      1400)
add(frame_extension(),  2000)
add(frame_close(),      3500)

out = "docs/demo.gif"
frames[0].save(
    out,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    optimize=False,
)
print(f"Saved {out}  ({os.path.getsize(out)//1024} KB)")
