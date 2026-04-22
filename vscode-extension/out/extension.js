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
// Public anon key — safe to embed (RLS filters by owner_address per user)
const SD_SUPABASE_URL = "https://urcqtpklpfyvizcgcsia.supabase.co";
const SD_SUPABASE_KEY = "sb_publishable_v_dOX1JVgEm_vlT-Qr5lsw_EQHc-av-";
let statusBar;
let pollInterval;
let sidebarProvider;
const I18N = {
    en: {
        title: "⚡ ShinyDapps Payments",
        totalPayments: "Total Payments",
        totalSats: "Total Sats",
        lightningAddr: "Lightning Address",
        notSet: "Not configured",
        when: "When",
        endpoint: "Endpoint",
        sats: "Sats",
        noPayments: "No payments yet — share your API!",
        loading: "Loading…",
        setupTitle: "⚡ Quick Setup",
        setupStep1: "1. Open Command Palette",
        setupStep2: "2. Run: ShinyDapps: Configure Lightning Address",
        setupStep3: "3. Or set manually in VS Code Settings:",
        setupHint: "Press Ctrl+Shift+P (Cmd+Shift+P on Mac)",
        chartTitle: "Sats per day (last 7 days)",
        theme: "Theme",
        light: "Light",
        dark: "Dark",
        auto: "Auto",
        revenue: "Revenue (USD est.)",
        btcPrice: "BTC Price",
        satValue: "Sat Value (USD)",
    },
    pt: {
        title: "⚡ Pagamentos ShinyDapps",
        totalPayments: "Total de Pagamentos",
        totalSats: "Total de Sats",
        lightningAddr: "Endereço Lightning",
        notSet: "Não configurado",
        when: "Quando",
        endpoint: "Endpoint",
        sats: "Sats",
        noPayments: "Nenhum pagamento ainda — compartilhe sua API!",
        loading: "Carregando…",
        setupTitle: "⚡ Configuração Rápida",
        setupStep1: "1. Abra o Command Palette",
        setupStep2: "2. Execute: ShinyDapps: Configure Lightning Address",
        setupStep3: "3. Ou configure manualmente nas Configurações do VS Code:",
        setupHint: "Pressione Ctrl+Shift+P (Cmd+Shift+P no Mac)",
        chartTitle: "Sats por dia (últimos 7 dias)",
        theme: "Tema",
        light: "Claro",
        dark: "Escuro",
        auto: "Auto",
        revenue: "Receita (USD est.)",
        btcPrice: "Preço BTC",
        satValue: "Valor em USD",
    },
    es: {
        title: "⚡ Pagos ShinyDapps",
        totalPayments: "Total de Pagos",
        totalSats: "Total de Sats",
        lightningAddr: "Dirección Lightning",
        notSet: "No configurado",
        when: "Cuándo",
        endpoint: "Endpoint",
        sats: "Sats",
        noPayments: "Sin pagos aún — ¡comparte tu API!",
        loading: "Cargando…",
        setupTitle: "⚡ Configuración Rápida",
        setupStep1: "1. Abre el Command Palette",
        setupStep2: "2. Ejecuta: ShinyDapps: Configure Lightning Address",
        setupStep3: "3. O configura manualmente en Configuración de VS Code:",
        setupHint: "Presiona Ctrl+Shift+P (Cmd+Shift+P en Mac)",
        chartTitle: "Sats por día (últimos 7 días)",
        theme: "Tema",
        light: "Claro",
        dark: "Oscuro",
        auto: "Auto",
        revenue: "Ingresos (USD est.)",
    },
    zh: {
        title: "⚡ ShinyDapps 收款",
        totalPayments: "总付款次数",
        totalSats: "总 Sats",
        lightningAddr: "闪电地址",
        notSet: "未配置",
        when: "时间",
        endpoint: "接口",
        sats: "Sats",
        noPayments: "暂无付款 — 分享您的 API！",
        loading: "加载中…",
        setupTitle: "⚡ 快速设置",
        setupStep1: "1. 打开命令面板",
        setupStep2: "2. 运行: ShinyDapps: Configure Lightning Address",
        setupStep3: "3. 或在 VS Code 设置中手动配置：",
        setupHint: "按 Ctrl+Shift+P (Mac: Cmd+Shift+P)",
        chartTitle: "每日 Sats（最近7天）",
        theme: "主题",
        light: "亮色",
        dark: "暗色",
        auto: "自动",
        revenue: "收入 (USD 估)",
    },
    ja: {
        title: "⚡ ShinyDapps 支払い",
        totalPayments: "総支払い数",
        totalSats: "総 Sats",
        lightningAddr: "Lightning アドレス",
        notSet: "未設定",
        when: "日時",
        endpoint: "エンドポイント",
        sats: "Sats",
        noPayments: "まだ支払いなし — APIをシェアしよう！",
        loading: "読み込み中…",
        setupTitle: "⚡ クイック設定",
        setupStep1: "1. コマンドパレットを開く",
        setupStep2: "2. 実行: ShinyDapps: Configure Lightning Address",
        setupStep3: "3. または VS Code 設定で手動設定：",
        setupHint: "Ctrl+Shift+P を押す (Mac: Cmd+Shift+P)",
        chartTitle: "日別 Sats（過去7日間）",
        theme: "テーマ",
        light: "ライト",
        dark: "ダーク",
        auto: "自動",
        revenue: "収益 (USD 推定)",
    },
    fr: {
        title: "⚡ Paiements ShinyDapps",
        totalPayments: "Total Paiements",
        totalSats: "Total Sats",
        lightningAddr: "Adresse Lightning",
        notSet: "Non configuré",
        when: "Quand",
        endpoint: "Endpoint",
        sats: "Sats",
        noPayments: "Aucun paiement — partagez votre API !",
        loading: "Chargement…",
        setupTitle: "⚡ Configuration Rapide",
        setupStep1: "1. Ouvrez la palette de commandes",
        setupStep2: "2. Exécutez : ShinyDapps: Configure Lightning Address",
        setupStep3: "3. Ou configurez manuellement dans les paramètres VS Code :",
        setupHint: "Appuyez sur Ctrl+Shift+P (Cmd+Shift+P sur Mac)",
        chartTitle: "Sats par jour (7 derniers jours)",
        theme: "Thème",
        light: "Clair",
        dark: "Sombre",
        auto: "Auto",
        revenue: "Revenus (USD est.)",
    },
    de: {
        title: "⚡ ShinyDapps Zahlungen",
        totalPayments: "Zahlungen gesamt",
        totalSats: "Sats gesamt",
        lightningAddr: "Lightning-Adresse",
        notSet: "Nicht konfiguriert",
        when: "Wann",
        endpoint: "Endpunkt",
        sats: "Sats",
        noPayments: "Noch keine Zahlungen — teilen Sie Ihre API!",
        loading: "Laden…",
        setupTitle: "⚡ Schnelleinrichtung",
        setupStep1: "1. Befehlspalette öffnen",
        setupStep2: "2. Ausführen: ShinyDapps: Configure Lightning Address",
        setupStep3: "3. Oder manuell in den VS Code-Einstellungen:",
        setupHint: "Strg+Umschalt+P drücken (Cmd+Shift+P auf Mac)",
        chartTitle: "Sats pro Tag (letzte 7 Tage)",
        theme: "Design",
        light: "Hell",
        dark: "Dunkel",
        auto: "Auto",
        revenue: "Einnahmen (USD geschätzt)",
    },
    ru: {
        title: "⚡ Платежи ShinyDapps",
        totalPayments: "Всего платежей",
        totalSats: "Всего сатошей",
        lightningAddr: "Lightning-адрес",
        notSet: "Не настроено",
        when: "Когда",
        endpoint: "Эндпоинт",
        sats: "Сат.",
        noPayments: "Платежей ещё нет — поделитесь API!",
        loading: "Загрузка…",
        setupTitle: "⚡ Быстрая настройка",
        setupStep1: "1. Откройте палитру команд",
        setupStep2: "2. Выполните: ShinyDapps: Configure Lightning Address",
        setupStep3: "3. Или настройте вручную в параметрах VS Code:",
        setupHint: "Нажмите Ctrl+Shift+P (Cmd+Shift+P на Mac)",
        chartTitle: "Сатоши в день (последние 7 дней)",
        theme: "Тема",
        light: "Светлая",
        dark: "Тёмная",
        auto: "Авто",
        revenue: "Доход (USD, оценка)",
    },
    hi: {
        title: "⚡ ShinyDapps भुगतान",
        totalPayments: "कुल भुगतान",
        totalSats: "कुल Sats",
        lightningAddr: "Lightning पता",
        notSet: "कॉन्फ़िगर नहीं किया",
        when: "कब",
        endpoint: "एंडपॉइंट",
        sats: "Sats",
        noPayments: "अभी कोई भुगतान नहीं — अपना API शेयर करें!",
        loading: "लोड हो रहा है…",
        setupTitle: "⚡ त्वरित सेटअप",
        setupStep1: "1. Command Palette खोलें",
        setupStep2: "2. चलाएं: ShinyDapps: Configure Lightning Address",
        setupStep3: "3. या VS Code सेटिंग्स में मैन्युअली सेट करें:",
        setupHint: "Ctrl+Shift+P दबाएं (Mac पर Cmd+Shift+P)",
        chartTitle: "प्रतिदिन Sats (पिछले 7 दिन)",
        theme: "थीम",
        light: "हल्का",
        dark: "गहरा",
        auto: "स्वचालित",
        revenue: "आय (USD अनुमानित)",
    },
    ar: {
        title: "⚡ مدفوعات ShinyDapps",
        totalPayments: "إجمالي المدفوعات",
        totalSats: "إجمالي Sats",
        lightningAddr: "عنوان Lightning",
        notSet: "غير مُهيَّأ",
        when: "وقت",
        endpoint: "نقطة النهاية",
        sats: "Sats",
        noPayments: "لا مدفوعات بعد — شارك واجهة API الخاصة بك!",
        loading: "جارٍ التحميل…",
        setupTitle: "⚡ الإعداد السريع",
        setupStep1: "1. افتح لوحة الأوامر",
        setupStep2: "2. شغّل: ShinyDapps: Configure Lightning Address",
        setupStep3: "3. أو اضبط يدويًا في إعدادات VS Code:",
        setupHint: "اضغط Ctrl+Shift+P (Cmd+Shift+P على Mac)",
        chartTitle: "Sats يوميًا (آخر 7 أيام)",
        theme: "مظهر",
        light: "فاتح",
        dark: "داكن",
        auto: "تلقائي",
        revenue: "الإيرادات (USD تقريبي)",
    },
    it: {
        title: "⚡ Pagamenti ShinyDapps",
        totalPayments: "Pagamenti Totali",
        totalSats: "Sats Totali",
        lightningAddr: "Indirizzo Lightning",
        notSet: "Non configurato",
        when: "Quando",
        endpoint: "Endpoint",
        sats: "Sats",
        noPayments: "Nessun pagamento ancora — condividi la tua API!",
        loading: "Caricamento…",
        setupTitle: "⚡ Configurazione Rapida",
        setupStep1: "1. Apri il Command Palette",
        setupStep2: "2. Esegui: ShinyDapps: Configure Lightning Address",
        setupStep3: "3. Oppure imposta manualmente nelle Impostazioni VS Code:",
        setupHint: "Premi Ctrl+Shift+P (Cmd+Shift+P su Mac)",
        chartTitle: "Sats al giorno (ultimi 7 giorni)",
        theme: "Tema",
        light: "Chiaro",
        dark: "Scuro",
        auto: "Auto",
        revenue: "Ricavi (USD stimati)",
    },
};
class PaymentsDashboardProvider {
    constructor(context) {
        this.context = context;
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = getDashboardHtml(this.context);
        webviewView.webview.onDidReceiveMessage(msg => {
            if (msg.command === "openConfigure") {
                vscode.commands.executeCommand("shinydapps.configure");
            }
        });
    }
    refresh() {
        if (this._view) {
            this._view.webview.html = getDashboardHtml(this.context);
        }
    }
}
function activate(context) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.command = "shinydapps.showDashboard";
    statusBar.text = "⚡ 0 sats";
    statusBar.tooltip = "ShinyDapps — Click to open payment dashboard";
    statusBar.show();
    context.subscriptions.push(statusBar);
    sidebarProvider = new PaymentsDashboardProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("shinydapps.payments", sidebarProvider));
    context.subscriptions.push(vscode.commands.registerCommand("shinydapps.showDashboard", () => {
        const panel = vscode.window.createWebviewPanel("shinydappsDashboard", "⚡ ShinyDapps Payments", vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = getDashboardHtml(context);
        panel.webview.onDidReceiveMessage(msg => {
            if (msg.command === "openConfigure") {
                vscode.commands.executeCommand("shinydapps.configure");
            }
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand("shinydapps.configure", async () => {
        const address = await vscode.window.showInputBox({
            prompt: "⚡ Your Lightning Address (e.g. you@blink.sv)",
            placeHolder: "you@blink.sv",
            ignoreFocusOut: true,
            validateInput: v => (v && v.includes("@") ? null : "Enter a valid Lightning address (e.g. you@blink.sv)"),
        });
        if (!address)
            return;
        const cfg = vscode.workspace.getConfiguration("shinydapps");
        await cfg.update("lightningAddress", address, true);
        vscode.window.showInformationMessage(`⚡ ShinyDapps ready! Monitoring payments for: ${address}`);
        startPolling(context);
        sidebarProvider?.refresh();
    }));
    startPolling(context);
}
function startPolling(_context) {
    if (pollInterval)
        clearInterval(pollInterval);
    const config = vscode.workspace.getConfiguration("shinydapps");
    const lightningAddress = config.get("lightningAddress");
    if (!lightningAddress) {
        statusBar.text = "⚡ Not configured";
        statusBar.tooltip = "ShinyDapps — Click to configure your Lightning Address";
        return;
    }
    const fetchStats = async () => {
        try {
            const res = await fetch(`${SD_SUPABASE_URL}/rest/v1/payments?owner_address=eq.${encodeURIComponent(lightningAddress)}&select=amount_sats`, { headers: { apikey: SD_SUPABASE_KEY, Authorization: `Bearer ${SD_SUPABASE_KEY}` } });
            const rows = (await res.json());
            const total = rows.reduce((s, r) => s + r.amount_sats, 0);
            statusBar.text = `⚡ ${total.toLocaleString()} sats (${rows.length})`;
            statusBar.tooltip = `ShinyDapps — ${rows.length} payments, ${total.toLocaleString()} sats total`;
            if (rows.length > 0)
                statusBar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
            else
                statusBar.backgroundColor = undefined;
        }
        catch {
            statusBar.text = "⚡ — (offline)";
        }
    };
    fetchStats();
    pollInterval = setInterval(fetchStats, 30000);
}
function getDashboardHtml(_context) {
    const config = vscode.workspace.getConfiguration("shinydapps");
    const lightningAddress = config.get("lightningAddress") ?? "";
    const i18nJson = JSON.stringify(I18N);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https://urcqtpklpfyvizcgcsia.supabase.co https://mempool.space https://l402kit.vercel.app; img-src data: blob:;">
<style>
  :root {
    --bg: var(--vscode-editor-background, #1e1e1e);
    --fg: var(--vscode-foreground, var(--vscode-editor-foreground, #cccccc));
    --card: var(--vscode-sideBar-background, #252526);
    --border: var(--vscode-panel-border, #3e3e42);
    --muted: var(--vscode-descriptionForeground, #858585);
    --accent: #f7931a;
    --btn: var(--vscode-button-background, #0e639c);
    --btn-fg: var(--vscode-button-foreground, #ffffff);
  }
  [data-theme="light"] {
    --bg: #ffffff; --fg: #1e1e1e; --card: #f3f3f3;
    --border: #d4d4d4; --muted: #717171;
  }
  [data-theme="dark"] {
    --bg: #1e1e1e; --fg: #d4d4d4; --card: #252526;
    --border: #3e3e42; --muted: #858585;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family, sans-serif); background: var(--bg); color: var(--fg); font-size: 12px; }
  .topbar { display: flex; align-items: center; gap: 6px; padding: 10px 12px 6px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .control-group { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  .control-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
  .control-select {
    min-width: 110px;
    max-width: 170px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--fg);
    font-size: 11px;
    padding: 3px 7px;
    outline: none;
  }
  .control-select:focus { border-color: var(--accent); }
  .control-select { color-scheme: dark; }
  [data-theme="light"] .control-select { color-scheme: light; }
  .btc-ticker { display: none; align-items: center; gap: 10px; padding: 6px 12px; background: rgba(247,147,26,0.07); border-bottom: 1px solid rgba(247,147,26,0.18); font-size: 10px; color: var(--muted); flex-wrap: wrap; }
  .btc-ticker strong { color: var(--accent); font-weight: 700; }
  .btc-ticker-sep { color: rgba(247,147,26,0.25); margin: 0 4px; }
  .content { padding: 12px; }
  h2 { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--accent); }
  .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
  .card-wide { grid-column: 1 / -1; }
  .label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .value { font-size: 20px; font-weight: 700; color: var(--accent); }
  .value-sm { font-size: 12px; font-weight: 600; word-break: break-all; color: var(--fg); }
  .chart-wrap { margin-bottom: 14px; }
  .chart-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .chart-title { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
  .range-sel { display: flex; gap: 2px; }
  .range-btn { background: none; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--muted); padding: 1px 5px; font-size: 9px; font-weight: 600; }
  .range-btn.active { background: var(--accent); color: #000; border-color: var(--accent); }
  .range-btn:hover:not(.active) { border-color: var(--accent); color: var(--accent); }
  canvas { width: 100%; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 6px 4px; color: var(--muted); border-bottom: 1px solid var(--border); font-size: 10px; text-transform: uppercase; }
  td { padding: 6px 4px; border-bottom: 1px solid var(--border); font-size: 11px; }
  .empty { text-align: center; padding: 24px; color: var(--muted); }
  .setup { background: var(--card); border: 1px solid var(--accent); border-radius: 10px; padding: 16px; }
  .setup h3 { color: var(--accent); font-size: 14px; margin-bottom: 12px; }
  .setup p { color: var(--fg); margin-bottom: 8px; line-height: 1.5; }
  .setup code { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-family: monospace; font-size: 11px; color: var(--accent); }
  .setup pre { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px; font-size: 10px; line-height: 1.6; overflow-x: auto; margin-top: 8px; color: var(--fg); font-family: monospace; }
  .hint { font-size: 10px; color: var(--muted); margin-top: 4px; font-style: italic; }
  .sats-badge { color: var(--accent); font-weight: 600; }
  .refresh-btn { background: none; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--muted); padding: 2px 8px; font-size: 13px; margin-left: auto; }
  .refresh-btn:hover { color: var(--accent); border-color: var(--accent); }
  .error-box { background: var(--card); border: 1px solid #f44; border-radius: 10px; padding: 16px; }
  .error-box h3 { color: #f66; font-size: 13px; margin-bottom: 8px; }
  .err-msg { font-size: 10px; color: var(--muted); word-break: break-all; margin-bottom: 10px; }
</style>
</head>
<body>
<div class="topbar">
  <div class="control-group">
    <span class="control-label">Language</span>
    <select id="langSelect" class="control-select"></select>
  </div>
  <div class="control-group" style="justify-content:flex-end;">
    <span class="control-label" id="themeLabel">Theme</span>
    <select id="themeSelect" class="control-select"></select>
  </div>
  <button class="refresh-btn" id="refreshBtn" title="Refresh">↺</button>
</div>
<div class="btc-ticker" id="btcTicker"></div>
<div class="content" id="content"></div>

<script>
// ── Error handlers FIRST — before anything that can throw ──────────────
window.addEventListener('error', (ev) => {
  try { renderError('Runtime error: ' + (ev.message || 'unknown')); } catch(e2) {
    document.getElementById('content').innerHTML = '<div style="color:#f66;padding:20px">Runtime error: ' + (ev.message || 'unknown') + '</div>';
  }
});
window.addEventListener('unhandledrejection', (ev) => {
  const r = ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason || 'unknown');
  try { renderError('Promise error: ' + r); } catch(e2) {
    document.getElementById('content').innerHTML = '<div style="color:#f66;padding:20px">Promise error: ' + r + '</div>';
  }
});

// ── Immediately show loading so content is never black ──────────────────
document.getElementById('content').innerHTML = '<div class="empty" style="padding:36px 12px;color:var(--muted)">⚡ Loading…</div>';

// ── Acquire VS Code API safely ──────────────────────────────────────────
let vscodeApi;
try { vscodeApi = acquireVsCodeApi(); } catch(e) { vscodeApi = { postMessage: () => {} }; }

const SUPABASE_URL = "https://urcqtpklpfyvizcgcsia.supabase.co";
const SUPABASE_KEY = "sb_publishable_v_dOX1JVgEm_vlT-Qr5lsw_EQHc-av-";
const LIGHTNING_ADDRESS = ${JSON.stringify(lightningAddress)};
const I18N = ${i18nJson};

let lang = 'en';
let theme = 'auto';

const LANGS = [
  { code: 'en', label: 'English (EN)' },
  { code: 'pt', label: 'Portugues (PT)' },
  { code: 'es', label: 'Espanol (ES)' },
  { code: 'zh', label: '中文 (ZH)' },
  { code: 'ja', label: '日本語 (JA)' },
  { code: 'fr', label: 'Francais (FR)' },
  { code: 'de', label: 'Deutsch (DE)' },
  { code: 'ru', label: 'Русский (RU)' },
  { code: 'hi', label: 'हिन्दी (HI)' },
  { code: 'ar', label: 'العربية (AR)' },
  { code: 'it', label: 'Italiano (IT)' },
];

function t(key) { return (I18N[lang] || I18N.en)[key] ?? I18N.en[key] ?? key; }

function loadPrefs() {
  try {
    const savedLang = localStorage.getItem('sd_lang');
    const savedTheme = localStorage.getItem('sd_theme');
    if (savedLang && LANGS.some(l => l.code === savedLang)) lang = savedLang;
    if (savedTheme && ['auto', 'light', 'dark'].includes(savedTheme)) theme = savedTheme;
  } catch {}
}

function savePrefs() {
  try {
    localStorage.setItem('sd_lang', lang);
    localStorage.setItem('sd_theme', theme);
  } catch {}
}

function applyTheme(th) {
  theme = th;
  document.documentElement.setAttribute('data-theme', th === 'auto' ? '' : th);
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) themeSelect.value = th;
  savePrefs();
}

function buildTopbar() {
  const langSelect = document.getElementById('langSelect');
  const themeSelect = document.getElementById('themeSelect');
  if (!langSelect || !themeSelect) return;

  langSelect.innerHTML = LANGS.map(l => '<option value="' + l.code + '">' + l.label + '</option>').join('');
  langSelect.value = lang;
  langSelect.addEventListener('change', () => {
    lang = langSelect.value;
    savePrefs();
    renderContent(lastData);
  });

  themeSelect.innerHTML = [
    { code: 'auto', label: t('auto') },
    { code: 'light', label: t('light') },
    { code: 'dark', label: t('dark') },
  ].map(th => '<option value="' + th.code + '">' + th.label + '</option>').join('');
  themeSelect.value = theme;
  themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
  const themeLabel = document.getElementById('themeLabel');
  if (themeLabel) themeLabel.textContent = t('theme');

  document.getElementById('refreshBtn').addEventListener('click', load);
}

function renderError(msg) {
  document.getElementById('content').innerHTML =
    '<div class="error-box">' +
    '<h3>⚠ Connection Error</h3>' +
    '<p class="err-msg">' + msg + '</p>' +
    '<p style="font-size:10px;color:var(--muted);margin-bottom:10px;">Monitoring: <strong>' + LIGHTNING_ADDRESS + '</strong></p>' +
    '<button id="retryBtn" style="width:100%;padding:8px;background:var(--btn);color:var(--btn-fg);border:none;border-radius:6px;font-size:12px;cursor:pointer;">↺ Retry</button>' +
    '</div>';
  document.getElementById('retryBtn').addEventListener('click', load);
}


function renderSetup() {
  document.getElementById('content').innerHTML = '<div class="setup">' +
    '<h3>' + t('setupTitle') + '</h3>' +
    '<p style="margin-bottom:12px;line-height:1.6;">' + t('setupStep1') + '<br>' + t('setupStep2') + '</p>' +
    '<button id="cfgBtn" style="width:100%;margin-bottom:14px;padding:10px;background:var(--accent);color:#000;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">⚡ Set Lightning Address</button>' +
    '<p style="margin-bottom:6px;">' + t('setupStep3') + '</p>' +
    '<pre>"shinydapps.lightningAddress": "you@blink.sv"</pre>' +
    '<p class="hint">' + t('setupHint') + '</p>' +
    '</div>';
  document.getElementById('cfgBtn').addEventListener('click', () => {
    vscodeApi.postMessage({ command: 'openConfigure' });
  });
}

let lastData = null;
let chartRange = '7D';
let btcPriceUsd = 0;
let isPro = false;

async function checkPro() {
  if (!LIGHTNING_ADDRESS) return;
  try {
    const r = await fetch('https://l402kit.vercel.app/api/pro-check?address=' + encodeURIComponent(LIGHTNING_ADDRESS));
    const d = await r.json();
    isPro = d.pro === true;
  } catch { isPro = false; }
}

async function fetchBtcPrice() {
  try {
    const r = await fetch('https://mempool.space/api/v1/prices');
    const d = await r.json();
    btcPriceUsd = d.USD || 0;
    if (btcPriceUsd) {
      const satUsd = btcPriceUsd / 100_000_000;
      const ticker = document.getElementById('btcTicker');
      if (ticker) {
        ticker.style.display = 'flex';
        ticker.innerHTML =
          '<span style="color:var(--accent);font-size:12px">⚡</span>' +
          '<strong>BTC</strong> $' + btcPriceUsd.toLocaleString() +
          '<span class="btc-ticker-sep">·</span>' +
          '1 sat = <strong>$' + satUsd.toFixed(6) + '</strong>' +
          '<span class="btc-ticker-sep">·</span>' +
          '100 sats = <strong>$' + (satUsd * 100).toFixed(4) + '</strong>' +
          '<span class="btc-ticker-sep">·</span>' +
          '1,000 sats = <strong>$' + (satUsd * 1000).toFixed(3) + '</strong>';
      }
      const el = document.getElementById('btcPriceEl');
      if (el) el.textContent = '$' + btcPriceUsd.toLocaleString();
    }
  } catch { btcPriceUsd = 0; }
}

function getBuckets(rows, range) {
  const now = new Date();
  let buckets, keyFn;
  if (range === '1D') {
    buckets = Array.from({length: 24}, (_, i) => {
      const h = new Date(+now - (23 - i) * 3600_000);
      return { key: h.toISOString().slice(0, 13), label: String(h.getHours()).padStart(2, '0') + 'h', val: 0 };
    });
    keyFn = r => r.paid_at ? r.paid_at.slice(0, 13) : null;
  } else if (range === '7D' || range === '30D') {
    const N = range === '7D' ? 7 : 30;
    buckets = Array.from({length: N}, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - (N - 1 - i));
      const iso = d.toISOString().slice(0, 10);
      return { key: iso, label: iso.slice(5), val: 0 };
    });
    keyFn = r => r.paid_at ? r.paid_at.slice(0, 10) : null;
  } else if (range === '1Y') {
    buckets = Array.from({length: 12}, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const iso = d.toISOString().slice(0, 7);
      return { key: iso, label: iso.slice(5), val: 0 };
    });
    keyFn = r => r.paid_at ? r.paid_at.slice(0, 7) : null;
  } else { // ALL
    if (!rows || rows.length === 0) {
      buckets = Array.from({length: 7}, (_, i) => {
        const d = new Date(now); d.setDate(d.getDate() - (6 - i));
        return { key: d.toISOString().slice(0, 10), label: d.toISOString().slice(5, 10), val: 0 };
      });
      keyFn = r => r.paid_at ? r.paid_at.slice(0, 10) : null;
    } else {
      const first = rows.reduce((m, r) => (r.paid_at && r.paid_at < m) ? r.paid_at : m, now.toISOString());
      const start = new Date(first.slice(0, 7) + '-01');
      const months = [];
      const cur = new Date(start);
      while (+cur <= +now) {
        const iso = cur.toISOString().slice(0, 7);
        months.push({ key: iso, label: iso.slice(5), val: 0 });
        cur.setMonth(cur.getMonth() + 1);
      }
      if (months.length === 0) months.push({ key: now.toISOString().slice(0, 7), label: now.toISOString().slice(5, 7), val: 0 });
      buckets = months;
      keyFn = r => r.paid_at ? r.paid_at.slice(0, 7) : null;
    }
  }
  const bmap = Object.fromEntries(buckets.map(b => [b.key, b]));
  (rows || []).forEach(r => { const k = keyFn(r); if (k && bmap[k]) bmap[k].val += r.amount_sats || 0; });
  return buckets;
}

function drawChart(rows, range) {
  const canvas = document.getElementById('chart');
  if (!canvas) return;

  // Match canvas resolution to physical pixels for crisp rendering
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max((canvas.parentElement || canvas).getBoundingClientRect().width || 280, 150);
  const cssH = 110;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = cssH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = cssW, H = cssH;

  const buckets = getBuckets(rows, range || chartRange);
  const N = buckets.length;
  const maxSat = Math.max(...buckets.map(b => b.val));
  const maxVal = maxSat > 0 ? maxSat : 1;
  const gap = N > 20 ? 1 : 2;
  const barW = Math.max(2, Math.floor((W - 20) / N) - gap);

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#252526';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const skipLabel = N > 24 ? 4 : N > 12 ? 2 : 1;
  buckets.forEach((b, i) => {
    const x = 10 + i * (barW + gap);
    // Ghost bars (3 px) always visible — real bars scale from maxVal
    const barH = b.val > 0 ? Math.max(3, Math.round((b.val / maxVal) * (H - 28))) : 3;
    const y = H - barH - 18;
    ctx.fillStyle = b.val > 0 ? '#f7931a' : 'rgba(247,147,26,0.13)';
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, barW, barH, 2); } else { ctx.rect(x, y, barW, barH); }
    ctx.fill();
    if (i % skipLabel === 0 || i === N - 1) {
      ctx.fillStyle = 'rgba(247,147,26,0.55)';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, x + barW / 2, H - 4);
    }
    if (b.val > 0) {
      ctx.fillStyle = '#f7931a';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.val >= 1000 ? (b.val / 1000).toFixed(1) + 'k' : String(b.val), x + barW / 2, y - 3);
    }
  });
}

function renderContent(rows) {
  lastData = rows;
  if (!rows) { renderSetup(); return; }

  const total = rows.reduce((s, r) => s + (r.amount_sats || 0), 0);
  const usdFallback = (total * 0.00003).toFixed(2);
  const usd = btcPriceUsd ? ((total / 100_000_000) * btcPriceUsd).toFixed(2) : usdFallback;

  const content = document.getElementById('content');
  content.innerHTML =
    '<h2>' + t('title') + '</h2>' +
    '<div class="cards">' +
      '<div class="card"><div class="label">' + t('totalPayments') + '</div><div class="value">' + rows.length + '</div></div>' +
      '<div class="card"><div class="label">' + t('totalSats') + '</div><div class="value">' + total.toLocaleString() + '</div></div>' +
      '<div class="card"><div class="label">' + t('revenue') + '</div><div class="value" style="font-size:16px">$' + usd + '</div></div>' +
      '<div class="card"><div class="label">' + t('btcPrice') + '</div><div class="value-sm" id="btcPriceEl">' + (btcPriceUsd ? '$' + btcPriceUsd.toLocaleString() : '…') + '</div></div>' +
      '<div class="card card-wide"><div class="label">' + t('lightningAddr') + '</div><div class="value-sm">' + (LIGHTNING_ADDRESS || t('notSet')) + '</div></div>' +
    '</div>' +
    (isPro ? '' :
      '<div style="margin-bottom:14px;background:linear-gradient(135deg,rgba(247,147,26,0.07),rgba(247,147,26,0.03));border:1px solid rgba(247,147,26,0.28);border-radius:10px;padding:12px 14px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">' +
        '<span style="font-size:12px;font-weight:700;color:#f7931a">⚡ ShinyDapps Pro</span>' +
        '<span style="font-size:9px;color:#f7931a;background:rgba(247,147,26,0.12);border:1px solid rgba(247,147,26,0.22);border-radius:4px;padding:1px 7px;font-weight:600">9,000 sats / mo</span>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--muted);margin-bottom:10px;line-height:1.5">Full history · CSV export · Pay in Bitcoin · Cancel anytime</div>' +
      '<a href="https://l402kit.vercel.app/docs#pricing" style="display:block;text-align:center;background:#f7931a;color:#000;border-radius:7px;padding:7px 0;font-size:11px;font-weight:700;text-decoration:none;letter-spacing:0.2px" target="_blank">Upgrade with Bitcoin →</a>' +
      '</div>'
    ) +
    '<div class="chart-wrap">' +
      '<div class="chart-header">' +
        '<div class="chart-title">' + t('chartTitle') + '</div>' +
        '<div class="range-sel" id="rangeSel">' +
          ['1D','7D','30D','1Y','ALL'].map(r => {
            const proOnly = (r === '1Y' || r === 'ALL') && !isPro;
            return '<button class="range-btn' + (r === chartRange ? ' active' : '') + '" data-range="' + r + '"' + (proOnly ? ' data-pro-lock="1" title="Pro only"' : '') + '>' + r + (proOnly ? ' 🔒' : '') + '</button>';
          }).join('') +
        '</div>' +
        (isPro ? '<button id="csvExportBtn" style="margin-left:6px;background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--muted);padding:1px 6px;font-size:9px;font-weight:600">CSV</button>' : '') +
      '</div>' +
      '<canvas id="chart" width="280" height="110"></canvas>' +
    '</div>' +
    '<table>' +
      '<tr><th>' + t('when') + '</th><th>' + t('endpoint') + '</th><th>' + t('sats') + '</th></tr>' +
      '<tbody>' + (rows.length === 0
        ? '<tr><td colspan="3" style="text-align:center;padding:28px 12px"><div style="font-size:22px;margin-bottom:8px;opacity:0.35">⚡</div><div style="color:var(--muted);font-size:11px;margin-bottom:4px">' + t('noPayments') + '</div><div style="color:var(--muted);font-size:10px;opacity:0.55">Your first satoshi is waiting</div></td></tr>'
        : rows.slice(0, 50).map(r =>
            '<tr><td>' + new Date(r.paid_at).toLocaleString() + '</td><td>' + (r.endpoint || '—') + '</td><td class="sats-badge">' + (r.amount_sats || 0) + '</td></tr>'
          ).join('')
      ) + '</tbody>' +
    '</table>';

  requestAnimationFrame(() => {
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.innerHTML = [
        { code: 'auto', label: t('auto') },
        { code: 'light', label: t('light') },
        { code: 'dark', label: t('dark') },
      ].map(th => '<option value="' + th.code + '">' + th.label + '</option>').join('');
      themeSelect.value = theme;
    }
    const themeLabel = document.getElementById('themeLabel');
    if (themeLabel) themeLabel.textContent = t('theme');

    drawChart(rows, chartRange);
    // Re-draw when sidebar is resized
    try {
      if (window._chartRo) window._chartRo.disconnect();
      window._chartRo = new ResizeObserver(() => {
        if (lastData !== null) drawChart(lastData, chartRange);
      });
      const cw = document.querySelector('.chart-wrap');
      if (cw) window._chartRo.observe(cw);
    } catch(_) {}
    document.getElementById('rangeSel')?.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.proLock) {
          window.open('https://l402kit.vercel.app/docs#pricing', '_blank');
          return;
        }
        chartRange = btn.dataset.range;
        document.querySelectorAll('.range-btn').forEach(b => b.classList.toggle('active', b.dataset.range === chartRange));
        drawChart(lastData, chartRange);
      });
    });
    const csvBtn = document.getElementById('csvExportBtn');
    if (csvBtn) {
      csvBtn.addEventListener('click', () => {
        const header = 'date,endpoint,sats\n';
        const body = (lastData || []).map(r =>
          new Date(r.paid_at).toISOString() + ',' + (r.endpoint || '') + ',' + (r.amount_sats || 0)
        ).join('\n');
        const blob = new Blob([header + body], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'payments.csv'; a.click();
        URL.revokeObjectURL(url);
      });
    }
  });
}

async function load() {
  if (!LIGHTNING_ADDRESS) {
    renderSetup();
    return;
  }
  document.getElementById('content').innerHTML =
    '<div class="empty" style="padding:40px 12px;">' + t('loading') + '</div>';
  await checkPro();
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/payments?owner_address=eq.' + encodeURIComponent(LIGHTNING_ADDRESS) + '&order=paid_at.desc&limit=500',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + (body ? ': ' + body.slice(0, 120) : ''));
    }
    const rows = await res.json();
    renderContent(Array.isArray(rows) ? rows : []);
  } catch(e) {
    renderError(e.message || 'Network error');
  }
}

try {
  loadPrefs();
  buildTopbar();
  applyTheme(theme);
  fetchBtcPrice();
  load();
} catch (e) {
  const m = e && e.message ? e.message : String(e || 'unknown');
  renderError('Init failed: ' + m);
}
</script>
</body>
</html>`;
}
function deactivate() {
    if (pollInterval)
        clearInterval(pollInterval);
}
