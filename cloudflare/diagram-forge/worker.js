/**
 * forge.l402kit.com — Diagram Forge reverse-proxy Worker
 *
 * - GET / → serves the Diagram Forge landing HTML
 * - Everything else → proxied to RAILWAY_URL (set in Worker env)
 *
 * Set RAILWAY_URL = https://xxx.up.railway.app once deployed.
 */

const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Diagram Forge — AI Architecture Diagrams</title>
<meta name="description" content="Paste any GitHub URL. Claude analyzes the architecture, generates an animated diagram with official logos — pay per analysis via Lightning."/>
<meta property="og:title" content="Diagram Forge — AI Architecture Diagrams"/>
<meta property="og:description" content="AI-generated living architecture diagrams. Pay per use via Lightning ⚡"/>
<meta property="og:url" content="https://forge.l402kit.com"/>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg:#0D1117; --bg2:#161B22; --bg3:#1C2128;
  --border:rgba(255,255,255,0.08); --border-h:rgba(255,255,255,0.18);
  --text:#E6EDF3; --muted:#768390;
  --accent:#7C3AED; --accent2:#A855F7; --green:#22C55E;
  --font:'Inter','Segoe UI',system-ui,sans-serif;
  --mono:'JetBrains Mono','Fira Code','Consolas',monospace;
}
html,body { min-height:100vh; background:var(--bg); color:var(--text); font-family:var(--font); -webkit-font-smoothing:antialiased; }
body::before {
  content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
  background-image:
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,58,237,0.18) 0%, transparent 70%),
    radial-gradient(ellipse 40% 30% at 85% 60%, rgba(168,85,247,0.10) 0%, transparent 60%);
}
nav {
  position:fixed; top:0; left:0; right:0; z-index:50;
  height:56px; display:flex; align-items:center; padding:0 28px;
  background:rgba(13,17,23,0.80); backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border);
}
.nav-logo { display:flex; align-items:center; gap:9px; text-decoration:none; }
.nav-logo-mark {
  width:32px; height:32px; border-radius:8px;
  background:linear-gradient(135deg,var(--accent),var(--accent2));
  display:flex; align-items:center; justify-content:center;
  font-size:16px; box-shadow:0 0 20px rgba(124,58,237,0.35);
}
.nav-logo-text { font-size:15px; font-weight:700; letter-spacing:-0.02em;
  background:linear-gradient(135deg,#fff 40%,var(--accent2));
  -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.nav-right { margin-left:auto; display:flex; align-items:center; gap:12px; }
.btn-gh {
  font-size:12px; font-weight:600; padding:6px 12px; border-radius:8px; border:1px solid var(--border-h);
  background:var(--bg2); color:var(--text); cursor:pointer; display:flex; align-items:center; gap:6px;
  text-decoration:none; transition:background .15s, border-color .15s;
}
.btn-gh:hover { background:var(--bg3); border-color:rgba(255,255,255,0.25); }
.btn-gh svg { width:16px; height:16px; fill:currentColor; flex-shrink:0; }
.gh-user { font-size:12px; color:var(--muted); display:flex; align-items:center; gap:6px; }
.gh-avatar { width:22px; height:22px; border-radius:50%; border:1px solid var(--border); }
.repo-select {
  width:100%; background:var(--bg3); border:1.5px solid var(--border); border-radius:12px;
  color:var(--text); font-size:13px; font-family:var(--font); padding:13px 14px;
  outline:none; cursor:pointer; transition:border-color .15s, box-shadow .15s; margin-bottom:12px;
}
.repo-select:focus { border-color:var(--accent2); box-shadow:0 0 0 3px rgba(168,85,247,0.15); }
#repo-row { display:none; }
.nav-pill {
  font-size:11px; font-weight:600; padding:4px 10px; border-radius:20px;
  background:rgba(34,197,94,0.12); color:var(--green); border:1px solid rgba(34,197,94,0.25);
  display:flex; align-items:center; gap:5px;
}
.nav-pill-dot { width:6px; height:6px; border-radius:50%; background:var(--green); animation:pulse-g 2s ease-in-out infinite; }
@keyframes pulse-g { 0%,100%{opacity:1} 50%{opacity:0.3} }
.nav-link { font-size:13px; color:var(--muted); text-decoration:none; transition:color .15s; }
.nav-link:hover { color:var(--text); }
.hero {
  position:relative; z-index:1;
  display:flex; flex-direction:column; align-items:center;
  padding:140px 24px 80px; text-align:center;
}
.hero-badge {
  display:inline-flex; align-items:center; gap:7px;
  font-size:12px; font-weight:600; padding:5px 14px;
  border-radius:20px; border:1px solid rgba(124,58,237,0.35);
  background:rgba(124,58,237,0.10); color:var(--accent2);
  margin-bottom:28px; letter-spacing:0.02em;
}
h1 {
  font-size:clamp(36px,6vw,68px); font-weight:800;
  letter-spacing:-0.04em; line-height:1.05;
  max-width:800px; margin-bottom:20px;
}
h1 span { background:linear-gradient(135deg,var(--accent2) 0%,#60A5FA 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.hero-sub { font-size:clamp(15px,2vw,19px); color:var(--muted); max-width:560px; line-height:1.65; margin-bottom:48px; }
.card {
  width:100%; max-width:640px;
  background:var(--bg2); border:1px solid var(--border);
  border-radius:20px; overflow:hidden;
  box-shadow:0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
}
.card-header { padding:20px 24px 0; display:flex; gap:6px; align-items:center; }
.card-dot { width:12px; height:12px; border-radius:50%; }
.card-title { margin-left:8px; font-size:12px; color:var(--muted); font-family:var(--mono); }
.card-body { padding:24px; }
.tier-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:20px; }
.tier-btn {
  padding:12px 8px; border-radius:12px; border:1.5px solid var(--border);
  background:var(--bg3); cursor:pointer; text-align:center;
  transition:border-color .15s, background .15s, box-shadow .15s;
  position:relative; overflow:hidden;
}
.tier-btn:hover { border-color:var(--border-h); }
.tier-btn.selected { border-color:var(--accent2); background:rgba(124,58,237,0.12); box-shadow:0 0 0 1px rgba(168,85,247,0.2); }
.tier-check { position:absolute; top:7px; right:8px; width:16px; height:16px; border-radius:50%; background:var(--accent2); display:none; align-items:center; justify-content:center; font-size:10px; }
.tier-btn.selected .tier-check { display:flex; }
.tier-name { font-size:13px; font-weight:700; margin-bottom:3px; }
.tier-sats { font-size:11px; color:var(--muted); font-family:var(--mono); }
.tier-desc { font-size:10px; color:var(--muted); margin-top:5px; line-height:1.4; }
.input-label { font-size:12px; font-weight:600; color:var(--muted); margin-bottom:8px; letter-spacing:0.04em; text-transform:uppercase; }
.input-wrap { position:relative; margin-bottom:12px; }
.input-icon { position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:16px; pointer-events:none; }
input[type=text], input[type=url] {
  width:100%; background:var(--bg3); border:1.5px solid var(--border);
  border-radius:12px; color:var(--text); font-size:14px; font-family:var(--font);
  padding:13px 14px 13px 42px; outline:none;
  transition:border-color .15s, box-shadow .15s;
}
input[type=text]:focus, input[type=url]:focus { border-color:var(--accent2); box-shadow:0 0 0 3px rgba(168,85,247,0.15); }
input::placeholder { color:var(--muted); }
.input-or { text-align:center; font-size:12px; color:var(--muted); position:relative; margin:12px 0; }
.input-or::before, .input-or::after { content:''; position:absolute; top:50%; width:43%; height:1px; background:var(--border); }
.input-or::before { left:0; } .input-or::after { right:0; }
.btn-submit {
  width:100%; padding:15px; border-radius:12px; border:none;
  background:linear-gradient(135deg,var(--accent),var(--accent2));
  color:#fff; font-size:15px; font-weight:700;
  cursor:pointer; display:flex; align-items:center; justify-content:center; gap:9px;
  transition:opacity .15s, transform .1s, box-shadow .15s;
  box-shadow:0 4px 20px rgba(124,58,237,0.35);
  position:relative; overflow:hidden;
}
.btn-submit:hover { opacity:.92; box-shadow:0 8px 32px rgba(124,58,237,0.45); }
.btn-submit:active { transform:scale(0.985); }
.btn-submit:disabled { opacity:.5; cursor:not-allowed; transform:none; }
.btn-submit-shimmer { position:absolute; top:0; left:-100%; width:50%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent); animation:shimmer 2s ease-in-out infinite; }
@keyframes shimmer { to { left:200%; } }
.error-box { background:rgba(239,68,68,0.10); border:1px solid rgba(239,68,68,0.25); border-radius:10px; padding:12px 14px; font-size:13px; color:#FCA5A5; margin-top:12px; display:none; }
.error-box.show { display:block; }
.image-drop { border:2px dashed var(--border-h); border-radius:12px; padding:18px 14px; text-align:center; cursor:pointer; transition:border-color .15s, background .15s; background:var(--bg3); }
.features { position:relative; z-index:1; display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; max-width:900px; margin:64px auto 0; padding:0 24px 80px; }
.feature-card { background:var(--bg2); border:1px solid var(--border); border-radius:16px; padding:20px; transition:border-color .2s, box-shadow .2s; }
.feature-card:hover { border-color:var(--border-h); box-shadow:0 8px 32px rgba(0,0,0,0.3); }
.feature-icon { font-size:24px; margin-bottom:12px; }
.feature-title { font-size:14px; font-weight:700; margin-bottom:6px; }
.feature-desc { font-size:12px; color:var(--muted); line-height:1.6; }
.langs { position:relative; z-index:1; text-align:center; padding:0 24px 48px; }
.langs-title { font-size:12px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:16px; }
.langs-list { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; max-width:700px; margin:0 auto; }
.lang-pill { font-size:11px; font-weight:600; padding:4px 10px; border-radius:6px; background:var(--bg2); border:1px solid var(--border); color:var(--muted); }
.btn-submit.loading .btn-submit-text { display:none; }
.btn-submit.loading::after { content:''; width:18px; height:18px; border:2.5px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
footer { position:relative; z-index:1; text-align:center; padding:32px 24px; border-top:1px solid var(--border); color:var(--muted); font-size:12px; }
footer a { color:var(--muted); text-decoration:none; } footer a:hover { color:var(--text); }
.demo-section { position:relative; z-index:1; max-width:900px; margin:56px auto 0; padding:0 24px; }
.demo-label { font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin-bottom:16px; }
.demo-frame { border-radius:12px; border:1px solid var(--border); overflow:hidden; background:var(--bg2); box-shadow:0 8px 40px rgba(0,0,0,.5); line-height:0; }
.demo-frame img { width:100%; height:auto; display:block; }
.demo-bar { display:flex; align-items:center; gap:8px; padding:10px 16px; background:var(--bg3); border-bottom:1px solid var(--border); }
.demo-dot { width:10px; height:10px; border-radius:50%; }
.demo-url { font-size:11px; color:var(--muted); font-family:var(--mono); flex:1; }
.vscode-section { position:relative; z-index:1; max-width:900px; margin:64px auto 0; padding:0 24px 64px; }
.vscode-inner { display:grid; grid-template-columns:1fr 1fr; gap:48px; align-items:center; }
@media(max-width:660px) { .vscode-inner { grid-template-columns:1fr; } }
.vscode-badge { display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:600; padding:5px 14px; border-radius:20px; border:1px solid rgba(124,58,237,0.35); background:rgba(124,58,237,0.10); color:var(--accent2); margin-bottom:18px; letter-spacing:0.02em; }
.vscode-section h2 { font-size:clamp(22px,4vw,32px); font-weight:800; letter-spacing:-0.03em; margin-bottom:12px; }
.vscode-section p { font-size:14px; color:var(--muted); line-height:1.7; margin-bottom:20px; }
.vscode-gif { border-radius:12px; border:1px solid var(--border); overflow:hidden; box-shadow:0 8px 40px rgba(0,0,0,.5); line-height:0; }
.vscode-gif img { width:100%; height:auto; display:block; }
/* Lightning onboarding modal */
.ln-modal { display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.75); backdrop-filter:blur(8px); align-items:center; justify-content:center; padding:24px; }
.ln-modal.show { display:flex; }
.ln-box { background:var(--bg2); border:1px solid var(--border-h); border-radius:20px; padding:28px; max-width:460px; width:100%; position:relative; }
.ln-close { position:absolute; top:14px; right:14px; background:none; border:none; color:var(--muted); font-size:22px; cursor:pointer; line-height:1; padding:2px 6px; border-radius:6px; }
.ln-close:hover { color:var(--text); }
.ln-box h3 { font-size:18px; font-weight:800; margin-bottom:8px; }
.ln-box p { font-size:13px; color:var(--muted); line-height:1.6; margin-bottom:16px; }
.ln-wallets { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:16px; }
.ln-wallet { background:var(--bg3); border:1px solid var(--border); border-radius:12px; padding:12px 8px; text-align:center; text-decoration:none; color:var(--text); transition:border-color .15s, box-shadow .15s; display:block; }
.ln-wallet:hover { border-color:var(--accent2); box-shadow:0 0 0 1px rgba(168,85,247,0.2); }
.ln-wallet-icon { font-size:22px; margin-bottom:5px; }
.ln-wallet-name { font-size:11px; font-weight:700; display:block; }
.ln-wallet-desc { font-size:10px; color:var(--muted); margin-top:2px; }
.ln-invoice-box { background:#0D1117; border:1px solid #30363d; border-radius:8px; padding:10px; font-size:9px; font-family:var(--mono); color:#8b949e; word-break:break-all; max-height:52px; overflow:hidden; margin:12px 0; }
.ln-proceed { width:100%; padding:13px; border-radius:12px; border:none; background:linear-gradient(135deg,var(--accent),var(--accent2)); color:#fff; font-size:14px; font-weight:700; cursor:pointer; transition:opacity .15s; margin-top:4px; }
.ln-proceed:hover { opacity:.88; }
</style>
</head>
<body>
<nav>
  <a class="nav-logo" href="/">
    <div class="nav-logo-mark">⚡</div>
    <span class="nav-logo-text">Diagram Forge</span>
  </a>
  <div class="nav-right">
    <a class="nav-link" href="https://docs.l402kit.com" target="_blank">Docs</a>
    <a class="nav-link" href="https://l402kit.com" target="_blank">l402kit</a>
    <div class="nav-pill"><div class="nav-pill-dot"></div>Live</div>
    <div id="gh-nav">
      <button class="btn-gh" id="btn-gh-connect" onclick="connectGithub()">
        <svg viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
        Connect GitHub
      </button>
      <div class="gh-user" id="gh-user-info" style="display:none">
        <img class="gh-avatar" id="gh-avatar" src="" alt=""/>
        <span id="gh-login"></span>
      </div>
    </div>
  </div>
</nav>

<div class="hero">
  <div class="hero-badge"><span>✦</span> First analysis free · No account needed</div>
  <h1>New repo?<br/><span>Understand it</span><br/>in 60 seconds.</h1>
  <p class="hero-sub">Paste any GitHub URL. Claude maps every service, database, and API connection — with official logos and animated flows. First basic analysis is free.</p>

  <div class="card">
    <div class="card-header">
      <div class="card-dot" style="background:#FF5F57"></div>
      <div class="card-dot" style="background:#FFBD2E"></div>
      <div class="card-dot" style="background:#28C840"></div>
      <span class="card-title">diagram-forge — analyze</span>
    </div>
    <div class="card-body">
      <div class="input-label">Analysis tier</div>
      <div class="tier-row" id="tier-row">
        <div class="tier-btn selected" data-tier="basic">
          <div class="tier-check">✓</div>
          <div class="tier-name">Basic <span style="font-size:9px;color:#22C55E;font-weight:700">FREE 1st</span></div>
          <div class="tier-sats">2,000 sats</div>
          <div class="tier-desc">Diagram only · top 10 files</div>
        </div>
        <div class="tier-btn" data-tier="full">
          <div class="tier-check">✓</div>
          <div class="tier-name">Full</div>
          <div class="tier-sats">10,000 sats</div>
          <div class="tier-desc">Complete repo + benchmark + share</div>
        </div>
        <div class="tier-btn" data-tier="live">
          <div class="tier-check">✓</div>
          <div class="tier-name">Live ✦</div>
          <div class="tier-sats">25,000 sats</div>
          <div class="tier-desc">Full + animated particle flows</div>
        </div>
      </div>

      <div class="input-label">Repository</div>
      <div id="repo-row">
        <select class="repo-select" id="repo-select" onchange="onRepoSelect(this.value)">
          <option value="">— select a repo —</option>
        </select>
      </div>
      <div class="input-wrap">
        <span class="input-icon">🐙</span>
        <input type="url" id="input-github" placeholder="https://github.com/user/repo" autocomplete="off" spellcheck="false"/>
      </div>
      <div class="input-or">or import from image</div>
      <div class="image-drop" id="image-drop-zone" onclick="document.getElementById('img-input').click()"
        ondragover="event.preventDefault();this.style.borderColor='var(--accent2)'"
        ondragleave="this.style.borderColor=''"
        ondrop="handleDrop(event)">
        <input type="file" id="img-input" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf" style="display:none" onchange="handleFile(this.files[0])">
        <div id="img-placeholder" style="color:var(--muted);font-size:13px">
          <span style="font-size:22px;display:block;margin-bottom:4px">🖼️</span>
          Whiteboard · Screenshot · Visio / Lucidchart · PDF
        </div>
        <div id="img-preview" style="display:none">
          <img id="img-thumb" style="max-height:80px;max-width:100%;border-radius:6px;object-fit:contain"/>
          <div id="img-name" style="font-size:12px;color:var(--muted);margin-top:4px"></div>
        </div>
      </div>

      <div style="margin-top:12px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px;letter-spacing:.03em">Promo code (optional)</div>
        <input id="input-promo" type="text" placeholder="e.g. LAUNCH2026"
          style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text);font-size:13px;font-family:var(--mono);letter-spacing:.08em;text-transform:uppercase;outline:none;transition:border-color .2s"
          onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"/>
      </div>

      <div class="error-box" id="error-box"></div>
      <button class="btn-submit" id="btn-analyze" style="margin-top:16px">
        <div class="btn-submit-shimmer"></div>
        <span>⚡</span>
        <span class="btn-submit-text" id="btn-text">Analyze & Generate Diagram</span>
      </button>
    </div>
  </div>
</div>

<div class="langs">
  <div class="langs-title">Works with any stack</div>
  <div class="langs-list">
    <span class="lang-pill">TypeScript</span><span class="lang-pill">JavaScript</span>
    <span class="lang-pill">Python</span><span class="lang-pill">Java</span>
    <span class="lang-pill">Go</span><span class="lang-pill">Rust</span>
    <span class="lang-pill">Ruby</span><span class="lang-pill">Scala</span>
    <span class="lang-pill">Jupyter</span><span class="lang-pill">dbt</span>
    <span class="lang-pill">Terraform</span><span class="lang-pill">Kubernetes</span>
    <span class="lang-pill">Docker Compose</span><span class="lang-pill">Airflow</span>
    <span class="lang-pill">Monorepos</span>
  </div>
</div>

<div class="demo-section">
  <div class="demo-label">See it in action</div>
  <div class="demo-frame">
    <div class="demo-bar">
      <div class="demo-dot" style="background:#FF5F57"></div>
      <div class="demo-dot" style="background:#FFBD2E"></div>
      <div class="demo-dot" style="background:#28C840"></div>
      <span class="demo-url">forge.l402kit.com — interactive viewer</span>
    </div>
    <img src="https://raw.githubusercontent.com/shinydapps-creator/diagram-forge/main/docs/demo-viewer.gif" alt="Diagram Forge interactive viewer demo" loading="lazy"/>
  </div>
</div>

<div class="vscode-section">
  <div class="vscode-inner">
    <div>
      <div class="vscode-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="5" height="4" rx="1"/><rect x="9" y="1" width="5" height="4" rx="1"/><rect x="9" y="10" width="5" height="4" rx="1"/><rect x="17" y="5.5" width="6" height="4" rx="1"/><line x1="6" y1="6" x2="9" y2="3"/><line x1="6" y1="6" x2="9" y2="12"/><line x1="14" y1="3" x2="17" y2="7.5"/><line x1="14" y1="12" x2="17" y2="7.5"/></svg>
        VS Code Extension
      </div>
      <h2>Analyze directly<br/>from your editor</h2>
      <p>Install from the Marketplace and analyze any repo without leaving VS Code. GitHub remote is detected automatically — just click Analyze, pick a tier, and pay.</p>
      <a href="https://marketplace.visualstudio.com/items?itemName=ShinyDapps.diagram-forge" target="_blank" class="btn-gh" style="display:inline-flex">
        <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24"><path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 19.9V4.1a1.5 1.5 0 0 0-.85-1.513zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/></svg>
        Install from Marketplace
      </a>
    </div>
    <div class="vscode-gif">
      <img src="https://raw.githubusercontent.com/ThiagoDataEngineer/diagram-forge/main/docs/demo-extension-journey.gif" alt="Diagram Forge VS Code extension" loading="lazy"/>
    </div>
  </div>
</div>

<div class="features">
  <div class="feature-card"><div class="feature-icon">🧠</div><div class="feature-title">Agentic analysis</div><div class="feature-desc">Claude autonomously explores your codebase with filesystem tools — no config files, no annotations needed.</div></div>
  <div class="feature-card"><div class="feature-icon">✨</div><div class="feature-title">Living diagrams</div><div class="feature-desc">Particles flow along edges in real time, colored by protocol. WebSocket = fast. SQL = heavy. Redis = hot.</div></div>
  <div class="feature-card"><div class="feature-icon">🏷️</div><div class="feature-title">Official logos</div><div class="feature-desc">80+ technologies auto-detected with their official Simple Icons branding. React, PostgreSQL, Kafka, and more.</div></div>
  <div class="feature-card" style="border-color:rgba(124,58,237,0.35);background:rgba(124,58,237,0.06)"><div class="feature-icon">🤖</div><div class="feature-title">MCP tool <span style="font-size:10px;color:#A855F7;font-weight:700;background:rgba(168,85,247,0.15);padding:2px 6px;border-radius:10px;margin-left:4px">NEW</span></div><div class="feature-desc">Use Diagram Forge as a tool from Claude Desktop, Cursor, or any MCP-compatible agent. Let AI map your architecture autonomously.</div></div>
  <div class="feature-card"><div class="feature-icon">⚡</div><div class="feature-title">First analysis free</div><div class="feature-desc">No account, no card. First basic analysis is free. Same repo (same commit) is always free — never pay twice for the same code.</div></div>
  <div class="feature-card"><div class="feature-icon">🔍</div><div class="feature-title">Interactive viewer</div><div class="feature-desc">Pan, zoom, click nodes to inspect connections. Minimap, export SVG/PNG/Draw.io/Markdown.</div></div>
  <div class="feature-card"><div class="feature-icon">📊</div><div class="feature-title">Architecture benchmark</div><div class="feature-desc">6-dimension quality score: scalability, security, observability, reliability, maintainability, cost. Detects SPOFs. Full tier.</div></div>
  <div class="feature-card"><div class="feature-icon">🔀</div><div class="feature-title">Diff engine</div><div class="feature-desc">Compare architecture snapshots over time. Added, removed, and changed services highlighted on the graph. Full tier.</div></div>
  <div class="feature-card"><div class="feature-icon">🧩</div><div class="feature-title">VS Code extension</div><div class="feature-desc">Analyze repos from VS Code. Payment auto-detected via Lightning polling — open the diagram without leaving your editor.</div></div>
</div>

<!-- MCP setup section -->
<div style="position:relative;z-index:1;max-width:760px;margin:0 auto 64px;padding:0 24px">
  <div style="background:var(--bg2);border:1px solid rgba(124,58,237,0.3);border-radius:16px;padding:28px 32px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <span style="font-size:20px">🤖</span>
      <span style="font-size:15px;font-weight:800">Use from Claude Desktop / Cursor (MCP)</span>
      <span style="font-size:10px;color:#A855F7;font-weight:700;background:rgba(168,85,247,0.15);padding:2px 8px;border-radius:10px">MCP</span>
    </div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px;line-height:1.6">Let any MCP-compatible AI agent call Diagram Forge as a tool. Add this to your <code style="font-family:var(--mono);background:var(--bg3);padding:2px 6px;border-radius:4px">mcp.json</code>:</p>
    <pre style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:16px;font-size:12px;font-family:var(--mono);overflow-x:auto;color:#A5D6FF;line-height:1.6">{
  "mcpServers": {
    "diagram-forge": {
      "command": "npx",
      "args": ["tsx", "/path/to/diagram-forge/src/mcp/server.ts"]
    }
  }
}</pre>
    <p style="font-size:11px;color:var(--muted);margin-top:12px">Tools available: <code style="font-family:var(--mono)">analyze_architecture</code> · <code style="font-family:var(--mono)">diff_architectures</code> · <code style="font-family:var(--mono)">benchmark_architecture</code> · <code style="font-family:var(--mono)">explain_node</code></p>
  </div>
</div>

<footer>
  Powered by <a href="https://l402kit.com" target="_blank" rel="noopener">l402-kit</a> ·
  <a href="https://docs.l402kit.com" target="_blank" rel="noopener">Docs</a> ·
  <a href="https://github.com/shinydapps-creator/diagram-forge" target="_blank" rel="noopener">GitHub</a> ·
  <a href="/pricing">Pricing</a>
</footer>

<!-- Lightning onboarding modal -->
<div class="ln-modal" id="ln-modal">
  <div class="ln-box">
    <button class="ln-close" onclick="closeLnModal()">×</button>
    <div style="font-size:36px;margin-bottom:10px">⚡</div>
    <h3>New to Lightning?</h3>
    <p>Lightning is a Bitcoin payment layer — instant, near-zero fees. Get a wallet in under 2 minutes and fund it with a few dollars. Then scan the QR code on the next page.</p>
    <div class="ln-wallets">
      <a href="https://www.walletofsatoshi.com/" target="_blank" class="ln-wallet">
        <div class="ln-wallet-icon">📱</div>
        <span class="ln-wallet-name">Wallet of Satoshi</span>
        <div class="ln-wallet-desc">Easiest · mobile</div>
      </a>
      <a href="https://phoenix.acinq.co/" target="_blank" class="ln-wallet">
        <div class="ln-wallet-icon">🦅</div>
        <span class="ln-wallet-name">Phoenix</span>
        <div class="ln-wallet-desc">Self-custodial</div>
      </a>
      <a href="https://getalby.com/" target="_blank" class="ln-wallet">
        <div class="ln-wallet-icon">🐝</div>
        <span class="ln-wallet-name">Alby</span>
        <div class="ln-wallet-desc">Browser ext</div>
      </a>
    </div>
    <p style="margin-bottom:4px;font-size:12px">Already have a wallet? Tap <strong style="color:var(--text)">Open payment page</strong> to scan the QR code and pay.</p>
    <div class="ln-invoice-box" id="ln-invoice-display"></div>
    <button class="ln-proceed" id="ln-proceed-btn">Open payment page →</button>
  </div>
</div>

<script>
let selectedTier = 'basic';
let imgBase64 = null, imgMediaType = 'image/jpeg';

document.querySelectorAll('.tier-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tier-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedTier = btn.dataset.tier;
  });
});

