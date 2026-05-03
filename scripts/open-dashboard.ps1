# Gera o dashboard live em Temp e abre no browser
$html = @'
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>l402-kit Dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0a0a;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh;padding:32px 24px}
  h1{font-size:20px;font-weight:700;color:#fff;margin-bottom:4px}
  .sub{color:#555;font-size:13px;margin-bottom:32px}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}
  .kpi{background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:20px}
  .kpi-label{font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
  .kpi-value{font-size:28px;font-weight:700;color:#fff}
  .kpi-value.orange{color:#ffa033}
  .kpi-value.green{color:#2ddc6e}
  .section{background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:20px;margin-bottom:16px}
  .section h2{font-size:13px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:#555;font-weight:500;padding:0 0 10px;border-bottom:1px solid #1e1e1e}
  td{padding:10px 0;border-bottom:1px solid #111;color:#ccc}
  td.sats{color:#ffa033;font-weight:600}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
  .badge-ok{background:#0d2b0d;color:#2ddc6e}
  .err{color:#ff6b6b;font-size:13px;padding:20px 0}
  .owner-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #1a1a1a}
  .owner-addr{font-size:12px;color:#888;font-family:monospace}
  .owner-sats{color:#ffa033;font-weight:700}
  .ts{color:#444;font-size:11px}
  .logo{color:#ffa033;font-size:18px;margin-right:8px}
  .header{display:flex;align-items:center;margin-bottom:4px}
  .live-dot{width:7px;height:7px;background:#2ddc6e;border-radius:50%;margin-right:6px;animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  .period-tabs{display:flex;gap:6px;margin-bottom:20px}
  .ptab{background:#1a1a1a;border:1px solid #222;border-radius:6px;padding:5px 14px;font-size:12px;color:#666;cursor:pointer}
  .ptab.active{background:#ffa03320;border-color:#ffa033;color:#ffa033}
</style>
</head>
<body>
<div class="header"><span class="logo">&#9889;</span><h1>l402-kit Dashboard</h1></div>
<div class="sub" id="sub"><span class="live-dot" style="display:inline-block;vertical-align:middle"></span> Conectando à API live...</div>

<div id="app" style="display:none">
  <div class="period-tabs">
    <button class="ptab active" onclick="setPeriod(7,this)">7 dias</button>
    <button class="ptab" onclick="setPeriod(30,this)">30 dias</button>
    <button class="ptab" onclick="setPeriod(0,this)">Tudo</button>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Pagamentos</div><div class="kpi-value orange" id="kpiPay">-</div></div>
    <div class="kpi"><div class="kpi-label">Total Recebido</div><div class="kpi-value green" id="kpiSats">-</div></div>
    <div class="kpi"><div class="kpi-label">Fee Coletado</div><div class="kpi-value" id="kpiFee">-</div></div>
    <div class="kpi"><div class="kpi-label">Devs Ativos</div><div class="kpi-value" id="kpiDevs">-</div></div>
  </div>
  <div class="section">
    <h2>Ultimos Pagamentos</h2>
    <table><thead><tr><th>Quando</th><th>Owner</th><th>Sats</th><th>Status</th></tr></thead>
    <tbody id="tRecent"></tbody></table>
  </div>
  <div class="section">
    <h2>Por Owner</h2>
    <div id="byOwner"></div>
  </div>
</div>
<div id="err" class="err"></div>

<script>
const SECRET = "shdp_dash_mK9pL2xQwRtNvJ4eHcBfUu3YsA7dZiXo";
const API = "https://l402kit.com/api/stats";
let allData = null;
let activePeriod = 7;

function ago(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return Math.round(diff) + "s atras";
  if (diff < 3600) return Math.round(diff/60) + "min atras";
  if (diff < 86400) return Math.round(diff/3600) + "h atras";
  return Math.round(diff/86400) + "d atras";
}

function setPeriod(d, btn) {
  activePeriod = d;
  document.querySelectorAll(".ptab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  if (allData) render(allData);
}

function filterByPeriod(rows, days) {
  if (!days) return rows;
  const cutoff = Date.now() - days * 86400000;
  return rows.filter(r => new Date(r.created_at) >= cutoff);
}

function render(data) {
  const rows = filterByPeriod(data.recent || [], activePeriod);
  const sats = activePeriod === 0 ? data.totalSats : rows.reduce((s,r) => s+r.amount_sats,0);
  const count = activePeriod === 0 ? data.totalPayments : rows.length;

  document.getElementById("kpiPay").textContent = count.toLocaleString("pt-BR");
  document.getElementById("kpiSats").textContent = sats.toLocaleString("pt-BR") + " sats";
  document.getElementById("kpiFee").textContent = Math.round(sats * 0.003).toLocaleString("pt-BR") + " sats";

  const ownerEntries = Object.entries(data.byOwner || {});
  document.getElementById("kpiDevs").textContent = ownerEntries.length;

  document.getElementById("tRecent").innerHTML = rows.slice(0,10).map(r =>
    "<tr><td class='ts'>" + ago(r.created_at) + "</td><td class='owner-addr'>" + (r.owner_address||"-") + "</td><td class='sats'>" + r.amount_sats + "</td><td><span class='badge badge-ok'>pago</span></td></tr>"
  ).join("") || "<tr><td colspan='4' style='color:#444;padding:20px 0'>Sem pagamentos neste periodo</td></tr>";

  document.getElementById("byOwner").innerHTML = ownerEntries
    .sort((a,b) => b[1].sats - a[1].sats)
    .map(function(entry) {
      var addr = entry[0]; var d = entry[1];
      return "<div class='owner-row'><span class='owner-addr'>" + addr + "</span><span class='owner-sats'>" + (d.sats||0).toLocaleString("pt-BR") + " sats (" + d.count + " calls)</span></div>";
    }).join("") || "<div style='color:#444;font-size:13px;padding:12px 0'>Sem dados</div>";
}

async function load() {
  try {
    const res = await fetch(API, { headers: { "x-dashboard-secret": SECRET } });
    if (!res.ok) { document.getElementById("err").textContent = "Erro " + res.status + " - secret invalido?"; return; }
    allData = await res.json();
    document.getElementById("sub").innerHTML = "<span style='color:#2ddc6e'>&#9679; Live</span> <span style='color:#444;font-size:12px'>shinydapps@blink.sv - atualizado " + new Date().toLocaleTimeString("pt-BR") + "</span>";
    document.getElementById("app").style.display = "block";
    render(allData);
  } catch(e) {
    document.getElementById("err").textContent = "Erro de rede: " + e.message;
  }
}

load();
setInterval(load, 60000);
</script>
</body>
</html>
'@

$dest = "$env:TEMP\l402-dashboard-live.html"
$html | Out-File -FilePath $dest -Encoding utf8
Start-Process $dest
Write-Host "Dashboard aberto em: $dest"
