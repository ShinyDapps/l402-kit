import * as vscode from "vscode";
import { t } from "./i18n";

export class DashboardPanel {
  static currentPanel: DashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  static createOrShow(extensionUri: vscode.Uri) {
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "l402Dashboard",
      "L402 Dashboard",
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    DashboardPanel.currentPanel = new DashboardPanel(panel);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private async _update() {
    const config = vscode.workspace.getConfiguration("l402-dashboard");
    const lang = config.get<string>("language", "en");
    const supabaseUrl = config.get<string>("supabaseUrl", "");
    const supabaseKey = config.get<string>("supabaseKey", "");

    let todaySats = 0;
    let totalCalls = 0;

    if (supabaseUrl && supabaseKey) {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/payments?select=amount_sats&paid_at=gte.${todayIso()}`,
          { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
        );
        const rows = (await res.json()) as { amount_sats: number }[];
        todaySats = rows.reduce((sum, r) => sum + r.amount_sats, 0);
        totalCalls = rows.length;
      } catch {}
    }

    this._panel.webview.html = buildHtml(lang, todaySats, totalCalls);
  }

  dispose() {
    DashboardPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildHtml(lang: string, todaySats: number, totalCalls: number) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>L402 Dashboard</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 24px; }
  .stat { font-size: 2.5rem; font-weight: bold; color: #f7931a; }
  .label { font-size: 0.9rem; opacity: 0.7; margin-bottom: 24px; }
</style>
</head>
<body>
  <h2>⚡ L402 Dashboard</h2>
  <div class="stat">${todaySats.toLocaleString()} sats</div>
  <div class="label">${t("earned_today", lang)}</div>
  <div class="stat">${totalCalls}</div>
  <div class="label">${t("calls_today", lang)}</div>
</body>
</html>`;
}