function handleFile(file) {
  if (!file) return;
  imgMediaType = file.type || 'image/jpeg';
  const reader = new FileReader();
  reader.onload = ev => {
    imgBase64 = ev.target.result.split(',')[1];
    document.getElementById('img-placeholder').style.display = 'none';
    document.getElementById('img-preview').style.display = 'block';
    document.getElementById('img-thumb').src = ev.target.result;
    document.getElementById('img-name').textContent = file.name + ' · ' + Math.round(file.size/1024) + ' KB';
    document.getElementById('input-github').value = '';
    document.getElementById('btn-text').textContent = 'Analyze Image & Generate Diagram';
  };
  reader.readAsDataURL(file);
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
}

document.getElementById('btn-analyze').addEventListener('click', async () => {
  const github = document.getElementById('input-github').value.trim();
  const errBox = document.getElementById('error-box');
  const btn = document.getElementById('btn-analyze');

  if (imgBase64) {
    errBox.classList.remove('show');
    btn.classList.add('loading'); btn.disabled = true;
    try {
      const res = await fetch('/api/analyze-image', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({image_base64: imgBase64, media_type: imgMediaType}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      window.location.href = '/view?file=' + encodeURIComponent(data.filename);
    } catch (err) {
      errBox.textContent = err.message; errBox.classList.add('show');
    } finally { btn.classList.remove('loading'); btn.disabled = false; }
    return;
  }

  if (!github) { errBox.textContent = 'Please enter a GitHub URL.'; errBox.classList.add('show'); return; }
  errBox.classList.remove('show');
  btn.classList.add('loading'); btn.disabled = true;

  const promoCode = (document.getElementById('input-promo')?.value ?? '').trim().toUpperCase();
  const bodyBase = {tier: selectedTier, repo_url: github, ...(promoCode ? {promo_code: promoCode} : {})};

  try {
    const r1 = await fetch('/analyze', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify(bodyBase),
    });
    // Promo code bypassed payment — direct success
    if (r1.ok) {
      const result = await r1.json();
      if (result.graph) { sessionStorage.setItem('df-graph', JSON.stringify(result.graph)); window.location.href = '/view?from=session'; return; }
    }
    // Promo invalid — show friendly error, don't fall through to payment
    if (r1.status === 402 && promoCode) {
      const d = await r1.json().catch(() => ({}));
      const reason = d.promo_error ?? null;
      const msg = reason === 'invalid_code' ? 'Promo code "' + promoCode + '" not found.'
        : reason === 'code_expired'    ? 'Promo code "' + promoCode + '" has expired.'
        : reason === 'code_exhausted'  ? 'Promo code "' + promoCode + '" has been fully redeemed.'
        : reason === 'promo_unavailable' ? 'Promo codes unavailable right now.'
        : null;
      if (msg) { errBox.textContent = msg; errBox.classList.add('show'); btn.classList.remove('loading'); btn.disabled = false; return; }
    }
    if (r1.status !== 402) { const d = await r1.json(); errBox.textContent = d.error ?? 'Unexpected response'; errBox.classList.add('show'); return; }
    const data = await r1.json();
    const wwwAuth = r1.headers.get('WWW-Authenticate') ?? '';
    const macaroon = (wwwAuth.match(/macaroon="([^"]+)"/) ?? [])[1];
    const invoice = data.invoice, hash = data.payment_hash;
    if (!invoice || !macaroon || !hash) { errBox.textContent = 'Server did not return a valid invoice.'; errBox.classList.add('show'); return; }
    let preimage = null;
    if (typeof window.webln !== 'undefined') {
      try { await window.webln.enable(); const r = await window.webln.sendPayment(invoice); preimage = r.preimage; } catch(e) {}
    }
    if (preimage) {
      const r = await fetch('/analyze', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'L402 '+macaroon+':'+preimage}, body: JSON.stringify(bodyBase)});
      if (!r.ok) { const d = await r.json(); errBox.textContent = d.error ?? 'Analysis failed'; errBox.classList.add('show'); return; }
      const result = await r.json();
      sessionStorage.setItem('df-graph', JSON.stringify(result.graph));
      window.location.href = '/view?from=session';
    } else {
      const payUrl = '/pay?' + new URLSearchParams({invoice, macaroon, hash, tier: selectedTier, repo_url: github}).toString();
      showLnModal(invoice, payUrl);
    }
  } catch(err) { errBox.textContent = err.message ?? 'Network error'; errBox.classList.add('show'); }
  finally { btn.classList.remove('loading'); btn.disabled = false; }
});

