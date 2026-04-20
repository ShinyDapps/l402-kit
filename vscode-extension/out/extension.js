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
};
class PaymentsDashboardProvider {
    constructor(context) {
        this.context = context;
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = getDashboardHtml(this.context);
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
            sidebarProvider?.refresh();
        }
    }));
    startPolling(context);
}
function startPolling(_context) {
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
function getDashboardHtml(_context) {
    const config = vscode.workspace.getConfiguration("shinydapps");
    const supabaseUrl = config.get("supabaseUrl") ?? "";
    const supabaseKey = config.get("supabaseKey") ?? "";
    const lightningAddress = config.get("lightningAddress") ?? "";
    const i18nJson = JSON.stringify(I18N);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --card: var(--vscode-sideBar-background);
    --border: var(--vscode-panel-border);
    --muted: var(--vscode-descriptionForeground);
    --accent: #f7931a;
    --btn: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
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
  .lang-sel { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; }
  .lang-btn { background: none; border: 1px solid transparent; border-radius: 4px; cursor: pointer; color: var(--fg); padding: 2px 5px; font-size: 11px; opacity: 0.6; }
  .lang-btn.active { border-color: var(--accent); opacity: 1; color: var(--accent); font-weight: 600; }
  .theme-sel { display: flex; gap: 3px; }
  .theme-btn { background: none; border: 1px solid transparent; border-radius: 4px; cursor: pointer; color: var(--muted); padding: 2px 6px; font-size: 11px; }
  .theme-btn.active { border-color: var(--border); color: var(--fg); background: var(--card); }
  .content { padding: 12px; }
  h2 { font-size: 14px; font-weight: 700; margin-bottom: 12px; color: var(--accent); }
  .cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
  .card-wide { grid-column: 1 / -1; }
  .label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .value { font-size: 20px; font-weight: 700; color: var(--accent); }
  .value-sm { font-size: 12px; font-weight: 600; word-break: break-all; color: var(--fg); }
  .chart-wrap { margin-bottom: 14px; }
  .chart-title { font-size: 10px; color: var(--muted); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px; }
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
</style>
</head>
<body>
<div class="topbar">
  <div class="lang-sel" id="langSel"></div>
  <div class="theme-sel" id="themeSel"></div>
</div>
<div class="content" id="content"></div>

<script>
const SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
const SUPABASE_KEY = ${JSON.stringify(supabaseKey)};
const LIGHTNING_ADDRESS = ${JSON.stringify(lightningAddress)};
const I18N = ${i18nJson};

let lang = 'en';
let theme = 'auto';

const LANGS = [
  { code: 'en', label: '🇺🇸' },
  { code: 'pt', label: '🇧🇷' },
  { code: 'es', label: '🇪🇸' },
  { code: 'zh', label: '🇨🇳' },
  { code: 'ja', label: '🇯🇵' },
];

function t(key) { return (I18N[lang] || I18N.en)[key] || key; }

function applyTheme(th) {
  theme = th;
  document.documentElement.setAttribute('data-theme', th === 'auto' ? '' : th);
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.th === th);
  });
}

function buildTopbar() {
  const langSel = document.getElementById('langSel');
  langSel.innerHTML = LANGS.map(l =>
    '<button class="lang-btn' + (l.code === lang ? ' active' : '') + '" data-lang="' + l.code + '">' + l.label + '</button>'
  ).join('');
  langSel.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      lang = btn.dataset.lang;
      langSel.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
      renderContent(lastData);
    });
  });

  const themeSel = document.getElementById('themeSel');
  themeSel.innerHTML = [
    { code: 'auto', icon: '⬡' },
    { code: 'light', icon: '☀️' },
    { code: 'dark', icon: '🌙' },
  ].map(th =>
    '<button class="theme-btn' + (th.code === theme ? ' active' : '') + '" data-th="' + th.code + '">' + th.icon + '</button>'
  ).join('');
  themeSel.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.th));
  });
}

