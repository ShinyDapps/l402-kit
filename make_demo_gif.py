from PIL import Image, ImageDraw, ImageFont
import os, math

W, H = 800, 500
ACTBAR_W = 48
SIDEBAR_W = 320
EDITOR_X = ACTBAR_W + SIDEBAR_W

def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

C = {
    "bg":        rgb("1e1e1e"),
    "sidebar":   rgb("252526"),
    "actbar":    rgb("333333"),
    "titlebar":  rgb("323233"),
    "statusbar": rgb("007acc"),
    "text":      rgb("d4d4d4"),
    "muted":     rgb("6e6e6e"),
    "sep":       rgb("3c3c3c"),
    "orange":    rgb("f7931a"),
    "green":     rgb("4ec9b0"),
    "violet":    rgb("b89dff"),
    "blue":      rgb("569cd6"),
    "highlight": rgb("094771"),
    "toast_bg":  rgb("252526"),
    "toast_bdr": rgb("f7931a"),
    "red":       rgb("f44747"),
    "input_bg":  rgb("3c3c3c"),
}

FONT_DIR = "C:/Windows/Fonts"
def F(name, size):
    for p in [f"{FONT_DIR}/{name}", f"{FONT_DIR}/{name.lower()}"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

fS  = F("segoeui.ttf",  10)
fM  = F("segoeui.ttf",  12)
fL  = F("segoeui.ttf",  15)
fXL = F("segoeui.ttf",  28)
fB  = F("segoeuib.ttf", 13)
fMono = F("consola.ttf", 11)
fMonoM = F("consola.ttf", 13)

PAYMENTS = [
    ("/api/verity/search",     "500 sats",  "just now"),
    ("/api/verity/btc-price",  "100 sats",  "12s ago"),
    ("/api/verity/summarize",  "500 sats",  "1m ago"),
    ("/api/verity/sentiment",  "300 sats",  "2m ago"),
    ("/api/verity/scrape",     "500 sats",  "4m ago"),
    ("/api/verity/translate",  "500 sats",  "7m ago"),
]

CHART_VALS  = [1200, 3400, 2800, 5600, 4100, 8700, 12430]
CHART_DAYS  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

def draw_bolt(d, cx, cy, size=10, color=None):
    color = color or C["orange"]
    s = size / 10
    bolt = [
        (cx - 5*s, cy - 10*s), (cx + 3*s, cy - 10*s),
        (cx - 1*s, cy),         (cx + 6*s, cy),
        (cx - 3*s, cy + 10*s), (cx + 1*s, cy + 1*s),
        (cx - 6*s, cy + 1*s),
    ]
    d.polygon([(int(x), int(y)) for x, y in bolt], fill=color)

def bar_chart(d, x, y, w, h, vals, highlight_last=False):
    n = len(vals)
    bw = max(2, (w - (n-1)*4) // n)
    mx = max(vals) or 1
    for i, v in enumerate(vals):
        bh = max(2, int(v / mx * h))
        bx = x + i*(bw+4)
        color = C["orange"] if (highlight_last and i == n-1) else rgb("5a4020")
        d.rectangle([bx, y+h-bh, bx+bw, y+h], fill=color)
    return bw

def base_frame():
    img = Image.new("RGB", (W, H), C["bg"])
    d = ImageDraw.Draw(img)
    # title bar
    d.rectangle([0, 0, W, 28], fill=C["titlebar"])
    d.text((W//2, 14), "VS Code  —  l402-api (workspace)", fill=C["muted"], font=fS, anchor="mm")
    # activity bar
    d.rectangle([0, 28, ACTBAR_W, H-22], fill=C["actbar"])
    draw_bolt(d, ACTBAR_W//2, 65, size=12)
    d.rectangle([0, 44, 3, 88], fill=C["orange"])
    # sidebar bg
    d.rectangle([ACTBAR_W, 28, EDITOR_X, H-22], fill=C["sidebar"])
    d.line([EDITOR_X, 28, EDITOR_X, H-22], fill=C["sep"])
    # editor code lines (faint)
    code_lines = [
        (rgb("569cd6"), 140), (rgb("4ec9b0"), 220), (rgb("d4d4d4"), 180),
        (rgb("6e6e6e"), 260), (rgb("ce9178"), 150), (rgb("d4d4d4"), 200),
        (rgb("6e6e6e"), 80),  (rgb("4ec9b0"), 240), (rgb("d4d4d4"), 160),
        (rgb("569cd6"), 130), (rgb("ce9178"), 190), (rgb("d4d4d4"), 170),
        (rgb("6e6e6e"), 220), (rgb("4ec9b0"), 145),
    ]
    ey = 50
    for clr, w2 in code_lines:
        d.rectangle([EDITOR_X+44, ey, EDITOR_X+44+w2, ey+7], fill=clr)
        ey += 23
    # line numbers
    for i in range(14):
        d.text((EDITOR_X+8, 50+i*23), str(i+1), fill=C["muted"], font=fMono)
    # status bar
    d.rectangle([0, H-22, W, H], fill=C["statusbar"])
    d.text((12, H-13), "● main", fill=rgb("ffffff"), font=fS, anchor="lm")
    return img, d

def sidebar_content(d, total_sats, today_sats, pulse_row=None, growing=False, usd_per_sat=0.00065):
    sx = ACTBAR_W + 10
    sy = 34

    # header
    d.text((sx, sy), "SHINYDAPPS  —  LIGHTNING PAYMENTS", fill=C["muted"], font=fS)
    sy += 20

    # total sats (big number)
    d.text((sx, sy), "Total received", fill=C["muted"], font=fS)
    sy += 14
    total_str = f"{total_sats:,} sats"
    d.text((sx, sy), total_str, fill=C["orange"], font=fXL)
    usd = total_sats * usd_per_sat
    d.text((sx+4, sy+32), f"≈ ${usd:,.2f} USD", fill=C["muted"], font=fS)
    if growing:
        d.text((sx+200, sy+10), "▲ LIVE", fill=C["green"], font=fS)
    sy += 52

    # today / top endpoint
    d.text((sx, sy), "Today", fill=C["muted"], font=fS)
    d.text((sx+100, sy), "Top endpoint", fill=C["muted"], font=fS)
    sy += 13
    d.text((sx, sy), f"{today_sats:,} sats", fill=C["text"], font=fM)
    d.text((sx+100, sy), "/api/verity/search", fill=C["green"], font=fMono)
    sy += 22

    # separator
    d.line([ACTBAR_W+8, sy, EDITOR_X-8, sy], fill=C["sep"])
    sy += 7

    # chart
    d.text((sx, sy), "7-day revenue (sats)", fill=C["muted"], font=fS)
    sy += 13
    chart_h = 58
    chart_w = SIDEBAR_W - 20
    bw = bar_chart(d, sx, sy, chart_w, chart_h, CHART_VALS, highlight_last=True)
    for i, lbl in enumerate(CHART_DAYS):
        dx = sx + i*(bw+4) + bw//2
        d.text((dx, sy+chart_h+2), lbl, fill=C["muted"], font=fS, anchor="mt")
    sy += chart_h + 18

    # separator
    d.line([ACTBAR_W+8, sy, EDITOR_X-8, sy], fill=C["sep"])
    sy += 7

    # payment history header
    d.text((sx, sy), "Recent payments", fill=C["muted"], font=fS)
    sy += 13

    for i, (ep, amt, ts) in enumerate(PAYMENTS[:5]):
        is_pulse = (pulse_row == i)
        if is_pulse:
            d.rectangle([ACTBAR_W+6, sy-2, EDITOR_X-6, sy+14], fill=C["highlight"])
        d.text((sx, sy), ep,    fill=C["green"],  font=fMono)
        d.text((sx+170, sy), amt,  fill=C["orange"], font=fS)
        d.text((sx+235, sy), ts,   fill=C["muted"],  font=fS)
        sy += 17

    return sy

def status_bar_sats(d, sats):
    d.text((130, H-13), f"⚡ {sats:,} sats today", fill=rgb("ffffff"), font=fS, anchor="lm")

def toast_notification(d, message="Payment received!", sub="500 sats · /api/verity/search", alpha=255):
    tx, ty = W - 310, H - 115
    tw, th = 295, 72
    # shadow
    d.rectangle([tx+3, ty+3, tx+tw+3, ty+th+3], fill=rgb("111111"))
    # bg
    d.rectangle([tx, ty, tx+tw, ty+th], fill=C["toast_bg"])
    d.rectangle([tx, ty, tx+3, ty+th], fill=C["toast_bdr"])
    d.rectangle([tx, ty, tx+tw, ty+1], fill=rgb("3a3a3a"))
    d.rectangle([tx, ty+th-1, tx+tw, ty+th], fill=rgb("3a3a3a"))
    # icon
    draw_bolt(d, tx+20, ty+36, size=9)
    # text
    d.text((tx+36, ty+14), message, fill=C["text"], font=fB)
    d.text((tx+36, ty+32), sub, fill=C["orange"], font=fS)
    d.text((tx+36, ty+46), "shinydapps-l402 · l402kit.com", fill=C["muted"], font=fS)
    # close x
    d.text((tx+tw-14, ty+8), "×", fill=C["muted"], font=fM)

# ── frame builders ────────────────────────────────────────────────────────────

def frame_idle(total=47832, today=12430):
    img, d = base_frame()
    sidebar_content(d, total, today)
    status_bar_sats(d, today)
    return img

def frame_pulse(total=47832, today=12430, pulse=0, growing=False):
    img, d = base_frame()
    sidebar_content(d, total, today, pulse_row=pulse, growing=growing)
    status_bar_sats(d, today)
    return img

def frame_toast(total=47832, today=12430, pulse=0):
    img, d = base_frame()
    sidebar_content(d, total, today, pulse_row=pulse)
    toast_notification(d, "Payment received!", "500 sats · /api/verity/search")
    status_bar_sats(d, today)
    return img

def frame_growing(step=0):
    base_sats = 47332
    steps_sats = [47432, 47532, 47632, 47732, 47832]
    today_base = 11930
    today_steps= [12030, 12130, 12230, 12330, 12430]
    s = min(step, 4)
    img, d = base_frame()
    sidebar_content(d, steps_sats[s], today_steps[s], pulse_row=0, growing=True)
    status_bar_sats(d, today_steps[s])
    return img

def frame_multilang(lang="EN"):
    LABELS = {
        "EN": ("Total received", "Today", "Recent payments", "just now", "12s ago"),
        "PT": ("Total recebido", "Hoje",  "Pagamentos recentes", "agora",   "12s atrás"),
        "ES": ("Total recibido", "Hoy",   "Pagos recientes",    "ahora",    "hace 12s"),
        "ZH": ("总收入",          "今日",   "最近付款",             "刚刚",      "12秒前"),
        "JA": ("総収益",          "本日",   "最近の支払い",          "今",        "12秒前"),
        "AR": ("إجمالي",         "اليوم",  "مدفوعات حديثة",       "الآن",      "منذ 12ث"),
    }
    lbl = LABELS.get(lang, LABELS["EN"])

    img, d = base_frame()
    sx = ACTBAR_W + 10
    sy = 34

    d.text((sx, sy), "SHINYDAPPS  —  LIGHTNING PAYMENTS", fill=C["muted"], font=fS)
    sy += 20

    # lang badge
    badge_x = EDITOR_X - 60
    d.rectangle([badge_x-4, sy-2, badge_x+38, sy+14], fill=C["highlight"])
    d.text((badge_x, sy), f"  {lang}", fill=C["violet"], font=fB)

    d.text((sx, sy), lbl[0], fill=C["muted"], font=fS)
    sy += 14
    d.text((sx, sy), "47,832 sats", fill=C["orange"], font=fXL)
    d.text((sx+4, sy+32), "≈ $31.09 USD", fill=C["muted"], font=fS)
    sy += 52

    d.text((sx, sy), lbl[1], fill=C["muted"], font=fS)
    sy += 13
    d.text((sx, sy), "12,430 sats", fill=C["text"], font=fM)
    sy += 22

    d.line([ACTBAR_W+8, sy, EDITOR_X-8, sy], fill=C["sep"])
    sy += 7

    chart_h = 58
    bw = bar_chart(d, sx, sy, SIDEBAR_W-20, chart_h, CHART_VALS, highlight_last=True)
    sy += chart_h + 22

    d.line([ACTBAR_W+8, sy, EDITOR_X-8, sy], fill=C["sep"])
    sy += 7

    d.text((sx, sy), lbl[2], fill=C["muted"], font=fS)
    sy += 13

    ts_now, ts_ago = lbl[3], lbl[4]
    rows = [
        ("/api/verity/search",    "500 sats", ts_now),
        ("/api/verity/btc-price", "100 sats", ts_ago),
        ("/api/verity/summarize", "500 sats", "1m"),
    ]
    for ep, amt, ts in rows:
        d.text((sx, sy), ep,    fill=C["green"],  font=fMono)
        d.text((sx+170, sy), amt,  fill=C["orange"], font=fS)
        d.text((sx+235, sy), ts,   fill=C["muted"],  font=fS)
        sy += 17

    status_bar_sats(d, 12430)
    return img

def frame_editor_highlight():
    """Show the editor side with L402 middleware code highlighted."""
    img, d = base_frame()
    sidebar_content(d, 47832, 12430)
    status_bar_sats(d, 12430)

    # Overlay code highlight in editor
    ex = EDITOR_X + 8
    code = [
        (rgb("6e6e6e"),  "1",  rgb("1e1e1e"),    ""),
        (rgb("569cd6"),  "2",  rgb("569cd6"),    "import"),
        (rgb("6e6e6e"),  "3",  rgb("1e1e1e"),    ""),
        (rgb("4ec9b0"),  "4",  rgb("4ec9b0"),    "app.get('/api/data', l402({"),
        (rgb("f7931a"),  "5",  rgb("f7931a"),    "  priceSats: 500,"),
        (rgb("ce9178"),  "6",  rgb("ce9178"),    "  lightning,"),
        (rgb("4ec9b0"),  "7",  rgb("4ec9b0"),    "}), handler);"),
        (rgb("6e6e6e"),  "8",  rgb("1e1e1e"),    ""),
    ]
    ey = 55
    for i, (lc, ln, tc, txt) in enumerate(code):
        if i in (3, 4, 5, 6):
            d.rectangle([ex+28, ey-2, ex+28+280, ey+13], fill=rgb("094771"))
        d.text((ex+2, ey), ln, fill=C["muted"], font=fMono)
        if txt:
            d.text((ex+30, ey), txt, fill=tc, font=fMono)
        ey += 22

    # Arrow from sidebar to editor
    mid_y = H // 2 - 30
    d.line([EDITOR_X-2, mid_y, EDITOR_X+30, mid_y], fill=C["orange"], width=2)
    d.polygon([(EDITOR_X+30, mid_y-5), (EDITOR_X+30, mid_y+5), (EDITOR_X+40, mid_y)], fill=C["orange"])

    return img

# ── sequence ──────────────────────────────────────────────────────────────────
frames = []
durations = []

def add(img, ms):
    frames.append(img)
    durations.append(ms)

def adds(fn, ms, n, **kw):
    img = fn(**kw) if kw else fn()
    for _ in range(n):
        add(img, ms)

# Scene 1 — dashboard idle (2s)
adds(frame_idle, 500, 4)

# Scene 2 — payment arrives: counter ticks up live (2s)
for step in range(5):
    add(frame_growing(step=step), 300)

# Scene 3 — pulse highlight + toast (2.5s)
for _ in range(3):
    add(frame_toast(total=47832, today=12430, pulse=0), 200)
    add(frame_pulse(total=47832, today=12430, pulse=0), 200)
add(frame_toast(total=47832, today=12430, pulse=0), 900)

# Scene 4 — dashboard settled (1s)
adds(frame_idle, 400, 3)

# Scene 5 — editor code highlight (1.5s)
adds(frame_editor_highlight, 500, 3)

# Scene 6 — back to dashboard (0.5s)
adds(frame_idle, 300, 2)

# Scene 7 — language tour (6s total)
for lang in ["EN", "PT", "ES", "ZH", "JA", "AR", "EN"]:
    hold = 1200 if lang == "EN" else 900
    adds(frame_multilang, hold, 1, lang=lang)

# Scene 8 — final dashboard hold (2s)
adds(frame_idle, 500, 4)

print(f"Frames: {len(frames)}, duration: {sum(durations)/1000:.1f}s")

out = r"C:\Users\thiag\l402-kit\vscode-extension\docs\demo.gif"
frames[0].save(
    out,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    optimize=True,
)
print(f"Saved: {out}")