function showLnModal(invoice, payUrl) {
  document.getElementById('ln-invoice-display').textContent = invoice;
  document.getElementById('ln-proceed-btn').onclick = function() { window.location.href = payUrl; };
  document.getElementById('ln-modal').classList.add('show');
}
function closeLnModal() {
  document.getElementById('ln-modal').classList.remove('show');
}
document.getElementById('ln-modal').addEventListener('click', function(e) {
  if (e.target === this) closeLnModal();
});

document.getElementById('input-github').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-analyze').click();
});

// ── GitHub OAuth ─────────────────────────────────────────────────────────────

function connectGithub() {
  const popup = window.open(
    '/auth/github',
    'gh_oauth',
    'width=600,height=700,left=' + Math.round((screen.width-600)/2) + ',top=' + Math.round((screen.height-700)/2)
  );
  if (!popup) {
    alert('Popup blocked — please allow popups for forge.l402kit.com and try again.');
    return;
  }
  window.addEventListener('message', onGhMessage, { once: false });
}

function onGhMessage(event) {
  if (!event.data || event.data.type !== 'gh_repos') return;
  window.removeEventListener('message', onGhMessage);

  const repos = event.data.repos || [];

  // Show repo dropdown
  const sel = document.getElementById('repo-select');
  sel.innerHTML = '<option value="">— select a repo —</option>';
  repos.forEach(r => {
    const opt = document.createElement('option');
    opt.value = 'https://github.com/' + r.full_name;
    opt.textContent = (r.private ? '🔒 ' : '') + r.full_name;
    sel.appendChild(opt);
  });
  document.getElementById('repo-row').style.display = 'block';

  // Fetch user info to show avatar
  fetch('/auth/github/user-info', { credentials: 'include' })
    .catch(() => {});
  const login = repos[0]?.full_name?.split('/')[0] ?? '';
  if (login) {
    document.getElementById('gh-avatar').src = 'https://github.com/' + login + '.png?size=40';
    document.getElementById('gh-login').textContent = login;
    document.getElementById('gh-user-info').style.display = 'flex';
    document.getElementById('btn-gh-connect').style.display = 'none';
  }
}

function onRepoSelect(url) {
  if (url) document.getElementById('input-github').value = url;
}
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const RAILWAY_URL = env.RAILWAY_URL ?? '';

    // Serve landing for GET /
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
      return new Response(LANDING_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      });
    }

    // Proxy everything else to Railway
    if (RAILWAY_URL) {
      const target = RAILWAY_URL.replace(/\/$/, '') + url.pathname + url.search;
      const proxied = new Request(target, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        redirect: 'manual',
      });
      try {
        return await fetch(proxied);
      } catch {
        return new Response(JSON.stringify({ error: 'Backend unreachable' }), {
          status: 502, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // No Railway URL yet
    return new Response(JSON.stringify({ error: 'Server deploying — check back soon', status: 'coming_soon' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '300' },
    });
  },
};
