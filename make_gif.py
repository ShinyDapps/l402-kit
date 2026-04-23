"""make_gif.py — demo.gif com typewriter, cursor piscando e transicoes."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, math

W, H  = 860, 480
BG    = "#0d1117"
PAD   = 60

def font(size):
    for p in ["C:/Windows/Fonts/CascadiaCode.ttf",
              "C:/Windows/Fonts/consola.ttf",
              "C:/Windows/Fonts/cour.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: pass
    return ImageFont.load_default()

F_HUGE  = font(38)
F_BIG   = font(26)
F_MED   = font(18)
F_SMALL = font(14)
F_CODE  = font(15)

COLORS = dict(
    fg="#e6edf3", dim="#6e7681", green="#3fb950",
    yellow="#d29922", red="#f85149", blue="#79c0ff",
    orange="#ffa657",
)

def img():
    i = Image.new("RGB", (W, H), BG)
    return i, ImageDraw.Draw(i)

def cw(text, f): return int(f.getlength(text))

def center(d, y, text, color, f):
    d.text(((W - cw(text, f)) / 2, y), text, fill=color, font=f)
    return y + f.size + 14

def fade(img_a, img_b, steps=5):
    """Fade de img_a para img_b."""
    frames = []
    for k in range(steps):
        t = k / steps
        f = Image.blend(img_a, img_b, t)
        frames.append((f, 80))
    return frames

def blink_cursor(base_img, x, y, f, n=4):
    """Cursor piscando n vezes."""
    frames = []
    ch = f.size
    for k in range(n * 2):
        fi = base_img.copy()
        if k % 2 == 0:
            ImageDraw.Draw(fi).rectangle([x, y+2, x+2, y+ch-2], fill=COLORS["green"])
        frames.append((fi, 250))
    return frames

def typewriter(base_fn, lines_cfg, start_y, line_h, hold_ms=120):
    """
    Anima linhas aparecendo uma a uma, caractere por caractere.
    lines_cfg = list of (text, color, font)
    Retorna lista de (Image, duration_ms).
    """
    frames = []
    drawn = []  # linhas ja completas

    for line_text, color, f in lines_cfg:
        # Linha vazia — so pausa
        if not line_text.strip():
            img_cur = base_fn(drawn + [(line_text, color, f)])
            frames.append((img_cur, hold_ms * 2))
            drawn.append((line_text, color, f))
            continue

        # Aparece caractere por caractere
        for ci in range(1, len(line_text) + 1):
            partial = line_text[:ci]
            img_cur = base_fn(drawn + [(partial, color, f)])
            frames.append((img_cur, hold_ms))

        drawn.append((line_text, color, f))

    # Pausa no final com todas as linhas
    img_final = base_fn(drawn)
    frames.append((img_final, 2500))
    return frames

# ── Cena 1: PROBLEMA ──────────────────────────────────────────────────────────
def render_problem(lines):
    i, d = img()
    y = 110
    texts = [
        ("Stripe rejects Nigeria.",     COLORS["red"],  F_BIG),
        ("PayPal blocks Venezuela.",    COLORS["red"],  F_BIG),
        ("Banks freeze your account.",  COLORS["red"],  F_BIG),
        ("",                            COLORS["dim"],  F_MED),
        ("There's a better way.",       COLORS["fg"],   F_MED),
    ]
    for text, color, f in texts[:len(lines)]:
        y = center(i.convert("RGB") and d and d, y, text, color, f)
    return i

def scene_problem():
    frames = []
    texts = [
        ("Stripe rejects Nigeria.",     COLORS["red"],  F_BIG),
        ("PayPal blocks Venezuela.",    COLORS["red"],  F_BIG),
        ("Banks freeze your account.",  COLORS["red"],  F_BIG),
        ("",                            COLORS["dim"],  F_MED),
        ("There's a better way.",       COLORS["fg"],   F_MED),
    ]
    for n in range(1, len(texts) + 1):
        fi, d = img()
        y = 110
        for text, color, f in texts[:n]:
            if text:
                d.text(((W - cw(text, f)) / 2, y), text, fill=color, font=f)
            y += (f.size + 14)
        ms = 1500 if n == len(texts) else 800
        frames.append((fi, ms))
    return frames

# ── Cena 2: SOLUCAO ───────────────────────────────────────────────────────────
def scene_solution():
    fi, d = img()
    y = 120
    y = center(d, y, "l402-kit", COLORS["yellow"], F_HUGE)
    y += 8
    y = center(d, y, "Pay-per-call APIs with Bitcoin Lightning.", COLORS["fg"], F_BIG)
    y += 12
    center(d, y, "Zero KYC.  Zero account.  Works in 180+ countries.", COLORS["dim"], F_MED)
    return [(fi, 3500)]

# ── Cena 3: SERVER code com typewriter ───────────────────────────────────────
CODE_SERVER = [
    ("from l402kit import l402_required",            COLORS["blue"],   F_CODE),
    ("from l402kit.providers.blink import Blink",    COLORS["blue"],   F_CODE),
    ("",                                             COLORS["fg"],     F_CODE),
    ("lightning = BlinkProvider(",                   COLORS["fg"],     F_CODE),
    ('    api_key="...", wallet_id="...")',           COLORS["orange"], F_CODE),
    (")",                                            COLORS["fg"],     F_CODE),
    ("",                                             COLORS["fg"],     F_CODE),
    ("@app.get(\"/premium\")",                       COLORS["green"],  F_CODE),
    ("@l402_required(price_sats=10,",               COLORS["yellow"], F_CODE),
    ("                lightning=lightning)",         COLORS["yellow"], F_CODE),
    ("async def premium(request: Request):",         COLORS["fg"],     F_CODE),
    ("    return {\"data\": \"premium content\"}",   COLORS["fg"],     F_CODE),
]

def draw_code_base(drawn_lines, title):
    fi, d = img()
    d.text((PAD, 20), title, fill=COLORS["dim"], font=F_SMALL)
    x, y = PAD + 8, 50
    lh = F_CODE.size + 6
    bh = len(CODE_SERVER) * lh + 20
    d.rectangle([PAD-4, 44, W-PAD+4, 44+bh], fill="#161b22", outline="#30363d", width=1)
    for text, color, f in drawn_lines:
        d.text((x, y), text, fill=color, font=f)
        y += lh
    return fi

def scene_server():
    frames = []
    drawn = []
    step = 4  # render every Nth character
    for line_text, color, f in CODE_SERVER:
        if not line_text.strip():
            drawn.append((line_text, color, f))
            fi = draw_code_base(drawn, "server.py")
            frames.append((fi, 80))
            continue
        indices = list(range(step, len(line_text), step)) + [len(line_text)]
        for ci in indices:
            partial = [(t if i < len(drawn) else line_text[:ci], c, ff)
                       for i, (t, c, ff) in enumerate(drawn + [(line_text, color, f)])]
            fi = draw_code_base(partial, "server.py")
            frames.append((fi, step * 30))
        drawn.append((line_text, color, f))
    fi = draw_code_base(drawn, "server.py")
    frames.append((fi, 2500))
    return frames

# ── Cena 4: CLIENT code com typewriter ───────────────────────────────────────
CODE_CLIENT = [
    ("from l402kit import L402Client",                    COLORS["blue"],   F_CODE),
    ("from l402kit.wallets import BlinkWallet",           COLORS["blue"],   F_CODE),
    ("",                                                  COLORS["fg"],     F_CODE),
    ("wallet = BlinkWallet(",                             COLORS["fg"],     F_CODE),
    ("    api_key=\"...\", wallet_id=\"...\")",            COLORS["orange"], F_CODE),
    (")",                                                 COLORS["fg"],     F_CODE),
    ("client = L402Client(wallet=wallet)",                COLORS["fg"],     F_CODE),
    ("",                                                  COLORS["fg"],     F_CODE),
    ("# one line — pays automatically",                   COLORS["green"],  F_CODE),
    ("data = client.get(\"https://api.example.com\")",    COLORS["fg"],     F_CODE),
    ("              .json()",                             COLORS["dim"],    F_CODE),
]

def scene_client():
    frames = []
    drawn = []
    step = 4
    for line_text, color, f in CODE_CLIENT:
        if not line_text.strip():
            drawn.append((line_text, color, f))
            fi = draw_code_base(drawn, "client.py")
            frames.append((fi, 80))
            continue
        indices = list(range(step, len(line_text), step)) + [len(line_text)]
        for ci in indices:
            partial = [(t if i < len(drawn) else line_text[:ci], c, ff)
                       for i, (t, c, ff) in enumerate(drawn + [(line_text, color, f)])]
            fi = draw_code_base(partial, "client.py")
            frames.append((fi, step * 30))
        drawn.append((line_text, color, f))
    fi = draw_code_base(drawn, "client.py")
    frames.append((fi, 2500))
    return frames

# ── Cena 5: AGENT ECONOMY ─────────────────────────────────────────────────────
def scene_agents():
    frames = []

    def render(arrow_pct=0.0, label=""):
        fi, d = img()
        y = 36
        d.text(((W - cw("Agents paying agents.", F_BIG)) / 2, y),
               "Agents paying agents.", fill=COLORS["yellow"], font=F_BIG)
        y += F_BIG.size + 10
        d.text(((W - cw("No human. No bank. Pure Bitcoin.", F_MED)) / 2, y),
               "No human. No bank. Pure Bitcoin.", fill=COLORS["dim"], font=F_MED)
        y += F_MED.size + 22

        ax1, ax2 = PAD, W//2 - 24
        bx1, bx2 = W//2 + 24, W - PAD
        box_h = 150

        d.rectangle([ax1, y, ax2, y+box_h], fill="#0d2818", outline=COLORS["green"], width=2)
        d.text((ax1+14, y+12), "AgentA  (seller)", fill=COLORS["green"], font=F_MED)
        for j, line in enumerate(["@l402_required(price_sats=5)", "async def analyze(request):", "    return sentiment", "", "receives sats directly"]):
            c = COLORS["green"] if j == 4 else COLORS["fg"]
            d.text((ax1+14, y+42+j*20), line, fill=c, font=F_SMALL)

        d.rectangle([bx1, y, bx2, y+box_h], fill="#0d1a2e", outline=COLORS["blue"], width=2)
        d.text((bx1+14, y+12), "AgentB  (buyer)", fill=COLORS["blue"], font=F_MED)
        for j, line in enumerate(["client = L402Client(", "  wallet=BlinkWallet())", "client.get('/analyze')", "", "pays automatically"]):
            c = COLORS["blue"] if j == 4 else COLORS["fg"]
            d.text((bx1+14, y+42+j*20), line, fill=c, font=F_SMALL)

        # Seta animada
        mid_y = y + box_h // 2
        x_start, x_end = ax2 + 4, bx1 - 4
        x_cur = int(x_start + (x_end - x_start) * arrow_pct)
        if x_cur > x_start:
            d.line([(x_start, mid_y), (x_cur, mid_y)], fill=COLORS["yellow"], width=3)
        if arrow_pct >= 1.0:
            d.polygon([(x_end-8, mid_y-6), (x_end-8, mid_y+6), (x_end+2, mid_y)], fill=COLORS["yellow"])
        if label:
            lw = cw(label, F_SMALL)
            d.text(((x_start + x_end) // 2 - lw // 2, mid_y - 22), label, fill=COLORS["yellow"], font=F_SMALL)

        foot = "Any agent. Any API. Any country. Instant."
        d.text(((W - cw(foot, F_SMALL)) / 2, y + box_h + 18), foot, fill=COLORS["dim"], font=F_SMALL)
        return fi

    # Seta aparecendo
    steps = 10
    for k in range(steps + 1):
        pct = k / steps
        label = "5 sats" if pct >= 1.0 else ""
        frames.append((render(pct, label), 100))

    # Hold final
    frames.append((render(1.0, "5 sats"), 4000))
    return frames

# ── Cena 6: PAYMENT FLOW ─────────────────────────────────────────────────────
def scene_flow():
    steps = [
        ("agent calls  GET /premium",               COLORS["dim"]),
        ("<- 402  Payment Required",                 COLORS["yellow"]),
        ("   wallet pays 1 sat via Lightning  v",   COLORS["dim"]),
        ("agent retries  + L402 token",             COLORS["dim"]),
        ("<- 200 OK  — autonomous, global, instant", COLORS["green"]),
    ]
    frames = []
    for n in range(1, len(steps) + 1):
        fi, d = img()
        y = 120
        for text, color in steps[:n]:
            d.text(((W - cw(text, F_MED)) / 2, y), text, fill=color, font=F_MED)
            y += F_MED.size + 24
        ms = 2500 if n == len(steps) else 700
        frames.append((fi, ms))
    return frames

# ── Cena 7: FECHAMENTO ────────────────────────────────────────────────────────
def scene_close():
    fi, d = img()
    y = 90
    y = center(d, y, "No bank. No KYC. No Stripe.", COLORS["fg"], F_BIG)
    y = center(d, y, "Pure Bitcoin. Pure Lightning.", COLORS["yellow"], F_BIG)
    y += 20
    y = center(d, y, "Works where traditional finance doesn't.", COLORS["dim"], F_MED)
    y += 26
    y = center(d, y, "pip install l402kit    npm install l402-kit", COLORS["green"], F_MED)
    center(d, y, "l402kit.com", COLORS["dim"], F_MED)
    return [(fi, 5000)]

# ── Montar GIF ────────────────────────────────────────────────────────────────
all_frames = []

scenes = [
    scene_problem(),
    scene_solution(),
    scene_server(),
    scene_client(),
    scene_agents(),
    scene_flow(),
    scene_close(),
]

# Adiciona fade de 6 frames entre cenas
for si, scene in enumerate(scenes):
    if si > 0:
        prev_img = all_frames[-1][0]
        next_img = scene[0][0]
        all_frames += fade(prev_img.convert("RGB"), next_img.convert("RGB"), steps=8)
    all_frames += scene

frames    = [f.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=64) for f, _ in all_frames]
durations = [d for _, d in all_frames]

out = "docs/demo.gif"
frames[0].save(out, save_all=True, append_images=frames[1:],
               duration=durations, loop=0, optimize=True)

total_s = sum(durations) / 1000
print(f"Saved {out}  ({os.path.getsize(out)//1024} KB)  {len(frames)} frames  ~{total_s:.0f}s")
