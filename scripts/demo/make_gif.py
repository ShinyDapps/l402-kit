"""make_gif.py — demo.gif com ilustrações PIL, países reais, robôs e Lightning."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 860, 480
BG   = (13, 17, 23)
PAD  = 50

def font(size):
    for p in ["C:/Windows/Fonts/CascadiaCode.ttf",
              "C:/Windows/Fonts/consola.ttf",
              "C:/Windows/Fonts/cour.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: pass
    return ImageFont.load_default()

F_HUGE  = font(42)
F_BIG   = font(26)
F_MED   = font(17)
F_SMALL = font(13)
F_CODE  = font(14)

C = dict(
    fg=(230, 237, 243), dim=(110, 118, 129), green=(63, 185, 80),
    yellow=(210, 153, 34), red=(248, 81, 73), blue=(121, 192, 255),
    orange=(255, 166, 87), purple=(188, 140, 255), bg=BG,
)

def img():
    i = Image.new("RGB", (W, H), BG)
    return i, ImageDraw.Draw(i)

def cw(text, f):
    return int(f.getlength(text))

def center(d, y, text, color, f):
    d.text(((W - cw(text, f)) / 2, y), text, fill=color, font=f)
    return y + f.size + 12

def fade(img_a, img_b, steps=5):
    frames = []
    for k in range(steps):
        t = k / steps
        f = Image.blend(img_a, img_b, t)
        frames.append((f, 80))
    return frames

def blend_color(color, alpha, bg=BG):
    """Simula transparência misturando com BG."""
    return tuple(int(bg[i] + (color[i] - bg[i]) * alpha) for i in range(3))

# ── Ilustrações PIL ───────────────────────────────────────────────────────────

def draw_lock(d, cx, cy, color, size=30):
    bw, bh = size, int(size * 0.85)
    bx, by = cx - bw//2, cy
    d.rounded_rectangle([bx, by, bx+bw, by+bh], radius=4, fill=color)
    sw = int(size * 0.55)
    sx = cx - sw//2
    sy = cy - int(size * 0.55)
    d.arc([sx, sy, sx+sw, cy+6], start=180, end=0, fill=color, width=4)
    kx, ky = cx, by + bh//2 - 2
    d.ellipse([kx-4, ky-4, kx+4, ky+4], fill=BG)
    d.rectangle([kx-2, ky+2, kx+2, ky+10], fill=BG)

def draw_lightning(d, cx, cy, color, size=60):
    s = size
    pts = [
        (cx + s*0.08,  cy - s*0.50),
        (cx - s*0.12,  cy + s*0.04),
        (cx + s*0.04,  cy + s*0.04),
        (cx - s*0.08,  cy + s*0.50),
        (cx + s*0.18,  cy + s*0.02),
        (cx + s*0.04,  cy + s*0.02),
        (cx + s*0.22,  cy - s*0.50),
    ]
    d.polygon([(int(x), int(y)) for x, y in pts], fill=color)

def draw_robot(d, cx, cy, body_color, sz=1.0):
    """Robô geométrico desenhado com PIL."""
    ec = BG  # eye/detail color
    # antena
    d.line([(cx, cy - int(88*sz)), (cx, cy - int(72*sz))], fill=body_color, width=3)
    d.ellipse([cx-5, cy-int(96*sz), cx+5, cy-int(86*sz)], fill=body_color)
    # cabeça
    hw, hh = int(44*sz), int(34*sz)
    hx, hy = cx - hw//2, cy - int(72*sz)
    d.rounded_rectangle([hx, hy, hx+hw, hy+hh], radius=6, fill=body_color)
    # olhos
    ew = int(9*sz)
    d.rectangle([hx+7, hy+8, hx+7+ew, hy+8+ew], fill=ec)
    d.rectangle([hx+hw-7-ew, hy+8, hx+hw-7, hy+8+ew], fill=ec)
    # boca
    d.line([(hx+10, hy+hh-8), (hx+hw-10, hy+hh-8)], fill=ec, width=2)
    # corpo
    bw, bh = int(54*sz), int(46*sz)
    bx, by = cx - bw//2, cy - int(36*sz)
    d.rounded_rectangle([bx, by, bx+bw, by+bh], radius=5, fill=body_color)
    # luz no peito
    d.ellipse([cx-6, by+8, cx+6, by+20], fill=ec)
    # braços
    aw, ah = int(11*sz), int(28*sz)
    d.rounded_rectangle([bx-aw-3, by+5, bx-3, by+5+ah], radius=4, fill=body_color)
    d.rounded_rectangle([bx+bw+3, by+5, bx+bw+3+aw, by+5+ah], radius=4, fill=body_color)
    # pernas
    lw, lh = int(17*sz), int(26*sz)
    d.rounded_rectangle([cx-lw-4, by+bh+1, cx-4, by+bh+1+lh], radius=4, fill=body_color)
    d.rounded_rectangle([cx+4, by+bh+1, cx+4+lw, by+bh+1+lh], radius=4, fill=body_color)

def draw_terminal_frame(d, x, y, w, h):
    d.rounded_rectangle([x, y, x+w, y+h], radius=6, fill=(22, 27, 34), outline=(48, 54, 61), width=1)
    d.rounded_rectangle([x, y, x+w, y+20], radius=6, fill=(33, 38, 45))
    d.rectangle([x, y+14, x+w, y+20], fill=(33, 38, 45))
    for i, c in enumerate([C["red"], C["yellow"], C["green"]]):
        d.ellipse([x+10+i*16, y+5, x+18+i*16, y+13], fill=c)

# ── Cena 1: PROBLEMA — países reais ──────────────────────────────────────────

EVENTS = [
    ("Russia,    2022", "Visa & Mastercard left overnight. 140M people cut off."),
    ("Nigeria,   2021", "CBN banned crypto banking. Accounts frozen without notice."),
    ("Lebanon,   2019", "Banks locked everyone out. No withdrawals allowed."),
    ("Venezuela",       "PayPal blocked. Stripe never came. 1,000,000% inflation."),
    ("Argentina",       "Capital controls. Can't send $1 abroad."),
]

def scene_problem():
    frames = []
    # Aparece um país por vez
    for n in range(1, len(EVENTS) + 1):
        fi, d = img()
        d.text((PAD, 18), "Traditional finance fails billions.", fill=C["dim"], font=F_SMALL)
        y = 50
        for i, (country, desc) in enumerate(EVENTS[:n]):
            cx_lock = PAD - 28
            draw_lock(d, cx_lock, y + 2, C["red"], size=20)
            d.text((PAD, y), country, fill=C["red"], font=F_BIG)
            d.text((PAD + 230, y + 4), desc, fill=C["dim"], font=F_MED)
            y += F_BIG.size + 14
        ms = 1800 if n == len(EVENTS) else 900
        frames.append((fi, ms))

    # Frame final: "l402-kit works in all of them."
    fi, d = img()
    d.text((PAD, 18), "Traditional finance fails billions.", fill=C["dim"], font=F_SMALL)
    y = 50
    for country, desc in EVENTS:
        cx_lock = PAD - 28
        draw_lock(d, cx_lock, y + 2, C["dim"], size=20)
        d.text((PAD, y), country, fill=blend_color(C["red"], 0.4), font=F_BIG)
        d.text((PAD + 230, y + 4), desc, fill=blend_color(C["dim"], 0.5), font=F_MED)
        y += F_BIG.size + 14
    sol = "l402-kit works in all of them."
    center(d, y + 10, sol, C["green"], F_BIG)
    frames.append((fi, 2500))
    return frames

# ── Cena 2: SOLUCAO ───────────────────────────────────────────────────────────

def scene_solution():
    fi, d = img()
    # raio grande atrás (fantasma)
    draw_lightning(d, W//2, H//2 + 10, blend_color(C["yellow"], 0.08), size=220)
    y = 70
    y = center(d, y, "l402-kit", C["yellow"], F_HUGE)
    y += 6
    y = center(d, y, "Pay-per-call APIs with Bitcoin Lightning.", C["fg"], F_BIG)
    y += 10
    center(d, y, "Zero KYC.  Zero account.  Works in 180+ countries.", C["dim"], F_MED)
    return [(fi, 3500)]

# ── Cena 3: SERVER code ───────────────────────────────────────────────────────

CODE_SERVER = [
    ("from l402kit import l402_required",   C["blue"],   F_CODE),
    ("",                                     C["fg"],     F_CODE),
    ("@app.get(\"/premium\")",               C["green"],  F_CODE),
    ("@l402_required(price_sats=10)",        C["yellow"], F_CODE),
    ("async def premium(request):",          C["fg"],     F_CODE),
    ("    return {\"data\": \"premium\"}",   C["fg"],     F_CODE),
]

def draw_code_frame(drawn_lines, title, n_lines):
    fi, d = img()
    fw = W - PAD * 2
    fh = n_lines * 22 + 48
    fy = (H - fh) // 2
    draw_terminal_frame(d, PAD, fy, fw, fh)
    d.text((PAD + 56, fy + 5), title, fill=C["dim"], font=F_SMALL)
    x, y = PAD + 14, fy + 26
    lh = F_CODE.size + 8
    for text, color, f in drawn_lines:
        d.text((x, y), text, fill=color, font=f)
        y += lh
    return fi

def scene_server():
    frames = []
    drawn = []
    step = 4
    n = len(CODE_SERVER)
    for line_text, color, f in CODE_SERVER:
        if not line_text.strip():
            drawn.append((line_text, color, f))
            frames.append((draw_code_frame(drawn, "server.py", n), 80))
            continue
        indices = list(range(step, len(line_text), step)) + [len(line_text)]
        for ci in indices:
            partial = [(t if i < len(drawn) else line_text[:ci], c, ff)
                       for i, (t, c, ff) in enumerate(drawn + [(line_text, color, f)])]
            frames.append((draw_code_frame(partial, "server.py", n), step * 28))
        drawn.append((line_text, color, f))
    frames.append((draw_code_frame(drawn, "server.py", n), 2500))
    return frames

# ── Cena 4: CLIENT code ───────────────────────────────────────────────────────

CODE_CLIENT = [
    ("from l402kit import L402Client",           C["blue"],   F_CODE),
    ("",                                          C["fg"],     F_CODE),
    ("client = L402Client(wallet=your_wallet)",  C["fg"],     F_CODE),
    ("",                                          C["fg"],     F_CODE),
    ("# one line — pays automatically",           C["green"],  F_CODE),
    ("data = client.get(url).json()",             C["fg"],     F_CODE),
]

def scene_client():
    frames = []
    drawn = []
    step = 4
    n = len(CODE_CLIENT)
    for line_text, color, f in CODE_CLIENT:
        if not line_text.strip():
            drawn.append((line_text, color, f))
            frames.append((draw_code_frame(drawn, "client.py", n), 80))
            continue
        indices = list(range(step, len(line_text), step)) + [len(line_text)]
        for ci in indices:
            partial = [(t if i < len(drawn) else line_text[:ci], c, ff)
                       for i, (t, c, ff) in enumerate(drawn + [(line_text, color, f)])]
            frames.append((draw_code_frame(partial, "client.py", n), step * 28))
        drawn.append((line_text, color, f))
    frames.append((draw_code_frame(drawn, "client.py", n), 2500))
    return frames

# ── Cena 5: ANY WALLET ────────────────────────────────────────────────────────

def scene_wallets():
    fi, d = img()
    y = 60
    y = center(d, y, "Any wallet. Any provider. Your rules.", C["yellow"], F_BIG)
    y += 22
    wallets = [
        ("Blink",     C["green"]),
        ("Alby",      C["blue"]),
        ("LNbits",    C["orange"]),
        ("OpenNode",  C["purple"]),
        ("Your node", C["fg"]),
    ]
    col_w = (W - PAD * 2) // len(wallets)
    for i, (name, color) in enumerate(wallets):
        cx = PAD + col_w * i + col_w // 2
        draw_lightning(d, cx, y + 28, color, size=34)
        tw = cw(name, F_MED)
        d.text((cx - tw//2, y + 74), name, fill=color, font=F_MED)
    y += 112
    center(d, y, "0% platform fee. Payments go straight to your wallet.", C["dim"], F_MED)
    return [(fi, 3500)]

# ── Cena 6: AGENT ECONOMY ─────────────────────────────────────────────────────

def scene_agents():
    frames = []

    def render(arrow_pct=0.0, label=""):
        fi, d = img()
        title = "Agents paying agents."
        d.text(((W - cw(title, F_BIG)) // 2, 20), title, fill=C["yellow"], font=F_BIG)
        sub = "No human. No bank. Pure Bitcoin."
        d.text(((W - cw(sub, F_MED)) // 2, 58), sub, fill=C["dim"], font=F_MED)

        robot_y  = H // 2 + 55
        ax, bx   = PAD + 90, W - PAD - 90

        draw_robot(d, ax, robot_y, C["green"])
        draw_robot(d, bx, robot_y, C["blue"])

        la = "AgentA  (seller)"
        lb = "AgentB  (buyer)"
        d.text((ax - cw(la, F_SMALL)//2, robot_y + 24), la, fill=C["green"], font=F_SMALL)
        d.text((bx - cw(lb, F_SMALL)//2, robot_y + 24), lb, fill=C["blue"],  font=F_SMALL)

        tag = "@l402_required(price_sats=5)"
        d.text((ax - cw(tag, F_SMALL)//2, robot_y + 42), tag, fill=C["dim"], font=F_SMALL)

        # seta animada
        mid_y   = robot_y - 95
        x_start = ax + 68
        x_end   = bx - 68
        x_cur   = int(x_start + (x_end - x_start) * arrow_pct)
        if x_cur > x_start:
            d.line([(x_start, mid_y), (x_cur, mid_y)], fill=C["yellow"], width=3)
        if arrow_pct >= 1.0:
            d.polygon([(x_end-8, mid_y-6), (x_end-8, mid_y+6), (x_end+2, mid_y)],
                      fill=C["yellow"])
        if label:
            mid_x = (x_start + x_end) // 2
            draw_lightning(d, mid_x - 34, mid_y - 20, C["yellow"], size=20)
            lw = cw(label, F_MED)
            d.text((mid_x - lw//2, mid_y - 30), label, fill=C["yellow"], font=F_MED)

        return fi

    steps = 12
    for k in range(steps + 1):
        pct   = k / steps
        label = "5 sats" if pct >= 1.0 else ""
        frames.append((render(pct, label), 90))

    frames.append((render(1.0, "5 sats"), 4000))
    return frames

# ── Cena 7: PAYMENT FLOW ──────────────────────────────────────────────────────

def scene_flow():
    steps_data = [
        ("agent calls  GET /premium",                COLORS_flow := C["dim"]),
        ("<- 402  Payment Required",                  C["yellow"]),
        ("   wallet pays 1 sat via Lightning",        C["dim"]),
        ("agent retries  + L402 token",               C["dim"]),
        ("<- 200 OK  — autonomous, global, instant",  C["green"]),
    ]
    frames = []
    for n in range(1, len(steps_data) + 1):
        fi, d = img()
        draw_lightning(d, W - 70, H//2 - 10, blend_color(C["yellow"], 0.07), size=100)
        y = 100
        for text, color in steps_data[:n]:
            d.text(((W - cw(text, F_MED)) // 2, y), text, fill=color, font=F_MED)
            y += F_MED.size + 22
        ms = 2500 if n == len(steps_data) else 700
        frames.append((fi, ms))
    return frames

# ── Cena 8: FECHAMENTO ────────────────────────────────────────────────────────

def scene_close():
    fi, d = img()
    # Bitcoin ₿ grande fantasma
    try:
        bf = font(130)
        sym = "₿"
        tw = cw(sym, bf)
        d.text(((W - tw) // 2, H//2 - 85), sym, fill=blend_color(C["yellow"], 0.07), font=bf)
    except Exception:
        pass
    y = 70
    y = center(d, y, "No bank. No KYC. No Stripe.", C["fg"], F_BIG)
    y = center(d, y, "Pure Bitcoin. Pure Lightning.", C["yellow"], F_BIG)
    y += 18
    y = center(d, y, "Works where traditional finance doesn't.", C["dim"], F_MED)
    y += 24
    y = center(d, y, "pip install l402kit    npm install l402-kit", C["green"], F_MED)
    center(d, y, "l402kit.com", C["dim"], F_MED)
    return [(fi, 5000)]

# ── Montar GIF ────────────────────────────────────────────────────────────────

all_frames = []

scenes = [
    scene_problem(),
    scene_solution(),
    scene_server(),
    scene_client(),
    scene_wallets(),
    scene_agents(),
    scene_flow(),
    scene_close(),
]

for si, scene in enumerate(scenes):
    if si > 0:
        prev = all_frames[-1][0].convert("RGB")
        nxt  = scene[0][0].convert("RGB")
        all_frames += fade(prev, nxt, steps=5)
    all_frames += scene

frames    = [f.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=80) for f, _ in all_frames]
durations = [d for _, d in all_frames]

out = "docs/demo.gif"
frames[0].save(out, save_all=True, append_images=frames[1:],
               duration=durations, loop=0, optimize=True)

total_s = sum(durations) / 1000
print(f"Saved {out}  ({os.path.getsize(out)//1024} KB)  {len(frames)} frames  ~{total_s:.0f}s")
