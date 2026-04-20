"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
let statusBar;
let pollInterval;
function activate(context) {
    // Status bar — shows sats received
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.command = "shinydapps.showDashboard";
    statusBar.text = "⚡ 0 sats";
    statusBar.tooltip = "ShinyDapps — Click to open payment dashboard";
    statusBar.show();
    context.subscriptions.push(statusBar);
    context.subscriptions.push(vscode.commands.registerCommand("shinydapps.showDashboard", () => {
        const panel = vscode.window.createWebviewPanel("shinydappsDashboard", "⚡ ShinyDapps Payments", vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = getDashboardHtml(context);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("shinydapps.configure", async () => {
        const address = await vscode.window.showInputBox({
            prompt: "Your Lightning Address (e.g. you@blink.sv)",
            placeHolder: "you@blink.sv",
        });
        if (address) {
            await vscode.workspace.getConfiguration("shinydapps").update("lightningAddress", address, true);
            vscode.window.showInformationMessage(`⚡ Lightning Address saved: ${address}`);
            startPolling(context);
        }
    }));
    startPolling(context);
}
function startPolling(context) {
    if (pollInterval)
        clearInterval(pollInterval);
    const config = vscode.workspace.getConfiguration("shinydapps");
    const supabaseUrl = config.get("supabaseUrl");
    const supabaseKey = config.get("supabaseKey");
    const lightningAddress = config.get("lightningAddress");
    if (!supabaseUrl || !supabaseKey || !lightningAddress)
        return;
    const fetchStats = async () => {
        try {
            const res = await fetch(`${supabaseUrl}/rest/v1/payments?owner_address=eq.${encodeURIComponent(lightningAddress)}&select=amount_sats`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
            const rows = (await res.json());
            const total = rows.reduce((s, r) => s + r.amount_sats, 0);
            statusBar.text = `⚡ ${total.toLocaleString()} sats`;
            if (rows.length > 0)
                statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        }
        catch {
            // silent
        }
    };
    fetchStats();
    pollInterval = setInterval(fetchStats, 30000);
}
function getDashboardHtml(context) {
    const config = vscode.workspace.getConfiguration("shinydapps");
    const supabaseUrl = config.get("supabaseUrl") ?? "";
    const supabaseKey = config.get("supabaseKey") ?? "";
    const lightningAddress = config.get("lightningAddress") ?? "";
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 24px; }
  h1 { font-size: 18px; margin-bottom: 24px; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 16px; }
  .label { font-size: 11px; color: var(--vscode-descriptionForeground); text-transform: uppercase; margin-bottom: 4px; }
  .value { font-size: 24px; font-weight: 700; color: #f7931a; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 8px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
  td { padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  .empty { text-align: center; padding: 32px; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<h1>⚡ ShinyDapps Payments</h1>
<div class="cards">
  <div class="card"><div class="label">Total Payments</div><div class="value" id="count">—</div></div>
  <div class="card"><div class="label">Total Sats</div><div class="value" id="sats">—</div></div>
  <div class="card"><div class="label">Lightning Address</div><div class="value" style="font-size:13px;word-break:break-all">${lightningAddress || "Not set"}</div></div>
</div>
<table>
  <tr><th>When</th><th>Endpoint</th><th>Sats</th></tr>
  <tbody id="rows"><tr><td colspan="3" class="empty">Loading…</td></tr></tbody>
</table>
<script>
  async function load() {
    try {
      const res = await fetch(
        "${supabaseUrl}/rest/v1/payments?owner_address=eq.${lightningAddress}&order=paid_at.desc&limit=50",
        { headers: { apikey: "${supabaseKey}", Authorization: "Bearer ${supabaseKey}" } }
      );
      const rows = await res.json();
      document.getElementById("count").textContent = rows.length;
      document.getElementById("sats").textContent = rows.reduce((s,r) => s + r.amount_sats, 0).toLocaleString();
      document.getElementById("rows").innerHTML = rows.length === 0
        ? '<tr><td colspan="3" class="empty">No payments yet — share your API!</td></tr>'
        : rows.map(r => "<tr><td>" + new Date(r.paid_at).toLocaleString() + "</td><td>" + r.endpoint + "</td><td>" + r.amount_sats + " sats</td></tr>").join("");
    } catch(e) {
      document.getElementById("rows").innerHTML = '<tr><td colspan="3" class="empty">Configure Supabase in settings.</td></tr>';
    }
  }
  load();
</script>
</body>
</html>`;
}
function deactivate() {
    if (pollInterval)
        clearInterval(pollInterval);
}
