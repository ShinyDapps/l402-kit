"""
Generate animated flow GIF for l402-kit README.
No emoji — uses text + shapes. Works with any Windows font.
Run: python make_flow_gif.py
Outputs: docs/flow-en.gif, docs/flow-pt.gif
"""

from PIL import Image, ImageDraw, ImageFont
import os

W, H    = 820, 340
BG      = (8,   8,   8)
CARD    = (20,  20,  20)
BORDER  = (35,  35,  35)
ORANGE  = (247, 147, 26)
GREEN   = (34,  197, 94)
BLUE    = (96,  165, 250)
TEXT    = (229, 229, 229)
MUTED   = (110, 110, 110)
WHITE   = (255, 255, 255)

def _font(name, size):
    if os.path.exists(name):
        try: return ImageFont.truetype(name, size)
        except: pass
    return None

def load_font(size):
    for n in ["segoeuib.ttf","segoeui.ttf","arialbd.ttf","arial.ttf","calibrib.ttf","calibri.ttf"]:
        f = _font(f"C:/Windows/Fonts/{n}", size)
        if f: return f
    return ImageFont.load_default()

FB  = load_font(15)   # bold big
FM  = load_font(13)   # medium
FS  = load_font(11)   # small
FXS = load_font(10)   # tiny
FT  = load_font(18)   # title

# ── Layout constants ─────────────────────────────────────────────────────────
STEPS_N   = 5
STEP_W    = 128
STEP_H    = 88
STEP_GAP  = 12
TOP_Y     = 44
TOTAL_W   = STEPS_N * STEP_W + (STEPS_N - 1) * STEP_GAP
START_X   = (W - TOTAL_W) // 2

SPLIT_Y   = TOP_Y + STEP_H + 56
SPLIT_H   = 60
SPLIT_W   = 200
SPLIT_GAP = 28
SPLIT_X   = (W - 2*SPLIT_W - SPLIT_GAP) // 2

EXT_Y  = SPLIT_Y + SPLIT_H + 18
EXT_H  = 44
EXT_W  = 400
EXT_X  = (W - EXT_W) // 2


def rrect(draw, x, y, w, h, r=10, fill=None, outline=None, lw=1):
    draw.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=fill, outline=outline, width=lw)


def arrow(draw, x1, y1, x2, y2, col, prog=1.0, lw=2):
    ex = x1 + (x2 - x1) * prog
    ey = y1 + (y2 - y1) * prog
    draw.line([(x1,y1),(ex,ey)], fill=col, width=lw)
    if prog >= 0.85 and x2 != x1:
        draw.polygon([(ex,ey),(ex-7,ey-4),(ex-7,ey+4)], fill=col)
    if prog >= 0.85 and y2 != y1:
        draw.polygon([(ex,ey),(ex-4,ey-7),(ex+4,ey-7)], fill=col)


