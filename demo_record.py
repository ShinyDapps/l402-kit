"""
demo_record.py — VS Code demo pitch do l402-kit.

Como gravar:
  1. Terminal VS Code (Ctrl+`), fonte 16+, tema escuro
  2. Maximize a janela
  3. Inicie gravacao (OBS / Xbox Game Bar Win+G)
  4. python demo_record.py
  5. Pare a gravacao (~40s)
"""
import sys, time, hashlib, asyncio, os, json
sys.path.insert(0, "python")

from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax
from rich.rule import Rule
from rich import box

console = Console(width=64)

def pause(s=0.8): time.sleep(s)

async def main():
    console.clear()
    pause(0.6)

    # ── PROBLEMA ──────────────────────────────────────────────────────────────
    console.print(Panel(
        "[bold red]Stripe rejects Nigeria.[/bold red]\n"
        "[bold red]PayPal blocks Venezuela.[/bold red]\n"
        "[bold red]Banks freeze developer accounts.[/bold red]\n\n"
        "[white]What if any API could accept payments\n"
        "from anyone, anywhere — in seconds?[/white]",
        border_style="red",
        box=box.ROUNDED,
        width=64,
    ))
    pause(2.5)

    # ── SOLUCAO ───────────────────────────────────────────────────────────────
    console.print()
    console.print(Panel(
        "[bold yellow]l402-kit[/bold yellow]\n\n"
        "[white]Bitcoin Lightning pay-per-call.\n"
        "3 lines of code. Zero KYC. Zero account.\n"
        "Works in 180+ countries.[/white]",
        border_style="yellow",
        box=box.ROUNDED,
        width=64,
    ))
    pause(2.0)

    # ── SERVER ────────────────────────────────────────────────────────────────
    console.print(Rule("[dim]server — 3 lines[/dim]", style="dim"))
    pause(0.5)

    console.print(Syntax("""\
from l402kit import l402_required
from l402kit.providers.blink import BlinkProvider

lightning = BlinkProvider(api_key="...", wallet_id="...")

@app.get("/data")
@l402_required(price_sats=10, lightning=lightning)
async def data(request: Request):
    return {"result": "premium content"}""",
        "python", theme="monokai", padding=(0, 1)))
    pause(2.0)

    # ── CLIENT ────────────────────────────────────────────────────────────────
    console.print(Rule("[dim]client — 1 line[/dim]", style="dim"))
    pause(0.5)

    console.print(Syntax("""\
client = L402Client(wallet=BlinkWallet(api_key="...", wallet_id="..."))
data   = client.get("https://api.example.com/data").json()
# pays automatically via Lightning. No code changes needed.""",
        "python", theme="monokai", padding=(0, 1)))
    pause(2.0)

    # ── LIVE FLOW ─────────────────────────────────────────────────────────────
    console.print(Rule("[dim]live — payment flow[/dim]", style="dim"))
    pause(0.5)

    steps = [
        ("dim",    "  GET  /data"),
        ("yellow", "  402  Payment Required   [dim]lnbc10n1p574...[/dim]"),
        ("dim",    "       wallet pays 10 sat via Lightning..."),
    ]
    for style, text in steps:
        console.print(f"[{style}]{text}[/{style}]")
        pause(0.7)

    # Simulate real SHA256
    preimage = os.urandom(32).hex()
    ph = hashlib.sha256(bytes.fromhex(preimage)).hexdigest()
    console.print(f"[dim]       preimage : {preimage[:18]}...[/dim]")
    pause(0.3)
    console.print(f"[dim]       SHA256   : {ph[:18]}...[/dim] [bold green]OK[/bold green]")
    pause(0.5)
    console.print("[dim]  GET  /data  Authorization: L402 eyJ...[/dim]")
    pause(0.6)
    console.print("[bold green]  200  OK[/bold green]")
    pause(0.3)
    console.print(Syntax(
        json.dumps({"result": "premium content", "sats_paid": 10, "protocol": "L402"}, indent=2),
        "json", theme="monokai", padding=(0, 1)))
    pause(1.8)

    # ── VSCODE EXTENSION ──────────────────────────────────────────────────────
    console.print(Rule("[dim]VS Code Extension[/dim]", style="dim"))
    pause(0.5)

    console.print(Panel(
        "[bold]ShinyDapps.shinydapps-l402[/bold]\n\n"
        "  [green]>[/green]  l402-kit: Add to endpoint       [dim]1 click[/dim]\n"
        "  [green]>[/green]  l402-kit: Test payment flow     [dim]1 click[/dim]\n"
        "  [green]>[/green]  l402-kit: Open payment stats    [dim]1 click[/dim]",
        border_style="dim",
        box=box.ROUNDED,
        width=64,
    ))
    pause(1.8)

    # ── FECHAMENTO ────────────────────────────────────────────────────────────
    console.print()
    console.print(Panel(
        "[bold white]No bank. No KYC. No Stripe.[/bold white]\n"
        "[bold white]Pure Bitcoin. Pure Lightning.[/bold white]\n\n"
        "[dim]Sovereign mode: 0% fee — payments go straight to your wallet.\n"
        "Any wallet. Any country. Any API.[/dim]\n\n"
        "[yellow]pip install l402kit[/yellow]   [dim]·[/dim]   "
        "[yellow]npm install l402-kit[/yellow]   [dim]·[/dim]   "
        "[yellow bold]l402kit.com[/yellow bold]",
        border_style="yellow",
        box=box.DOUBLE,
        width=64,
    ))
    pause(3.0)

asyncio.run(main())