function renderSetup() {
  document.getElementById('content').innerHTML = '<div class="setup">' +
    '<h3>' + t('setupTitle') + '</h3>' +
    '<p>' + t('setupStep1') + '<br><span class="hint">' + t('setupHint') + '</span></p>' +
    '<p>' + t('setupStep2') + '</p>' +
    '<p>' + t('setupStep3') + '</p>' +
    '<pre>"shinydapps.lightningAddress": "you@blink.sv",\n"shinydapps.supabaseUrl": "https://xxxx.supabase.co",\n"shinydapps.supabaseKey": "your-anon-key"</pre>' +
    '<p style="margin-top:10px;font-size:10px;color:var(--muted)">ℹ️ Get Supabase keys at <code>supabase.com</code> → Project → Settings → API</p>' +
    '</div>';
}

let lastData = null;

function drawChart(rows) {
  const canvas = document.getElementById('chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const satsPerDay = {};
  days.forEach(d => satsPerDay[d] = 0);
  (rows || []).forEach(r => {
    const d = r.paid_at ? r.paid_at.slice(0, 10) : null;
    if (d && satsPerDay[d] !== undefined) satsPerDay[d] += r.amount_sats || 0;
  });

  const values = days.map(d => satsPerDay[d]);
  const maxVal = Math.max(...values, 1);
  const barW = Math.floor((W - 20) / 7) - 4;
  const isDark = document.documentElement.getAttribute('data-theme') === 'light' ? false : true;

  const bg = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#252526';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  values.forEach((v, i) => {
    const x = 10 + i * (barW + 4);
    const barH = Math.round((v / maxVal) * (H - 28));
    const y = H - barH - 18;
    const alpha = v > 0 ? 1 : 0.25;
    ctx.fillStyle = 'rgba(247,147,26,' + alpha + ')';
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 3);
    ctx.fill();

    ctx.fillStyle = 'rgba(247,147,26,0.7)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    const label = days[i].slice(5);
    ctx.fillText(label, x + barW / 2, H - 4);

    if (v > 0) {
      ctx.fillStyle = '#f7931a';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(v >= 1000 ? (v/1000).toFixed(1)+'k' : v, x + barW / 2, y - 3);
    }
  });
}

function renderContent(rows) {
  lastData = rows;
  if (!rows) { renderSetup(); return; }

  const total = rows.reduce((s, r) => s + (r.amount_sats || 0), 0);
  const usd = (total * 0.00003).toFixed(2);

  const content = document.getElementById('content');
  content.innerHTML =
    '<h2>' + t('title') + '</h2>' +
    '<div class="cards">' +
      '<div class="card"><div class="label">' + t('totalPayments') + '</div><div class="value" id="cnt">' + rows.length + '</div></div>' +
      '<div class="card"><div class="label">' + t('totalSats') + '</div><div class="value">' + total.toLocaleString() + '</div></div>' +
      '<div class="card"><div class="label">' + t('revenue') + '</div><div class="value" style="font-size:16px">$' + usd + '</div></div>' +
      '<div class="card"><div class="label">' + t('lightningAddr') + '</div><div class="value-sm">' + (LIGHTNING_ADDRESS || t('notSet')) + '</div></div>' +
    '</div>' +
    '<div class="chart-wrap">' +
      '<div class="chart-title">' + t('chartTitle') + '</div>' +
      '<canvas id="chart" width="280" height="100"></canvas>' +
    '</div>' +
    '<table>' +
      '<tr><th>' + t('when') + '</th><th>' + t('endpoint') + '</th><th>' + t('sats') + '</th></tr>' +
      '<tbody>' + (rows.length === 0
        ? '<tr><td colspan="3" class="empty">' + t('noPayments') + '</td></tr>'
        : rows.slice(0, 50).map(r =>
            '<tr><td>' + new Date(r.paid_at).toLocaleString() + '</td><td>' + (r.endpoint || '—') + '</td><td class="sats-badge">' + (r.amount_sats || 0) + '</td></tr>'
          ).join('')
      ) + '</tbody>' +
    '</table>';

  requestAnimationFrame(() => drawChart(rows));
}

async function load() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !LIGHTNING_ADDRESS) {
    renderSetup();
    return;
  }
  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/payments?owner_address=eq.' + encodeURIComponent(LIGHTNING_ADDRESS) + '&order=paid_at.desc&limit=200',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    renderContent(Array.isArray(rows) ? rows : []);
  } catch(e) {
    renderContent([]);
  }
}

buildTopbar();
load();
</script>
</body>
</html>`;
}
function deactivate() {
    if (pollInterval)
        clearInterval(pollInterval);
}
