from PIL import Image, ImageDraw, ImageFont
import os

# ── dimensions ──────────────────────────────────────────────────────────────
W, H = 720, 460
ACTBAR_W = 48
SIDEBAR_W = 310
EDITOR_X = ACTBAR_W + SIDEBAR_W

# ── colors ───────────────────────────────────────────────────────────────────
def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

C = {
    "bg":          rgb("1e1e1e"),
    "sidebar":     rgb("252526"),
    "actbar":      rgb("333333"),
    "titlebar":    rgb("323233"),
    "statusbar":   rgb("007acc"),
    "text":        rgb("d4d4d4"),
    "muted":       rgb("6e6e6e"),
    "sep":         rgb("3c3c3c"),
    "orange":      rgb("f7931a"),
    "green":       rgb("4ec9b0"),
    "blue":        rgb("569cd6"),
    "highlight":   rgb("094771"),
    "palette_bg":  rgb("2d2d2d"),
    "input_bg":    rgb("3c3c3c"),
    "hover":       rgb("2a2d2e"),

    # light theme
    "L_bg":        rgb("ffffff"),
    "L_sidebar":   rgb("f3f3f3"),
    "L_actbar":    rgb("2c2c2c"),
    "L_titlebar":  rgb("dddddd"),
    "L_text":      rgb("333333"),
    "L_muted":     rgb("888888"),
    "L_sep":       rgb("e0e0e0"),
}