def draw_frame(lang, active=-1, arr_prog=1.0, show_split=False,
               split_prog=0.0, show_ext=False):
    steps  = lang["steps"]
    splits = lang["splits"]

    img  = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # subtle grid
    for x in range(0, W, 40):
        draw.line([(x,0),(x,H)], fill=(14,14,14))
    for y in range(0, H, 40):
        draw.line([(0,y),(W,y)], fill=(14,14,14))

    # title
    draw.text((W//2, 18), lang["title"], font=FT, fill=ORANGE, anchor="mm")

    # ── Step cards ────────────────────────────────────────────────────────────
    for i, (icon, label, sub) in enumerate(steps):
        x = START_X + i*(STEP_W + STEP_GAP)
        y = TOP_Y
        done   = (i < active)
        active_ = (i == active)
        future = not done and not active_

        bg_c  = (28, 20, 8)  if active_ else ((14,22,14) if done else CARD)
        brd_c = ORANGE       if active_ else ((40,90,40) if done else BORDER)
        lw    = 2 if active_ else 1

        if active_:   # glow ring
            rrect(draw, x-3, y-3, STEP_W+6, STEP_H+6, 12, outline=(70,42,8), lw=2)

        rrect(draw, x, y, STEP_W, STEP_H, 10, fill=bg_c, outline=brd_c, lw=lw)

        num_c = ORANGE if active_ else (GREEN if done else MUTED)
        draw.text((x+8, y+7), str(i+1), font=FXS, fill=num_c)

        # icon text (number/letter code, no emoji)
        ic_c  = ORANGE if active_ else (GREEN if done else MUTED)
        draw.text((x+STEP_W//2, y+28), icon, font=FB, fill=ic_c, anchor="mm")

        lbl_c = WHITE if active_ else (TEXT if done else MUTED)
        draw.text((x+STEP_W//2, y+54), label, font=FM, fill=lbl_c, anchor="mm")
        draw.text((x+STEP_W//2, y+70), sub, font=FXS, fill=MUTED, anchor="mm")

        if done:
            draw.text((x+STEP_W-10, y+7), "OK", font=FXS, fill=GREEN)

    # ── Arrows between steps ──────────────────────────────────────────────────
    for i in range(STEPS_N - 1):
        x1 = START_X + i*(STEP_W+STEP_GAP) + STEP_W + 1
        x2 = START_X + (i+1)*(STEP_W+STEP_GAP) - 1
        ym = TOP_Y + STEP_H//2
        if i < active - 1:
            arrow(draw, x1, ym, x2, ym, GREEN)
        elif i == active - 1:
            arrow(draw, x1, ym, x2, ym, ORANGE, arr_prog)
        elif active < 0 or i >= active:
            arrow(draw, x1, ym, x2, ym, BORDER, 1.0)

    # ── Split section ─────────────────────────────────────────────────────────
    if show_split:
        last_x = START_X + (STEPS_N-1)*(STEP_W+STEP_GAP) + STEP_W//2
        y_top  = TOP_Y + STEP_H
        y_bot  = SPLIT_Y
        dp     = min(split_prog * 2.0, 1.0)
        arrow(draw, last_x, y_top, last_x, y_bot, ORANGE, dp, lw=2)

        if split_prog > 0.5:
            sp = min((split_prog - 0.5)*2.0, 1.0)
            for j, (pct, label, note, col) in enumerate(splits):
                sx = SPLIT_X + j*(SPLIT_W + SPLIT_GAP)
                sc = sx + SPLIT_W//2
                # branch line
                hp = min(sp*1.4, 1.0)
                ex = last_x + (sc - last_x)*hp
                draw.line([(last_x, SPLIT_Y-2),(ex, SPLIT_Y-2)], fill=col, width=2)
                if hp >= 0.99:
                    draw.polygon([(sc, SPLIT_Y-2),(sc-4,SPLIT_Y-9),(sc+4,SPLIT_Y-9)], fill=col)
                    bg2 = (14,22,14) if col==GREEN else (22,16,8)
                    rrect(draw, sx, SPLIT_Y, SPLIT_W, SPLIT_H, 10, fill=bg2, outline=col, lw=2)
                    draw.text((sc, SPLIT_Y+16), pct,   font=FT, fill=col,  anchor="mm")
                    draw.text((sc, SPLIT_Y+34), label, font=FM, fill=TEXT, anchor="mm")
                    draw.text((sc, SPLIT_Y+50), note,  font=FXS,fill=MUTED,anchor="mm")

    # ── VS Code extension badge ───────────────────────────────────────────────
    if show_ext:
        rrect(draw, EXT_X, EXT_Y, EXT_W, EXT_H, 10,
              fill=(10,12,28), outline=BLUE, lw=2)
        draw.ellipse([EXT_X+14,EXT_Y+EXT_H//2-5,EXT_X+24,EXT_Y+EXT_H//2+5], fill=BLUE)
        draw.text((EXT_X+EXT_W//2, EXT_Y+15), lang["ext1"],
                  font=FM, fill=TEXT, anchor="mm")
        draw.text((EXT_X+EXT_W//2, EXT_Y+31), lang["ext2"],
                  font=FS, fill=BLUE, anchor="mm")

    return img


# ── Language definitions ──────────────────────────────────────────────────────
LANGS = {
    "en": dict(
        title="Payment Flow — l402-kit",
        steps=[
            ("[ API ]",  "Your API",     "endpoint /premium"),
            ("[l402]",   "l402-kit",     "middleware"),
            ("[402]",    "HTTP 402",     "invoice + macaroon"),
            ("[$  ]",    "Client pays",  "< 1 second"),
            ("[ OK]",    "Verified",     "SHA256 proof"),
        ],
        splits=[
            ("99.7%", "→ Lightning Address", "(instant)", GREEN),
            (" 0.3%", "→ ShinyDapps",        "(fee)",     ORANGE),
        ],
        ext1="VS Code Extension  —  payment recorded here",
        ext2="▲  YOU ARE HERE",
    ),
    "pt": dict(
        title="Fluxo de Pagamento — l402-kit",
        steps=[
            ("[ API ]",  "Sua API",        "endpoint /premium"),
            ("[l402]",   "l402-kit",       "middleware"),
            ("[402]",    "HTTP 402",       "fatura + macaroon"),
            ("[$  ]",    "Cliente paga",   "< 1 segundo"),
            ("[ OK]",    "Verificado",     "prova SHA256"),
        ],
        splits=[
            ("99,7%", "→ Lightning Address", "(instantâneo)", GREEN),
            (" 0,3%", "→ ShinyDapps",        "(taxa)",        ORANGE),
        ],
        ext1="Extensão VS Code  —  pagamento registrado aqui",
        ext2="▲  VOCE ESTA AQUI",
    ),
    "es": dict(
        title="Flujo de Pago — l402-kit",
        steps=[
            ("[ API ]",  "Tu API",         "endpoint /premium"),
            ("[l402]",   "l402-kit",       "middleware"),
            ("[402]",    "HTTP 402",       "factura + macaroon"),
            ("[$  ]",    "Cliente paga",   "< 1 segundo"),
            ("[ OK]",    "Verificado",     "prueba SHA256"),
        ],
        splits=[
            ("99.7%", "→ Lightning Address", "(instantáneo)", GREEN),
            (" 0.3%", "→ ShinyDapps",        "(comisión)",    ORANGE),
        ],
        ext1="Extension VS Code  —  pago registrado aqui",
        ext2="▲  ESTAS AQUI",
    ),
    "de": dict(
        title="Zahlungsfluss — l402-kit",
        steps=[
            ("[ API ]",  "Deine API",      "Endpunkt /premium"),
            ("[l402]",   "l402-kit",       "Middleware"),
            ("[402]",    "HTTP 402",       "Rechnung + Macaroon"),
            ("[$  ]",    "Kunde zahlt",    "< 1 Sekunde"),
            ("[ OK]",    "Verifiziert",    "SHA256-Beweis"),
        ],
        splits=[
            ("99.7%", "→ Lightning Address", "(sofort)", GREEN),
            (" 0.3%", "→ ShinyDapps",        "(Gebühr)", ORANGE),
        ],
        ext1="VS Code Erweiterung  —  Zahlung hier erfasst",
        ext2="▲  DU BIST HIER",
    ),
    "fr": dict(
        title="Flux de Paiement — l402-kit",
        steps=[
            ("[ API ]",  "Votre API",      "endpoint /premium"),
            ("[l402]",   "l402-kit",       "middleware"),
            ("[402]",    "HTTP 402",       "facture + macaroon"),
            ("[$  ]",    "Client paie",    "< 1 seconde"),
            ("[ OK]",    "Vérifié",        "preuve SHA256"),
        ],
        splits=[
            ("99.7%", "→ Lightning Address", "(instantané)", GREEN),
            (" 0.3%", "→ ShinyDapps",        "(frais)",      ORANGE),
        ],
        ext1="Extension VS Code  —  paiement enregistré ici",
        ext2="▲  VOUS ETES ICI",
    ),
    "it": dict(
        title="Flusso di Pagamento — l402-kit",
        steps=[
            ("[ API ]",  "La tua API",     "endpoint /premium"),
            ("[l402]",   "l402-kit",       "middleware"),
            ("[402]",    "HTTP 402",       "fattura + macaroon"),
            ("[$  ]",    "Cliente paga",   "< 1 secondo"),
            ("[ OK]",    "Verificato",     "prova SHA256"),
        ],
        splits=[
            ("99.7%", "→ Lightning Address", "(istantaneo)", GREEN),
            (" 0.3%", "→ ShinyDapps",        "(commissione)",ORANGE),
        ],
        ext1="Estensione VS Code  —  pagamento registrato qui",
        ext2="▲  SEI QUI",
    ),
    "ru": dict(
        title="Poток Platezha — l402-kit",
        steps=[
            ("[ API ]",  "Vash API",       "endpoint /premium"),
            ("[l402]",   "l402-kit",       "middleware"),
            ("[402]",    "HTTP 402",       "schet + macaroon"),
            ("[$  ]",    "Klient platit",  "< 1 sek"),
            ("[ OK]",    "Provereno",      "SHA256 dokaz"),
        ],
        splits=[
            ("99.7%", "→ Lightning Address", "(mgnovenno)", GREEN),
            (" 0.3%", "→ ShinyDapps",        "(komissija)",  ORANGE),
        ],
        ext1="Rasshireniye VS Code  —  platezh zapisano zdes",
        ext2="▲  VY ZDES",
    ),
    "zh": dict(
        title="Zhifu Liucheng — l402-kit",
        steps=[
            ("[ API ]",  "Nin de API",     "jiedian /premium"),
            ("[l402]",   "l402-kit",       "zhongjianjian"),
            ("[402]",    "HTTP 402",       "fapiao + macaroon"),
            ("[$  ]",    "Kehu zhifu",     "< 1 miao"),
            ("[ OK]",    "Yi yanzheng",    "SHA256 zhengming"),
        ],
        splits=[
            ("99.7%", "→ Lightning Address", "(jishi)", GREEN),
            (" 0.3%", "→ ShinyDapps",        "(fei)",   ORANGE),
        ],
        ext1="VS Code Chajianjian  —  zhifu yijilu",
        ext2="▲  NIN ZAI ZHELI",
    ),
    "ja": dict(
        title="Shiharai Nagare — l402-kit",
        steps=[
            ("[ API ]",  "Anata no API",   "endo /premium"),
            ("[l402]",   "l402-kit",       "midoruuea"),
            ("[402]",    "HTTP 402",       "seikyuu + macaroon"),
            ("[$  ]",    "Kyaku ga harau", "< 1 byou"),
            ("[ OK]",    "Kakunin zumi",   "SHA256 shomei"),
        ],
        splits=[
            ("99.7%", "→ Lightning Address", "(sokujitsu)", GREEN),
            (" 0.3%", "→ ShinyDapps",        "(tesuuryou)", ORANGE),
        ],
        ext1="VS Code Kakuchouiki  —  shiharai kiroku",
        ext2="▲  ANATA WA KOKO",
    ),
    "hi": dict(
        title="Bhugtan Pravah — l402-kit",
        steps=[
            ("[ API ]",  "Aapki API",      "endpoint /premium"),
            ("[l402]",   "l402-kit",       "middleware"),
            ("[402]",    "HTTP 402",       "chalan + macaroon"),
            ("[$  ]",    "Grahak bhugtan", "< 1 second"),
            ("[ OK]",    "Satapit",        "SHA256 pramaan"),
        ],
        splits=[
            ("99.7%", "→ Lightning Address", "(tatkal)", GREEN),
            (" 0.3%", "→ ShinyDapps",        "(shulk)",  ORANGE),
        ],
        ext1="VS Code Extension  —  bhugtan yahan record hua",
        ext2="▲  AAP YAHAN HAIN",
    ),
    "ar": dict(
        title="Tanfidh al-Dafa — l402-kit",
        steps=[
            ("[ API ]",  "API-ka",         "nuqtat nihaya"),
            ("[l402]",   "l402-kit",       "wasit barmaghi"),
            ("[402]",    "HTTP 402",       "fattura + macaroon"),
            ("[$  ]",    "Yudfa alail",    "< thaaniya 1"),
            ("[ OK]",    "Mutahhaqaq",     "SHA256 ithbat"),
        ],
        splits=[
            ("99.7%", "→ Lightning Address", "(fawri)", GREEN),
            (" 0.3%", "→ ShinyDapps",        "(rasoom)", ORANGE),
        ],
        ext1="Imtidat VS Code  —  al-dafa musajjal huna",
        ext2="▲  ANTA HUNA",
    ),
}


def build_gif(lang_key, lang):
    frames, durations = [], []

    def add(img, ms=80):
        frames.append(img); durations.append(ms)

    def still(img, ms):
        for _ in range(ms // 80):
            add(img, 80)

    # Intro
    still(draw_frame(lang, -1), 500)

    # Steps
    for step in range(STEPS_N):
        if step > 0:
            for p in [0.25, 0.6, 0.9, 1.0]:
                add(draw_frame(lang, step, arr_prog=p), 55)
        still(draw_frame(lang, step, arr_prog=1.0), 480)

    # Pause before split
    still(draw_frame(lang, STEPS_N-1, arr_prog=1.0), 300)

    # Split reveal
    for p in [0.1,0.25,0.4,0.6,0.75,0.9,1.0]:
        add(draw_frame(lang, STEPS_N-1, arr_prog=1.0, show_split=True, split_prog=p), 65)
    still(draw_frame(lang, STEPS_N-1, arr_prog=1.0, show_split=True, split_prog=1.0), 600)

    # Extension blink
    for _ in range(3):
        add(draw_frame(lang, STEPS_N-1, arr_prog=1.0, show_split=True, split_prog=1.0, show_ext=True), 150)
        add(draw_frame(lang, STEPS_N-1, arr_prog=1.0, show_split=True, split_prog=1.0, show_ext=False), 80)

    still(draw_frame(lang, STEPS_N-1, arr_prog=1.0, show_split=True, split_prog=1.0, show_ext=True), 2000)

    os.makedirs("docs", exist_ok=True)
    out = f"docs/flow-{lang_key}.gif"
    frames[0].save(out, save_all=True, append_images=frames[1:],
                   optimize=False, loop=0, duration=durations)
    kb = os.path.getsize(out) // 1024
    print(f"[{lang_key}] {out}  {len(frames)} frames  {kb}KB")


for key, data in LANGS.items():
    build_gif(key, data)

print("Done.")
