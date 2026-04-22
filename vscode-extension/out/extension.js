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
const SD_SUPABASE_URL = "https://urcqtpklpfyvizcgcsia.supabase.co";
const SD_SUPABASE_KEY = "sb_publishable_v_dOX1JVgEm_vlT-Qr5lsw_EQHc-av-";
let statusBar;
let pollInterval;
let sidebarProvider;
// ── i18n ──────────────────────────────────────────────────────────────────────
const I18N = {
    en: {
        title: "⚡ ShinyDapps Payments", totalPayments: "Total Payments",
        totalSats: "Total Sats", lightningAddr: "Lightning Address", notSet: "Not configured",
        when: "When", endpoint: "Endpoint", sats: "Sats",
        noPayments: "No payments yet — share your API!",
        loading: "Loading…", setupTitle: "⚡ Quick Setup",
        setupStep1: "1. Open Command Palette (Ctrl+Shift+P)",
        setupStep2: "2. Run: ShinyDapps: Configure Lightning Address",
        setupStep3: "Or add manually to VS Code settings:",
        setupHint: "Get a free Lightning address at dashboard.blink.sv",
        chartTitle: "Sats earned", revenue: "Revenue (USD est.)", btcPrice: "BTC Price",
    },
    pt: {
        title: "⚡ Pagamentos ShinyDapps", totalPayments: "Total de Pagamentos",
        totalSats: "Total de Sats", lightningAddr: "Endereço Lightning", notSet: "Não configurado",
        when: "Quando", endpoint: "Endpoint", sats: "Sats",
        noPayments: "Nenhum pagamento ainda — compartilhe sua API!",
        loading: "Carregando…", setupTitle: "⚡ Configuração Rápida",
        setupStep1: "1. Abra o Command Palette (Ctrl+Shift+P)",
        setupStep2: "2. Execute: ShinyDapps: Configure Lightning Address",
        setupStep3: "Ou adicione manualmente nas configurações do VS Code:",
        setupHint: "Obtenha um endereço Lightning gratuito em dashboard.blink.sv",
        chartTitle: "Sats ganhos", revenue: "Receita (USD est.)", btcPrice: "Preço BTC",
    },
    es: {
        title: "⚡ Pagos ShinyDapps", totalPayments: "Total de Pagos",
        totalSats: "Total de Sats", lightningAddr: "Dirección Lightning", notSet: "No configurado",
        when: "Cuándo", endpoint: "Endpoint", sats: "Sats",
        noPayments: "Sin pagos aún — ¡comparte tu API!",
        loading: "Cargando…", setupTitle: "⚡ Configuración Rápida",
        setupStep1: "1. Abre el Command Palette (Ctrl+Shift+P)",
        setupStep2: "2. Ejecuta: ShinyDapps: Configure Lightning Address",
        setupStep3: "O configura manualmente en ajustes de VS Code:",
        setupHint: "Obtén una dirección Lightning gratuita en dashboard.blink.sv",
        chartTitle: "Sats ganados", revenue: "Ingresos (USD est.)", btcPrice: "Precio BTC",
    },
    zh: {
        title: "⚡ ShinyDapps 收款", totalPayments: "总付款次数",
        totalSats: "总 Sats", lightningAddr: "闪电地址", notSet: "未配置",
        when: "时间", endpoint: "接口", sats: "Sats",
        noPayments: "暂无付款 — 分享您的 API！",
        loading: "加载中…", setupTitle: "⚡ 快速设置",
        setupStep1: "1. 打开命令面板 (Ctrl+Shift+P)",
        setupStep2: "2. 运行: ShinyDapps: Configure Lightning Address",
        setupStep3: "或在 VS Code 设置中手动配置：",
        setupHint: "在 dashboard.blink.sv 获取免费闪电地址",
        chartTitle: "收入 Sats", revenue: "收入 (USD 估)", btcPrice: "BTC 价格",
    },
    ja: {
        title: "⚡ ShinyDapps 支払い", totalPayments: "総支払い数",
        totalSats: "総 Sats", lightningAddr: "Lightning アドレス", notSet: "未設定",
        when: "日時", endpoint: "エンドポイント", sats: "Sats",
        noPayments: "まだ支払いなし — APIをシェアしよう！",
        loading: "読み込み中…", setupTitle: "⚡ クイック設定",
        setupStep1: "1. コマンドパレットを開く (Ctrl+Shift+P)",
        setupStep2: "2. 実行: ShinyDapps: Configure Lightning Address",
        setupStep3: "または VS Code 設定で手動設定：",
        setupHint: "dashboard.blink.sv で無料の Lightning アドレスを取得",
        chartTitle: "獲得 Sats", revenue: "収益 (USD 推定)", btcPrice: "BTC 価格",
    },
    fr: {
        title: "⚡ Paiements ShinyDapps", totalPayments: "Total Paiements",
        totalSats: "Total Sats", lightningAddr: "Adresse Lightning", notSet: "Non configuré",
        when: "Quand", endpoint: "Endpoint", sats: "Sats",
        noPayments: "Aucun paiement — partagez votre API !",
        loading: "Chargement…", setupTitle: "⚡ Configuration Rapide",
        setupStep1: "1. Ouvrez la palette de commandes (Ctrl+Shift+P)",
        setupStep2: "2. Exécutez : ShinyDapps: Configure Lightning Address",
        setupStep3: "Ou configurez manuellement dans les paramètres VS Code :",
        setupHint: "Obtenez une adresse Lightning gratuite sur dashboard.blink.sv",
        chartTitle: "Sats gagnés", revenue: "Revenus (USD est.)", btcPrice: "Prix BTC",
    },
    de: {
        title: "⚡ ShinyDapps Zahlungen", totalPayments: "Zahlungen gesamt",
        totalSats: "Sats gesamt", lightningAddr: "Lightning-Adresse", notSet: "Nicht konfiguriert",
        when: "Wann", endpoint: "Endpunkt", sats: "Sats",
        noPayments: "Noch keine Zahlungen — teilen Sie Ihre API!",
        loading: "Laden…", setupTitle: "⚡ Schnelleinrichtung",
        setupStep1: "1. Befehlspalette öffnen (Strg+Umschalt+P)",
        setupStep2: "2. Ausführen: ShinyDapps: Configure Lightning Address",
        setupStep3: "Oder manuell in den VS Code-Einstellungen:",
        setupHint: "Kostenlosen Lightning-Adresse auf dashboard.blink.sv holen",
        chartTitle: "Verdiente Sats", revenue: "Einnahmen (USD geschätzt)", btcPrice: "BTC-Preis",
    },
    ru: {
        title: "⚡ Платежи ShinyDapps", totalPayments: "Всего платежей",
        totalSats: "Всего сатошей", lightningAddr: "Lightning-адрес", notSet: "Не настроено",
        when: "Когда", endpoint: "Эндпоинт", sats: "Сат.",
        noPayments: "Платежей ещё нет — поделитесь API!",
        loading: "Загрузка…", setupTitle: "⚡ Быстрая настройка",
        setupStep1: "1. Откройте палитру команд (Ctrl+Shift+P)",
        setupStep2: "2. Выполните: ShinyDapps: Configure Lightning Address",
        setupStep3: "Или настройте вручную в параметрах VS Code:",
        setupHint: "Получите бесплатный Lightning-адрес на dashboard.blink.sv",
        chartTitle: "Заработанные сатоши", revenue: "Доход (USD, оценка)", btcPrice: "Цена BTC",
    },
    hi: {
        title: "⚡ ShinyDapps भुगतान", totalPayments: "कुल भुगतान",
        totalSats: "कुल Sats", lightningAddr: "Lightning पता", notSet: "कॉन्फ़िगर नहीं",
        when: "कब", endpoint: "एंडपॉइंट", sats: "Sats",
        noPayments: "अभी कोई भुगतान नहीं — अपना API शेयर करें!",
        loading: "लोड हो रहा है…", setupTitle: "⚡ त्वरित सेटअप",
        setupStep1: "1. Command Palette खोलें (Ctrl+Shift+P)",
        setupStep2: "2. चलाएं: ShinyDapps: Configure Lightning Address",
        setupStep3: "या VS Code सेटिंग्स में मैन्युअली सेट करें:",
        setupHint: "dashboard.blink.sv पर मुफ़्त Lightning पता प्राप्त करें",
        chartTitle: "अर्जित Sats", revenue: "आय (USD अनुमानित)", btcPrice: "BTC मूल्य",
    },
    ar: {
        title: "⚡ مدفوعات ShinyDapps", totalPayments: "إجمالي المدفوعات",
        totalSats: "إجمالي Sats", lightningAddr: "عنوان Lightning", notSet: "غير مُهيَّأ",
        when: "وقت", endpoint: "نقطة النهاية", sats: "Sats",
        noPayments: "لا مدفوعات بعد — شارك واجهة API الخاصة بك!",
        loading: "جارٍ التحميل…", setupTitle: "⚡ الإعداد السريع",
        setupStep1: "1. افتح لوحة الأوامر (Ctrl+Shift+P)",
        setupStep2: "2. شغّل: ShinyDapps: Configure Lightning Address",
        setupStep3: "أو اضبط يدويًا في إعدادات VS Code:",
        setupHint: "احصل على عنوان Lightning مجاني على dashboard.blink.sv",
        chartTitle: "Sats المكتسبة", revenue: "الإيرادات (USD تقريبي)", btcPrice: "سعر BTC",
    },
    it: {
        title: "⚡ Pagamenti ShinyDapps", totalPayments: "Pagamenti Totali",
        totalSats: "Sats Totali", lightningAddr: "Indirizzo Lightning", notSet: "Non configurato",
        when: "Quando", endpoint: "Endpoint", sats: "Sats",
        noPayments: "Nessun pagamento ancora — condividi la tua API!",
        loading: "Caricamento…", setupTitle: "⚡ Configurazione Rapida",
        setupStep1: "1. Apri il Command Palette (Ctrl+Shift+P)",
        setupStep2: "2. Esegui: ShinyDapps: Configure Lightning Address",
        setupStep3: "Oppure configura manualmente nelle impostazioni VS Code:",
        setupHint: "Ottieni un indirizzo Lightning gratuito su dashboard.blink.sv",
        chartTitle: "Sats guadagnati", revenue: "Ricavi (USD stimati)", btcPrice: "Prezzo BTC",
    },
};
// ── Provider ──────────────────────────────────────────────────────────────────
class PaymentsDashboardProvider {
    constructor(_context) { }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = getDashboardHtml();
        webviewView.webview.onDidReceiveMessage(msg => {
            if (msg.command === "openConfigure") {
                vscode.commands.executeCommand("shinydapps.configure");
            }
        });
    }
    refresh() {
        if (this._view)
            this._view.webview.html = getDashboardHtml();
    }
}
// ── Activation ────────────────────────────────────────────────────────────────
function activate(context) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.command = "shinydapps.showDashboard";
    statusBar.text = "⚡ 0 sats (0)";
    statusBar.tooltip = "ShinyDapps — Click to open payment dashboard";
    statusBar.show();
    context.subscriptions.push(statusBar);
    sidebarProvider = new PaymentsDashboardProvider(context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("shinydapps.payments", sidebarProvider));
    context.subscriptions.push(vscode.commands.registerCommand("shinydapps.showDashboard", () => {
        const panel = vscode.window.createWebviewPanel("shinydappsDashboard", "⚡ ShinyDapps Payments", vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = getDashboardHtml();
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
        vscode.window.showInformationMessage(`⚡ ShinyDapps ready! Monitoring: ${address}`);
        startPolling();
        sidebarProvider?.refresh();
    }));
    startPolling();
}
function startPolling() {
    if (pollInterval)
        clearInterval(pollInterval);
    const addr = vscode.workspace.getConfiguration("shinydapps").get("lightningAddress");
    if (!addr) {
        statusBar.text = "⚡ Not configured";
        statusBar.tooltip = "ShinyDapps — Click to configure your Lightning Address";
        return;
    }
    const poll = async () => {
        try {
            const res = await fetch(`${SD_SUPABASE_URL}/rest/v1/payments?owner_address=eq.${encodeURIComponent(addr)}&select=amount_sats`, { headers: { apikey: SD_SUPABASE_KEY, Authorization: `Bearer ${SD_SUPABASE_KEY}` } });
            const rows = (await res.json());
            const total = rows.reduce((s, r) => s + (r.amount_sats || 0), 0);
            statusBar.text = `⚡ ${total.toLocaleString()} sats (${rows.length})`;
            statusBar.tooltip = `ShinyDapps — ${rows.length} payments · ${total.toLocaleString()} sats`;
            statusBar.backgroundColor = rows.length > 0
                ? new vscode.ThemeColor("statusBarItem.warningBackground")
                : undefined;
        }
        catch {
            statusBar.text = "⚡ — (offline)";
        }
    };
    poll();
    pollInterval = setInterval(poll, 30000);
}
// ── Webview HTML ──────────────────────────────────────────────────────────────
function getDashboardHtml() {
    const addr = vscode.workspace.getConfiguration("shinydapps").get("lightningAddress") ?? "";
    const i18n = JSON.stringify(I18N);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https:; img-src data: blob:;">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0e0e0e;
  color: #d0d0d0;
  font-size: 12px;
  min-height: 100vh;
}
#topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px 7px;
  border-bottom: 1px solid #1e1e1e;
  background: #111;
}
#langSelect {
  background: #1a1a1a; border: 1px solid #2e2e2e; border-radius: 5px;
  color: #b0b0b0; font-size: 11px; padding: 3px 8px; cursor: pointer; flex: 1;
}
#langSelect:focus { outline: 1px solid #f7931a; border-color: #f7931a; }
#refreshBtn {
  background: none; border: 1px solid #2e2e2e; border-radius: 4px;
  cursor: pointer; color: #666; padding: 2px 8px; font-size: 13px;
}
#refreshBtn:hover { color: #f7931a; border-color: #f7931a; }
#ticker {
  display: none; padding: 5px 12px; gap: 6px; flex-wrap: wrap;
  background: #0b0906; border-bottom: 1px solid #1a1208;
  font-size: 10px; color: #777; align-items: center;
}
#content { padding: 12px; }
.section-title {
  font-size: 14px; font-weight: 700; color: #f7931a;
  margin-bottom: 14px; letter-spacing: 0.2px;
}
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
.card {
  background: #161616; border: 1px solid #222; border-radius: 8px;
  padding: 12px;
}
.card.wide { grid-column: 1 / -1; }
.card-label {
  font-size: 10px; color: #555; text-transform: uppercase;
  letter-spacing: 0.6px; margin-bottom: 6px;
}
.card-value { font-size: 20px; font-weight: 700; color: #f7931a; }
.card-value-sm { font-size: 12px; font-weight: 600; color: #c0c0c0; word-break: break-all; }
.pro-banner {
  background: linear-gradient(135deg, rgba(247,147,26,.07), rgba(247,147,26,.03));
  border: 1px solid rgba(247,147,26,.25); border-radius: 10px;
  padding: 12px 14px; margin-bottom: 14px;
}
.pro-banner-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
.pro-title { font-size: 12px; font-weight: 700; color: #f7931a; }
.pro-price {
  font-size: 9px; color: #f7931a; font-weight: 600;
  background: rgba(247,147,26,.1); border: 1px solid rgba(247,147,26,.2);
  border-radius: 4px; padding: 1px 7px;
}
.pro-features { font-size: 10px; color: #666; margin-bottom: 10px; line-height: 1.6; }
.pro-cta {
  display: block; text-align: center; background: #f7931a; color: #000;
  border-radius: 7px; padding: 7px; font-size: 11px; font-weight: 700;
  text-decoration: none; letter-spacing: 0.2px;
}
.pro-cta:hover { background: #ffa640; }
.chart-wrap { margin-bottom: 14px; }
.chart-top { display: flex; align-items: center; gap: 4px; margin-bottom: 7px; }
.chart-label { font-size: 10px; color: #555; text-transform: uppercase; letter-spacing: 0.5px; flex: 1; }
.rbtn {
  background: none; border: 1px solid #2a2a2a; border-radius: 4px;
  cursor: pointer; color: #555; padding: 1px 6px; font-size: 9px; font-weight: 600;
}
.rbtn.active { background: #f7931a; color: #000; border-color: #f7931a; }
.rbtn:hover:not(.active) { border-color: #f7931a; color: #f7931a; }
canvas { display: block; width: 100%; border-radius: 5px; }
.csv-btn {
  background: none; border: 1px solid #2a2a2a; border-radius: 4px;
  cursor: pointer; color: #555; padding: 1px 7px; font-size: 9px; font-weight: 600;
  margin-left: 4px;
}
.csv-btn:hover { border-color: #f7931a; color: #f7931a; }
table { width: 100%; border-collapse: collapse; }
th {
  text-align: left; padding: 6px 4px; color: #444;
  border-bottom: 1px solid #1e1e1e; font-size: 10px; text-transform: uppercase;
}
td { padding: 5px 4px; border-bottom: 1px solid #181818; font-size: 11px; color: #999; }
.sats { color: #f7931a; font-weight: 600; }
.empty-state { text-align: center; padding: 32px 12px; }
.empty-icon { font-size: 26px; opacity: .25; margin-bottom: 8px; }
.empty-text { color: #555; font-size: 11px; margin-bottom: 4px; }
.empty-sub { color: #444; font-size: 10px; }
.setup-box {
  background: #141414; border: 1px solid #f7931a; border-radius: 10px; padding: 18px;
}
.setup-box h3 { color: #f7931a; font-size: 14px; margin-bottom: 12px; }
.setup-box p { color: #999; font-size: 11px; line-height: 1.7; margin-bottom: 8px; }
.setup-box pre {
  background: #0d0d0d; border: 1px solid #222; border-radius: 6px;
  padding: 10px; font-size: 10px; color: #bbb; font-family: monospace;
  overflow-x: auto; margin: 6px 0 12px;
}
.setup-box .hint { font-size: 10px; color: #555; font-style: italic; }
.cfg-btn {
  width: 100%; padding: 10px; background: #f7931a; color: #000;
  border: none; border-radius: 8px; font-weight: 700; font-size: 13px;
  cursor: pointer; margin-bottom: 14px;
}
.cfg-btn:hover { background: #ffa640; }
.error-box {
  background: #140d0d; border: 1px solid #cc2222; border-radius: 10px; padding: 16px;
}
.error-box h3 { color: #ff4444; font-size: 13px; margin-bottom: 8px; }
.error-detail { font-size: 10px; color: #777; word-break: break-all; margin-bottom: 10px; }
.error-addr { font-size: 10px; color: #666; margin-bottom: 10px; }
.error-addr strong { color: #f7931a; }
.retry-btn {
  width: 100%; padding: 8px; background: #1a1a1a; color: #d0d0d0;
  border: 1px solid #333; border-radius: 6px; font-size: 12px; cursor: pointer;
}
.retry-btn:hover { background: #222; border-color: #444; }
.loading { text-align: center; padding: 44px 12px; color: #f7931a; font-size: 13px; }
</style>
</head>
<body>

<div id="topbar">
  <span style="font-size:10px;color:#444;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap">Lang</span>
  <select id="langSelect"></select>
  <button id="refreshBtn" title="Refresh">↺</button>
</div>

<div id="ticker"></div>
<div id="content"><div class="loading">⚡ Loading…</div></div>

<script>
(function () {
'use strict';

// ── constants ──────────────────────────────────────────────────────────
const ADDR = ${JSON.stringify(addr)};
const I18N = ${i18n};
const SB_URL = 'https://urcqtpklpfyvizcgcsia.supabase.co';
const SB_KEY = 'sb_publishable_v_dOX1JVgEm_vlT-Qr5lsw_EQHc-av-';
const LANG_LABELS = {
  en:'English', pt:'Português', es:'Español', zh:'中文',
  ja:'日本語', fr:'Français', de:'Deutsch', ru:'Русский',
  hi:'हिन्दी', ar:'العربية', it:'Italiano',
};

// ── state ──────────────────────────────────────────────────────────────
let lang = 'en';
let chartRange = '7D';
let lastRows = null;
let isPro = false;
let btcPrice = 0;

// ── vscode api ─────────────────────────────────────────────────────────
const vsc = (() => { try { return acquireVsCodeApi(); } catch(_) { return { postMessage: () => {} }; } })();

// ── helpers ────────────────────────────────────────────────────────────
function t(k) { return (I18N[lang] || I18N.en)[k] || I18N.en[k] || k; }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function el(id) { return document.getElementById(id); }
function setContent(html) {
  const c = el('content');
  if (c) c.innerHTML = html;
}

// ── topbar ─────────────────────────────────────────────────────────────
try {
  const savedLang = localStorage.getItem('sd_lang');
  if (savedLang && LANG_LABELS[savedLang]) lang = savedLang;
} catch(_) {}

const langSel = el('langSelect');
Object.keys(LANG_LABELS).forEach(code => {
  const o = document.createElement('option');
  o.value = code;
  o.textContent = LANG_LABELS[code] + ' (' + code.toUpperCase() + ')';
  langSel.appendChild(o);
});
langSel.value = lang;
langSel.addEventListener('change', function() {
  lang = this.value;
  try { localStorage.setItem('sd_lang', lang); } catch(_) {}
  if (lastRows !== null) renderContent(lastRows);
});

el('refreshBtn').addEventListener('click', load);

// ── chart ──────────────────────────────────────────────────────────────
function getBuckets(rows, range) {
  const now = new Date();
  let buckets, keyFn;
  if (range === '1D') {
    buckets = Array.from({length:24}, function(_,i) {
      const h = new Date(+now - (23-i)*3600000);
      return { key: h.toISOString().slice(0,13), label: String(h.getHours()).padStart(2,'0')+'h', val: 0 };
    });
    keyFn = function(r) { return r.paid_at ? r.paid_at.slice(0,13) : null; };
  } else if (range === '7D' || range === '30D') {
    const N = range === '7D' ? 7 : 30;
    buckets = Array.from({length:N}, function(_,i) {
      const d = new Date(now); d.setDate(d.getDate()-(N-1-i));
      const s = d.toISOString().slice(0,10);
      return { key: s, label: s.slice(5), val: 0 };
    });
    keyFn = function(r) { return r.paid_at ? r.paid_at.slice(0,10) : null; };
  } else if (range === '1Y') {
    buckets = Array.from({length:12}, function(_,i) {
      const d = new Date(now.getFullYear(), now.getMonth()-(11-i), 1);
      const s = d.toISOString().slice(0,7);
      return { key: s, label: s.slice(5), val: 0 };
    });
    keyFn = function(r) { return r.paid_at ? r.paid_at.slice(0,7) : null; };
  } else {
    const N = 7;
    buckets = Array.from({length:N}, function(_,i) {
      const d = new Date(now); d.setDate(d.getDate()-(N-1-i));
      const s = d.toISOString().slice(0,10);
      return { key: s, label: s.slice(5), val: 0 };
    });
    keyFn = function(r) { return r.paid_at ? r.paid_at.slice(0,10) : null; };
  }
  const bmap = {};
  buckets.forEach(function(b) { bmap[b.key] = b; });
  (rows || []).forEach(function(r) {
    const k = keyFn(r);
    if (k && bmap[k]) bmap[k].val += (r.amount_sats || 0);
  });
  return buckets;
}

function drawChart(rows, range) {
  const canvas = el('chart');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const parent = canvas.parentElement || canvas;
  const rect = parent.getBoundingClientRect();
  const cssW = Math.max(rect.width || 250, 100);
  const cssH = 100;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const W = cssW, H = cssH;
  const buckets = getBuckets(rows, range || chartRange);
  const N = buckets.length;
  const maxV = Math.max.apply(null, buckets.map(function(b) { return b.val; }));
  const gap = N > 20 ? 1 : 2;
  const barW = Math.max(2, Math.floor((W - 20) / N) - gap);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);
  const skip = N > 24 ? 4 : N > 12 ? 2 : 1;
  buckets.forEach(function(b, i) {
    const x = 10 + i * (barW + gap);
    const barH = b.val > 0 ? Math.max(3, Math.round((b.val / maxV) * (H - 22))) : 3;
    const y = H - barH - 14;
    ctx.fillStyle = b.val > 0 ? '#f7931a' : 'rgba(247,147,26,0.1)';
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, barW, barH, 2); } else { ctx.rect(x, y, barW, barH); }
    ctx.fill();
    if (i % skip === 0 || i === N - 1) {
      ctx.fillStyle = 'rgba(247,147,26,0.4)';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, x + barW / 2, H - 1);
    }
    if (b.val > 0) {
      ctx.fillStyle = '#f7931a';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      const label = b.val >= 1000 ? (b.val / 1000).toFixed(1) + 'k' : String(b.val);
      ctx.fillText(label, x + barW / 2, y - 3);
    }
  });
}

// ── render helpers ─────────────────────────────────────────────────────
function renderSetup() {
  setContent(
    '<div class="setup-box">' +
    '<h3>' + t('setupTitle') + '</h3>' +
    '<p>' + t('setupStep1') + '<br>' + t('setupStep2') + '</p>' +
    '<button class="cfg-btn" id="cfgBtn">⚡ Set Lightning Address</button>' +
    '<p>' + t('setupStep3') + '</p>' +
    '<pre>"shinydapps.lightningAddress": "you@blink.sv"</pre>' +
    '<p class="hint">' + t('setupHint') + '</p>' +
    '</div>'
  );
  const btn = el('cfgBtn');
  if (btn) btn.addEventListener('click', function() { vsc.postMessage({ command: 'openConfigure' }); });
}

function renderError(msg) {
  setContent(
    '<div class="error-box">' +
    '<h3>⚠ Connection Error</h3>' +
    '<p class="error-detail">' + esc(msg) + '</p>' +
    (ADDR ? '<p class="error-addr">Monitoring: <strong>' + esc(ADDR) + '</strong></p>' : '') +
    '<button class="retry-btn" id="retryBtn">↺ Retry</button>' +
    '</div>'
  );
  const btn = el('retryBtn');
  if (btn) btn.addEventListener('click', load);
}

function renderContent(rows) {
  lastRows = rows;
  const total = rows.reduce(function(s, r) { return s + (r.amount_sats || 0); }, 0);
  const usd = btcPrice > 0 ? ((total / 1e8) * btcPrice).toFixed(2) : (total * 0.00003).toFixed(2);

  let html = '<div class="section-title">' + t('title') + '</div>';

  // stat cards
  html += '<div class="grid">';
  html += '<div class="card"><div class="card-label">' + t('totalPayments') + '</div><div class="card-value">' + rows.length + '</div></div>';
  html += '<div class="card"><div class="card-label">' + t('totalSats') + '</div><div class="card-value">' + total.toLocaleString() + '</div></div>';
  html += '<div class="card"><div class="card-label">' + t('revenue') + '</div><div class="card-value" style="font-size:16px">$' + usd + '</div></div>';
  html += '<div class="card"><div class="card-label">' + t('btcPrice') + '</div><div class="card-value-sm" id="btcPriceEl">' + (btcPrice > 0 ? '$' + btcPrice.toLocaleString() : '…') + '</div></div>';
  html += '<div class="card wide"><div class="card-label">' + t('lightningAddr') + '</div><div class="card-value-sm">' + esc(ADDR) + '</div></div>';
  html += '</div>';

  // pro banner
  if (!isPro) {
    html += '<div class="pro-banner">';
    html += '<div class="pro-banner-top"><span class="pro-title">⚡ ShinyDapps Pro</span><span class="pro-price">9,000 sats / mo</span></div>';
    html += '<div class="pro-features">Full history · CSV export · Pay in Bitcoin · Cancel anytime</div>';
    html += '<a href="https://l402kit.vercel.app/checkout?address=' + encodeURIComponent(ADDR) + '&tier=pro" class="pro-cta" target="_blank">Upgrade with Bitcoin →</a>';
    html += '</div>';
  }

  // chart
  html += '<div class="chart-wrap">';
  html += '<div class="chart-top">';
  html += '<div class="chart-label">' + t('chartTitle') + '</div>';
  html += '<div>';
  ['1D','7D','30D','1Y','ALL'].forEach(function(r) {
    const lock = (r === '1Y' || r === 'ALL') && !isPro;
    html += '<button class="rbtn' + (r === chartRange ? ' active' : '') + '" data-r="' + r + '"' + (lock ? ' title="Pro only"' : '') + '>' + r + (lock ? ' 🔒' : '') + '</button>';
  });
  html += '</div>';
  if (isPro) html += '<button class="csv-btn" id="csvBtn">CSV</button>';
  html += '</div>';
  html += '<canvas id="chart"></canvas>';
  html += '</div>';

  // table
  html += '<table><tr><th>' + t('when') + '</th><th>' + t('endpoint') + '</th><th>' + t('sats') + '</th></tr>';
  if (rows.length === 0) {
    html += '<tr><td colspan="3"><div class="empty-state"><div class="empty-icon">⚡</div>' +
      '<div class="empty-text">' + t('noPayments') + '</div>' +
      '<div class="empty-sub">Your first satoshi is waiting</div></div></td></tr>';
  } else {
    rows.slice(0, 50).forEach(function(r) {
      html += '<tr><td>' + new Date(r.paid_at).toLocaleString() + '</td>' +
        '<td style="color:#c0c0c0">' + esc(r.endpoint || '—') + '</td>' +
        '<td class="sats">' + (r.amount_sats || 0) + '</td></tr>';
    });
  }
  html += '</table>';

  setContent(html);

  // wire up chart + buttons after DOM update
  requestAnimationFrame(function() {
    drawChart(rows, chartRange);

    // range buttons
    document.querySelectorAll('.rbtn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const r = btn.getAttribute('data-r');
        if ((r === '1Y' || r === 'ALL') && !isPro) {
          window.open('https://l402kit.vercel.app/checkout?address=' + encodeURIComponent(ADDR) + '&tier=pro', '_blank');
          return;
        }
        chartRange = r;
        document.querySelectorAll('.rbtn').forEach(function(b) {
          b.classList.toggle('active', b.getAttribute('data-r') === chartRange);
        });
        drawChart(lastRows, chartRange);
      });
    });

    // csv
    const csvBtn = el('csvBtn');
    if (csvBtn) {
      csvBtn.addEventListener('click', function() {
        const header = 'date,endpoint,sats\\n';
        const body = (lastRows || []).map(function(r) {
          return new Date(r.paid_at).toISOString() + ',' + (r.endpoint || '') + ',' + (r.amount_sats || 0);
        }).join('\\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([header + body], {type:'text/csv'}));
        a.download = 'payments.csv';
        a.click();
      });
    }

    // update btc price if already loaded
    const priceEl = el('btcPriceEl');
    if (priceEl && btcPrice > 0) priceEl.textContent = '$' + btcPrice.toLocaleString();

    // resize observer
    try {
      if (window._cRo) window._cRo.disconnect();
      window._cRo = new ResizeObserver(function() {
        if (lastRows !== null) drawChart(lastRows, chartRange);
      });
      const cw = document.querySelector('.chart-wrap');
      if (cw) window._cRo.observe(cw);
    } catch(_) {}
  });
}

// ── data fetching ──────────────────────────────────────────────────────
async function checkPro() {
  if (!ADDR) return;
  try {
    const r = await fetch('https://l402kit.vercel.app/api/pro-check?address=' + encodeURIComponent(ADDR));
    if (r.ok) { const d = await r.json(); isPro = d.pro === true; }
  } catch(_) {}
}

async function fetchBtcPrice() {
  try {
    const r = await fetch('https://mempool.space/api/v1/prices');
    if (!r.ok) return;
    const d = await r.json();
    btcPrice = d.USD || 0;
    if (btcPrice > 0) {
      const sat = btcPrice / 1e8;
      const ticker = el('ticker');
      if (ticker) {
        ticker.style.display = 'flex';
        ticker.innerHTML =
          '<span style="color:#f7931a">⚡</span>' +
          ' <strong style="color:#f7931a">BTC</strong> $' + btcPrice.toLocaleString() +
          ' <span style="color:#2a2a2a">·</span> 1 sat = <strong style="color:#c97000">$' + sat.toFixed(6) + '</strong>' +
          ' <span style="color:#2a2a2a">·</span> 1k sats = <strong style="color:#c97000">$' + (sat * 1000).toFixed(3) + '</strong>';
      }
      const priceEl = el('btcPriceEl');
      if (priceEl) priceEl.textContent = '$' + btcPrice.toLocaleString();
    }
  } catch(_) {}
}

async function load() {
  if (!ADDR) { renderSetup(); return; }
  setContent('<div class="loading">⚡ ' + t('loading') + '</div>');
  await checkPro();
  try {
    const res = await fetch(
      SB_URL + '/rest/v1/payments?owner_address=eq.' + encodeURIComponent(ADDR) + '&order=paid_at.desc&limit=500',
      { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }
    );
    if (!res.ok) {
      const body = await res.text().catch(function() { return ''; });
      throw new Error('HTTP ' + res.status + (body ? ': ' + body.slice(0, 120) : ''));
    }
    const rows = await res.json();
    renderContent(Array.isArray(rows) ? rows : []);
  } catch(e) {
    renderError(e && e.message ? e.message : 'Network error');
  }
}

// ── boot ───────────────────────────────────────────────────────────────
fetchBtcPrice();
load();

})(); // end IIFE
</script>
</body>
</html>`;
}
function deactivate() {
    if (pollInterval)
        clearInterval(pollInterval);
}