# ── fonts ─────────────────────────────────────────────────────────────────────
FONT_DIR = "C:/Windows/Fonts"
def F(name, size):
    paths = [
        f"{FONT_DIR}/{name}",
        f"{FONT_DIR}/{name.lower()}",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

fUI_S  = F("segoeui.ttf",  11)
fUI_M  = F("segoeui.ttf",  13)
fUI_L  = F("segoeui.ttf",  16)
fUI_XL = F("segoeui.ttf",  26)
fMONO  = F("consola.ttf",  11)
fMONO_M = F("consola.ttf", 13)

# ── helpers ───────────────────────────────────────────────────────────────────
def base(theme="dark"):
    dark = theme == "dark"
    bg = C["bg"] if dark else C["L_bg"]
    sb = C["sidebar"] if dark else C["L_sidebar"]
    ab = C["actbar"] if dark else C["L_actbar"]
    tb = C["titlebar"] if dark else C["L_titlebar"]
    tx = C["text"] if dark else C["L_text"]
    mu = C["muted"] if dark else C["L_muted"]
    sp = C["sep"] if dark else C["L_sep"]

    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)

    # title bar
    d.rectangle([0, 0, W, 28], fill=tb)
    title_c = rgb("cccccc") if dark else rgb("444444")
    d.text((W//2, 14), "ShinyDapps — VS Code", fill=title_c, font=fUI_S, anchor="mm")

    # activity bar
    d.rectangle([0, 28, ACTBAR_W, H-22], fill=ab)

    # lightning bolt icon (active)
    cx = ACTBAR_W // 2
    bolt = [(cx-5,42),(cx+3,42),(cx-1,56),(cx+7,56),(cx-3,72),(cx+1,58),(cx-7,58)]
    d.polygon(bolt, fill=C["orange"])
    d.rectangle([0, 38, 3, 78], fill=C["orange"])

    # sidebar
    d.rectangle([ACTBAR_W, 28, EDITOR_X, H-22], fill=sb)

    # sidebar → editor divider
    d.line([EDITOR_X, 28, EDITOR_X, H-22], fill=sp)

    # editor area — faint code lines
    ey = 50
    for i in range(14):
        shade = rgb("2a2a2a") if dark else rgb("f0f0f0")
        w = [180, 220, 150, 260, 110, 200, 170, 240, 130, 190, 160, 215, 145, 205][i]
        d.rectangle([EDITOR_X + 30, ey, EDITOR_X + 30 + w, ey + 8], fill=shade)
        ey += 24

    # status bar
    d.rectangle([0, H-22, W, H], fill=C["statusbar"])
    d.text((12, H-16), "main", fill=rgb("ffffff"), font=fUI_S)

    return img, d, {"bg":bg,"sb":sb,"ab":ab,"tb":tb,"tx":tx,"mu":mu,"sp":sp,"dark":dark}

def bar_chart(d, x, y, w, h, vals, clr, bg):
    n = len(vals)
    bw = max(1, (w - (n-1)*3) // n)
    mx = max(vals) or 1
    for i, v in enumerate(vals):
        bh = int(v / mx * h)
        bx = x + i*(bw+3)
        d.rectangle([bx, y+h-bh, bx+bw, y+h], fill=clr)

def sidebar_header(d, c, label):
    d.text((ACTBAR_W+10, 34), label, fill=c["mu"], font=fUI_S)

# ── scenes ────────────────────────────────────────────────────────────────────
LANGS = {
    "EN": {"total":"Total received","today":"Today","hist":"Recent payments","day":"day","cfg":"Configure Lightning Address"},
    "PT": {"total":"Total recebido","today":"Hoje","hist":"Pagamentos recentes","day":"dia","cfg":"Configurar Lightning Address"},
    "ES": {"total":"Total recibido","today":"Hoy","hist":"Pagos recientes","day":"día","cfg":"Configurar Lightning Address"},
    "ZH": {"total":"总收入","today":"今日","hist":"最近付款","day":"天","cfg":"配置闪电地址"},
}
DAY_LABELS = {
    "EN":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
    "PT":["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"],
    "ES":["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"],
    "ZH":["一","二","三","四","五","六","日"],
}

def scene_dashboard(theme="dark", lang="EN", sats=2847, pulse=False, new_sats=None):
    img, d, c = base(theme)
    L = LANGS[lang]
    sidebar_header(d, c, "SHINYDAPPS — LIGHTNING PAYMENTS")

    sy = 50
    # total sats
    d.text((ACTBAR_W+10, sy), L["total"], fill=c["mu"], font=fUI_S)
    sy += 14
    s = new_sats if new_sats is not None else sats
    d.text((ACTBAR_W+10, sy), f"  {s:,} sats", fill=C["orange"], font=fUI_XL)
    d.text((ACTBAR_W+10, sy+30), "  $1.42 USD", fill=c["mu"], font=fUI_S)
    sy += 52

    # today / endpoint row
    d.text((ACTBAR_W+10, sy), L["today"], fill=c["mu"], font=fUI_S)
    d.text((ACTBAR_W+90, sy), "Top endpoint", fill=c["mu"], font=fUI_S)
    sy += 14
    d.text((ACTBAR_W+10, sy), "854 sats", fill=c["tx"], font=fUI_M)
    d.text((ACTBAR_W+90, sy), "/premium", fill=C["green"], font=fMONO_M)
    sy += 22

    d.line([ACTBAR_W+8, sy, EDITOR_X-8, sy], fill=c["sp"])
    sy += 6

    # chart
    d.text((ACTBAR_W+10, sy), "7-day chart", fill=c["mu"], font=fUI_S)
    sy += 14
    chart_vals = [200, 450, 320, 600, 280, 720, 854]
    chart_h = 60
    chart_w = SIDEBAR_W - 20
    bar_chart(d, ACTBAR_W+10, sy, chart_w, chart_h, chart_vals, C["orange"], c["bg"])
    # day labels
    n = 7; bw = max(1,(chart_w - (n-1)*3)//n)
    for i, lbl in enumerate(DAY_LABELS[lang]):
        dx = ACTBAR_W+10 + i*(bw+3) + bw//2
        d.text((dx, sy+chart_h+2), lbl, fill=c["mu"], font=fUI_S, anchor="mt")
    sy += chart_h + 18

    d.line([ACTBAR_W+8, sy, EDITOR_X-8, sy], fill=c["sp"])
    sy += 6

    # payment history
    d.text((ACTBAR_W+10, sy), L["hist"], fill=c["mu"], font=fUI_S)
    sy += 14
    payments = [("/premium","100 sats","2s ago"),("/api/data","50 sats","1m ago"),("/premium","100 sats","3m ago")]
    for i,(ep,amt,ts) in enumerate(payments):
        row_bg = C["highlight"] if (pulse and i==0) else None
        if row_bg:
            d.rectangle([ACTBAR_W+8, sy-2, EDITOR_X-8, sy+14], fill=row_bg)
        d.text((ACTBAR_W+10, sy), ep,  fill=C["green"],  font=fMONO)
        d.text((ACTBAR_W+115,sy), amt, fill=C["orange"], font=fUI_S)
        d.text((ACTBAR_W+200,sy), ts,  fill=c["mu"],     font=fUI_S)
        sy += 18

    # status bar sats
    d.text((60, H-16), f"  {s:,} sats", fill=rgb("ffffff"), font=fUI_S)

    return img


def overlay_palette(base_img):
    ov = Image.new("RGBA", (W, H), (0,0,0,140))
    b = base_img.convert("RGBA")
    return Image.alpha_composite(b, ov).convert("RGB")

def scene_cmd(step=0, theme="dark"):
    img = overlay_palette(scene_dashboard(theme=theme))
    d = ImageDraw.Draw(img)
    px, py, pw = W//2-210, 70, 420
    d.rectangle([px, py, px+pw, py+110], fill=C["palette_bg"])
    d.rectangle([px, py, px+pw, py+1], fill=C["statusbar"])
    d.text((px+10, py+8), "Command Palette", fill=C["muted"], font=fUI_S)

    texts = [">", "> ShinyDapps", "> ShinyDapps: Configure Lightning Address"]
    d.text((px+10, py+28), texts[min(step, 2)], fill=C["text"], font=fUI_M)

    if step >= 2:
        d.rectangle([px+1, py+54, px+pw-1, py+82], fill=C["highlight"])
        d.text((px+10, py+62), "  ShinyDapps: Configure Lightning Address", fill=rgb("ffffff"), font=fUI_S)
    return img

def scene_input(typed="", theme="dark"):
    img = overlay_palette(scene_dashboard(theme=theme))
    d = ImageDraw.Draw(img)
    px, py, pw = W//2-210, 70, 420
    d.rectangle([px, py, px+pw, py+68], fill=C["palette_bg"])
    d.rectangle([px, py, px+pw, py+1], fill=C["statusbar"])
    d.text((px+10, py+8), "Enter your Lightning Address (e.g. you@yourdomain.com)", fill=C["muted"], font=fUI_S)
    d.rectangle([px+10, py+28, px+pw-10, py+54], fill=C["input_bg"])
    cursor = "|" if len(typed) < 12 else ""
    d.text((px+16, py+34), typed + cursor, fill=C["text"], font=fUI_M)
    return img

def scene_theme(theme="light"):
    img, d, c = base(theme)
    sidebar_header(d, c, "SHINYDAPPS — LIGHTNING PAYMENTS")
    sy = 50
    d.text((ACTBAR_W+10, sy), "Total received", fill=c["mu"], font=fUI_S)
    sy += 14
    d.text((ACTBAR_W+10, sy), "  2,847 sats", fill=C["orange"], font=fUI_XL)
    d.text((ACTBAR_W+10, sy+30), "  $1.42 USD", fill=c["mu"], font=fUI_S)
    sy += 52
    d.line([ACTBAR_W+8,sy,EDITOR_X-8,sy], fill=c["sp"]); sy+=8
    # mini chart
    bar_chart(d, ACTBAR_W+10, sy, SIDEBAR_W-20, 60, [200,450,320,600,280,720,854], C["orange"], c["bg"])
    sy += 78
    d.line([ACTBAR_W+8,sy,EDITOR_X-8,sy], fill=c["sp"]); sy+=8
    payments=[("/premium","100 sats","2s ago"),("/api/data","50 sats","1m ago")]
    for ep,amt,ts in payments:
        d.text((ACTBAR_W+10, sy), ep,  fill=C["green"],  font=fMONO)
        d.text((ACTBAR_W+115,sy), amt, fill=C["orange"], font=fUI_S)
        d.text((ACTBAR_W+200,sy), ts,  fill=c["mu"],     font=fUI_S)
        sy += 18
    # theme indicator badge
    label = "LIGHT THEME" if theme=="light" else "DARK THEME"
    bx, by = EDITOR_X+20, 50
    bclr = rgb("e8e8e8") if theme=="light" else rgb("3a3a3a")
    d.rectangle([bx, by, bx+130, by+22], fill=bclr)
    d.text((bx+65, by+11), label, fill=c["tx"], font=fUI_S, anchor="mm")
    d.text((60, H-16), "  2,847 sats", fill=rgb("ffffff"), font=fUI_S)
    return img

# ── build frames ──────────────────────────────────────────────────────────────
frames = []
durations = []

def add(img, ms):
    frames.append(img)
    durations.append(ms)

def adds(img, ms, n):
    for _ in range(n):
        add(img, ms)

# 0-3s  dashboard
adds(scene_dashboard(), 1000, 3)

# 3-5s  new payment pulse
for _ in range(4):
    add(scene_dashboard(pulse=True), 250)
    add(scene_dashboard(pulse=False), 250)

# 5-10s  open command palette, type
add(scene_dashboard(), 800)
add(scene_cmd(step=0), 500)
add(scene_cmd(step=1), 700)
add(scene_cmd(step=2), 1000)
add(scene_cmd(step=3), 800)

# 10-16s  type lightning address
addr_steps = ["", "y", "yo", "you", "you@", "you@b", "you@blink", "you@yourdomain.com"]
for a in addr_steps:
    add(scene_input(typed=a), 250 if len(a)>0 else 600)

# 16-18s  configured → dashboard update
adds(scene_dashboard(sats=2947, new_sats=2947), 1000, 2)

# 18-23s  theme switch
add(scene_theme("dark"),  1200)
add(scene_theme("light"), 1500)
add(scene_theme("dark"),  1300)

# 23-30s  language switch
for lang in ["EN","PT","ES","ZH","EN"]:
    adds(scene_dashboard(lang=lang), 1000, (2 if lang=="EN" and lang!="EN" else 1))
    add(scene_dashboard(lang=lang), 400)

# ensure total ≥ 30s (already ≥ 30s)
print(f"Frames: {len(frames)}, approx duration: {sum(durations)/1000:.1f}s")

# ── save ─────────────────────────────────────────────────────────────────────
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
