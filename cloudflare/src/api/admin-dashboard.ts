import type { Env } from "../worker";

/**
 * /admin — VERITY board interface.
 *
 * VERITY tem vida própria (treasury, pricing dinâmico, RADAR, fiscal agent,
 * earn-first gate). Este dashboard é INTERFACE DE OBSERVAÇÃO, não admin SaaS:
 *   - mostra o que VERITY decidiu (read-mostly)
 *   - sinaliza quando precisa de humano (action queue)
 *   - registra ações humanas como eventos auditáveis
 *
 * Auth: cookie HttpOnly assinado com HMAC-SHA256(DASHBOARD_SECRET).
 */

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 60 * 60 * 1000; // 1h

// ─── Cookie signing (HMAC-SHA256 over `expiresAt`) ───────────────────────────

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function signSessionCookie(secret: string, expiresAt: number): Promise<string> {
  const payload = String(expiresAt);
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifySessionCookie(
  secret: string,
  cookie: string,
): Promise<{ ok: true; expiresAt: number } | { ok: false }> {
  const parts = cookie.split(".");
  if (parts.length !== 2) return { ok: false };
  const [payload, sig] = parts;
  const expected = await hmac(secret, payload);
  if (sig !== expected) return { ok: false };
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { ok: false };
  return { ok: true, expiresAt };
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("Cookie") ?? "";
  const part = header.split(";").map(s => s.trim()).find(s => s.startsWith(`${name}=`));
  return part ? part.substring(name.length + 1) : null;
}

async function isAuthed(req: Request, env: Env): Promise<boolean> {
  const c = readCookie(req, COOKIE_NAME);
  if (!c) return false;
  const v = await verifySessionCookie(env.DASHBOARD_SECRET, c);
  return v.ok;
}

// ─── POST /admin/login ───────────────────────────────────────────────────────

export async function handleAdminLogin(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({})) as { secret?: string };
  if (!body.secret || body.secret !== env.DASHBOARD_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const cookie = await signSessionCookie(env.DASHBOARD_SECRET, expiresAt);
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set(
    "Set-Cookie",
    `${COOKIE_NAME}=${cookie}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  );
  return new Response(JSON.stringify({ ok: true, expiresAt }), { status: 200, headers });
}

// ─── POST /admin/logout ──────────────────────────────────────────────────────

export async function handleAdminLogout(_req: Request): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0`);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

// ─── GET /admin/data — aggregated state ──────────────────────────────────────

export async function handleAdminData(req: Request, env: Env): Promise<Response> {
  if (!(await isAuthed(req, env))) return json({ error: "Unauthorized" }, 401);

  const today = new Date().toISOString().slice(0, 10);
  const [fiscalRaw, hotHumanRaw, hotAgentRaw, alertsRaw, servicesRaw] = await Promise.all([
    env.demo_preimages.get(`verity_fiscal:${today}`),
    env.demo_preimages.get("verity_radar:pending:human:hot"),
    env.demo_preimages.get("verity_radar:pending:agent:hot"),
    env.demo_preimages.get("verity_alerts"),
    env.demo_preimages.get("verity_services_cache").catch(() => null),
  ]);

  const fiscal = safeJson<{ gross_sats?: number; cogs_sats?: number; net_sats?: number; calls?: number }>(fiscalRaw) ?? {};
  const hotHuman = safeJson<unknown[]>(hotHumanRaw) ?? [];
  const hotAgent = safeJson<unknown[]>(hotAgentRaw) ?? [];
  const alerts = safeJson<unknown[]>(alertsRaw) ?? [];

  const receita_hoje_sats = typeof fiscal.net_sats === "number" ? fiscal.net_sats : 0;
  const calls_hoje = typeof fiscal.calls === "number" ? fiscal.calls : 0;
  const hot_total = hotHuman.length + hotAgent.length;
  const needs_human = hot_total > 0 || alerts.length > 0;

  return json({
    header: {
      status: needs_human ? "needs_attention" : "ok",
      receita_hoje_sats,
      calls_hoje,
      today,
    },
    action_queue: {
      hot_leads: [...hotHuman, ...hotAgent],
      alerts,
    },
    services_cache: servicesRaw ? safeJson(servicesRaw) : null,
  });
}

// ─── GET /admin — HTML (login form or dashboard) ─────────────────────────────

export async function handleAdminDashboard(req: Request, env: Env): Promise<Response> {
  const authed = await isAuthed(req, env);
  const body = authed ? dashboardHtml() : loginHtml();
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── HTML ────────────────────────────────────────────────────────────────────

function loginHtml(): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>VERITY · login</title>
<style>
  body{background:#0a0a0a;color:#e8e8e8;font:14px/1.5 ui-monospace,monospace;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .box{background:#141414;border:1px solid #2a2a2a;border-radius:8px;padding:32px;width:340px}
  h1{margin:0 0 4px;font-size:18px;color:#ffa033}
  p{color:#888;font-size:12px;margin:0 0 20px}
  input{width:100%;box-sizing:border-box;background:#0a0a0a;border:1px solid #2a2a2a;color:#e8e8e8;padding:10px;border-radius:4px;font:inherit;margin-bottom:12px}
  button{width:100%;background:#ffa033;color:#000;border:0;padding:10px;border-radius:4px;font:600 14px/1 ui-monospace,monospace;cursor:pointer}
  button:hover{background:#ffb866}
  .err{color:#ff6b6b;font-size:12px;margin-top:8px;min-height:1em}
</style></head><body>
<form class="box" onsubmit="return login(event)">
  <h1>VERITY board</h1>
  <p>Dashboard de observação. Não admin.</p>
  <input id="secret" type="password" placeholder="DASHBOARD_SECRET" autofocus required>
  <button type="submit">Enter</button>
  <div class="err" id="err"></div>
</form>
<script>
async function login(e){
  e.preventDefault();
  const secret = document.getElementById('secret').value;
  const err = document.getElementById('err');
  err.textContent = '';
  try {
    const r = await fetch('/admin/login', { method:'POST', body: JSON.stringify({ secret }) });
    if (r.ok) location.reload();
    else err.textContent = 'Invalid secret.';
  } catch(_){ err.textContent = 'Network error.'; }
  return false;
}
</script>
</body></html>`;
}

function dashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>VERITY board</title>
<style>
  :root{--bg:#0a0a0a;--panel:#141414;--line:#2a2a2a;--text:#e8e8e8;--mute:#888;--orange:#ffa033;--green:#2ddc6e;--violet:#b89dff;--red:#ff6b6b}
  body{background:var(--bg);color:var(--text);font:14px/1.5 ui-monospace,monospace;margin:0;padding:24px;max-width:1100px;margin:0 auto}
  header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:24px}
  h1{margin:0;font-size:18px;color:var(--orange)}
  h1 .pulse{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);margin-right:8px;animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  h1 .pulse.warn{background:var(--orange)}
  h1 .pulse.bad{background:var(--red);animation:pulse 0.6s infinite}
  .meta{color:var(--mute);font-size:12px;text-align:right}
  .meta b{color:var(--text)}
  .meta a{color:var(--mute);text-decoration:none;border-bottom:1px dotted var(--mute)}
  section{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px;margin-bottom:16px}
  section h2{margin:0 0 12px;font-size:13px;color:var(--violet);text-transform:uppercase;letter-spacing:.5px}
  .empty{color:var(--mute);font-style:italic;font-size:13px}
  .item{padding:10px 0;border-bottom:1px solid var(--line)}
  .item:last-child{border-bottom:0}
  .item .label{color:var(--mute);font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
  .item a{color:var(--orange);text-decoration:none}
  .item a:hover{text-decoration:underline}
  .item .snippet{color:var(--mute);font-size:12px;margin-top:4px}
  .btn{display:inline-block;background:transparent;border:1px solid var(--line);color:var(--mute);padding:4px 10px;border-radius:4px;font:11px ui-monospace,monospace;cursor:pointer;margin-top:6px;margin-right:4px}
  .btn:hover{border-color:var(--orange);color:var(--orange)}
  .badge{display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;text-transform:uppercase;margin-left:6px}
  .badge.hot{background:rgba(255,107,107,.15);color:var(--red)}
  .badge.warm{background:rgba(255,160,51,.15);color:var(--orange)}
  .badge.budget_low{background:rgba(255,160,51,.15);color:var(--orange)}
  .badge.budget_exhausted{background:rgba(255,107,107,.15);color:var(--red)}
  .badge.payment_failed{background:rgba(255,107,107,.15);color:var(--red)}
  .footer-note{color:var(--mute);font-size:11px;text-align:center;margin-top:32px;font-style:italic}
</style></head>
<body>
<header>
  <h1><span class="pulse" id="pulse"></span>VERITY está VIVA</h1>
  <div class="meta">
    <div>Receita hoje · <b id="receita">—</b> sats · <span id="calls">—</span> calls</div>
    <div id="today">—</div>
    <div><a href="#" onclick="logout();return false">logout</a></div>
  </div>
</header>

<section>
  <h2>Action queue — onde VERITY pede humano</h2>
  <div id="action-queue"><div class="empty">Loading…</div></div>
</section>

<section>
  <h2>Observação — o que VERITY está fazendo</h2>
  <div id="observation"><div class="empty">Em breve: feed combinado RADAR + fiscal + pricing.</div></div>
</section>

<p class="footer-note">VERITY decide sozinha. Você só intervém quando ela pede ou quando algo trava.</p>

<script>
async function load(){
  try {
    const r = await fetch('/admin/data');
    if (r.status === 401){ location.reload(); return; }
    const d = await r.json();
    render(d);
  } catch(e){ /* silent */ }
}

function fmt(n){ return n == null ? '—' : Number(n).toLocaleString('en-US'); }

function render(d){
  document.getElementById('receita').textContent = fmt(d.header.receita_hoje_sats);
  document.getElementById('calls').textContent = fmt(d.header.calls_hoje);
  document.getElementById('today').textContent = d.header.today;
  const pulse = document.getElementById('pulse');
  pulse.className = 'pulse' + (d.header.status === 'needs_attention' ? ' warn' : '');

  const q = document.getElementById('action-queue');
  const leads = d.action_queue.hot_leads || [];
  const alerts = d.action_queue.alerts || [];
  if (!leads.length && !alerts.length){
    q.innerHTML = '<div class="empty">Nada pendente. VERITY tocando sozinha.</div>';
    return;
  }
  let html = '';
  for (const a of alerts){
    html += '<div class="item">' +
      '<div class="label">Alerta <span class="badge ' + escape(a.type) + '">' + escape(a.type) + '</span></div>' +
      '<div>' + escape(a.message || '') + '</div>' +
      '<button class="btn" onclick="clearAlert(' + JSON.stringify(a.key) + ')">limpar</button>' +
      '</div>';
  }
  for (const l of leads){
    const ring = l.persona === 'human' ? 'humano' : 'agente';
    html += '<div class="item">' +
      '<div class="label">Hot lead <span class="badge hot">' + ring + '</span></div>' +
      '<div><a href="' + escape(l.url) + '" target="_blank" rel="noopener">' + escape(l.title || l.url) + '</a></div>' +
      (l.snippet ? '<div class="snippet">' + escape(l.snippet) + '</div>' : '') +
      (l.outreach_draft ? '<div class="snippet">Draft: ' + escape((l.outreach_draft.body||'').slice(0,200)) + '…</div>' : '') +
      '<button class="btn" onclick="dismissLead(' + JSON.stringify(l.persona) + ',' + JSON.stringify(l.url) + ')">encerrar</button>' +
      '</div>';
  }
  q.innerHTML = html;
}

function escape(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function clearAlert(key){
  await fetch('/api/verity/admin/alerts', { method:'DELETE', headers:{'Content-Type':'application/json','x-dashboard-secret': prompt('Confirm with DASHBOARD_SECRET:') || ''}, body: JSON.stringify({ key }) });
  load();
}

async function dismissLead(persona, url){
  const queue = persona + '_hot';
  await fetch('/api/verity/admin/radar/lead', { method:'DELETE', headers:{'Content-Type':'application/json','x-dashboard-secret': prompt('Confirm with DASHBOARD_SECRET:') || ''}, body: JSON.stringify({ queue, url }) });
  load();
}

async function logout(){
  await fetch('/admin/logout', { method:'POST' });
  location.reload();
}

load();
setInterval(load, 30000);
</script>
</body></html>`;
}
