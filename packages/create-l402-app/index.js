#!/usr/bin/env node
import * as p from "@clack/prompts";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

// ── TypeScript / Express templates ────────────────────────────────────────────

function tplTsServer(priceSats, provider) {
  const imports = {
    alby:     `import { l402, AlbyProvider } from "l402-kit";`,
    blink:    `import { l402, BlinkProvider } from "l402-kit";`,
    opennode: `import { l402, OpenNodeProvider } from "l402-kit";`,
  }[provider];

  const lightning = {
    alby:     `const lightning = new AlbyProvider(process.env.ALBY_TOKEN!);`,
    blink:    `const lightning = new BlinkProvider(\n  process.env.BLINK_API_KEY!,\n  process.env.BLINK_WALLET_ID!,\n);`,
    opennode: `const lightning = new OpenNodeProvider(process.env.OPENNODE_API_KEY!);`,
  }[provider];

  return `import express from "express";
${imports}
import "dotenv/config";

const app = express();

${lightning}

app.get("/premium", l402({ priceSats: ${priceSats}, lightning }), (_req, res) => {
  res.json({
    message: "Payment confirmed \\u26a1",
    priceSats: ${priceSats},
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(\`\\u26a1 l402-kit server running on http://localhost:\${PORT}\`);
  console.log(\`   curl http://localhost:\${PORT}/premium  →  402 (pay ${priceSats} sats)  →  200 OK\`);
});
`;
}

function tplTsPackageJson(projectName) {
  return `{
  "name": "${projectName}",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc"
  },
  "dependencies": {
    "dotenv": "^17.0.0",
    "express": "^4.21.0",
    "l402-kit": "^1.4.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0"
  }
}
`;
}

function tplTsconfig() {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`;
}

function tplEnvTs(provider) {
  return {
    alby:     `# Alby Hub — hub.getalby.com (self-custodial, 0% fee)\nALBY_TOKEN=your_alby_token\n\n# PORT=3000\n`,
    blink:    `# Blink — free at dashboard.blink.sv\nBLINK_API_KEY=your_blink_api_key\nBLINK_WALLET_ID=your_blink_wallet_id\n\n# PORT=3000\n`,
    opennode: `# OpenNode — app.opennode.com\nOPENNODE_API_KEY=your_opennode_key\n\n# PORT=3000\n`,
  }[provider];
}

// ── Python / FastAPI templates ─────────────────────────────────────────────────

function tplPythonServer(priceSats) {
  return `import os
from fastapi import FastAPI, Request
from l402kit import l402_required
from l402kit.providers.blink import BlinkProvider

app = FastAPI()

lightning = BlinkProvider(
    api_key=os.environ["BLINK_API_KEY"],
    wallet_id=os.environ["BLINK_WALLET_ID"],
)

@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/premium")
@l402_required(price_sats=${priceSats}, lightning=lightning)
async def premium(request: Request):
    return {
        "message": "Payment confirmed ⚡",
        "price_sats": ${priceSats},
    }
`;
}

function tplPythonRequirements() {
  return `fastapi>=0.110.0
uvicorn[standard]>=0.29.0
l402kit>=1.4.0
python-dotenv>=1.0.0
`;
}

function tplPythonEnv() {
  return `# Blink — free at dashboard.blink.sv
BLINK_API_KEY=your_blink_api_key
BLINK_WALLET_ID=your_blink_wallet_id
`;
}

// ── Go templates ───────────────────────────────────────────────────────────────

function tplGoServer(priceSats) {
  return `package main

import (
\t"encoding/json"
\t"fmt"
\t"net/http"
\t"os"
\t"time"

\tl402kit "github.com/shinydapps/l402-kit/go"
)

func premiumHandler(w http.ResponseWriter, r *http.Request) {
\tw.Header().Set("Content-Type", "application/json")
\tjson.NewEncoder(w).Encode(map[string]interface{}{
\t\t"message":    "Payment confirmed ⚡",
\t\t"price_sats": ${priceSats},
\t\t"timestamp":  time.Now().Format(time.RFC3339),
\t})
}

func main() {
\tlightning := l402kit.NewBlinkProvider(
\t\tos.Getenv("BLINK_API_KEY"),
\t\tos.Getenv("BLINK_WALLET_ID"),
\t)

\tmux := http.NewServeMux()
\tmux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
\t\tw.Header().Set("Content-Type", "application/json")
\t\tfmt.Fprintln(w, \`{"ok":true}\`)
\t})
\tmux.Handle("/premium", l402kit.Middleware(l402kit.Options{
\t\tPriceSats: ${priceSats},
\t\tLightning: lightning,
\t}, http.HandlerFunc(premiumHandler)))

\tport := os.Getenv("PORT")
\tif port == "" {
\t\tport = "8080"
\t}
\tfmt.Printf("\\u26a1 l402-kit server running on http://localhost:%s\\n", port)
\tfmt.Printf("   curl http://localhost:%s/premium  →  402 (pay ${priceSats} sats)  →  200 OK\\n", port)
\thttp.ListenAndServe(":"+port, mux)
}
`;
}

function tplGoMod(projectName) {
  return `module ${projectName}

go 1.21

require github.com/shinydapps/l402-kit/go v1.4.0
`;
}

function tplGoEnv() {
  return `# Blink — free at dashboard.blink.sv
BLINK_API_KEY=your_blink_api_key
BLINK_WALLET_ID=your_blink_wallet_id
`;
}

// ── Shared templates ───────────────────────────────────────────────────────────

function tplGitignore(lang) {
  if (lang === "python") return `__pycache__/\n*.pyc\n.env\n*.log\n.venv/\n`;
  if (lang === "go")     return `*.exe\n*.out\n.env\n*.log\n`;
  return `node_modules/\ndist/\n.env\n*.log\n`;
}

function tplReadme(projectName, priceSats, lang) {
  const runCmd = lang === "python"
    ? "uvicorn main:app --reload"
    : lang === "go"
    ? "go run main.go"
    : "npm run dev";
  const port = lang === "go" ? "8080" : "3000";

  return `# ${projectName} — pay-per-call API ⚡

Built with [l402-kit](https://l402kit.com) — Bitcoin Lightning payments for any API.

## Quick start

\`\`\`bash
cp .env.example .env   # add your credentials
${lang === "python" ? "pip install -r requirements.txt\n" : lang === "go" ? "go mod tidy\n" : "npm install\n"}${runCmd}
\`\`\`

## Test it

\`\`\`bash
# Returns HTTP 402 + Lightning invoice
curl http://localhost:${port}/premium

# Returns 200 OK after payment
curl http://localhost:${port}/premium \\
  -H "Authorization: L402 <token>:<preimage>"
\`\`\`

## How it works

1. Client calls \`GET /premium\` → server returns **402 Payment Required** + BOLT11 invoice
2. Client pays with any Lightning wallet (Phoenix, Blink, Strike, Alby…)
3. Client retries with \`Authorization: L402 <token>:<preimage>\`
4. Server verifies \`SHA256(preimage) === token.hash\` locally in <1ms — no DB, no network
5. Server returns **200 OK** — ${priceSats} sats go directly to your wallet

## Docs

[l402kit.com/docs](https://l402kit.com/docs)
`;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function write(dir, filename, content) {
  writeFileSync(join(dir, filename), content, "utf8");
}

function tryInstall(dir, lang) {
  try {
    const cmd = lang === "python" ? "pip install -r requirements.txt"
      : lang === "go" ? "go mod tidy"
      : "npm install";
    execSync(cmd, { cwd: dir, stdio: "inherit" });
    return true;
  } catch { return false; }
}

// ── main ──────────────────────────────────────────────────────────────────────

p.intro(`⚡ create-l402-app`);

const projectName = await p.text({
  message: "Project name",
  placeholder: "my-api",
  defaultValue: process.argv[2] || "my-api",
  validate: (v) => {
    if (!v || v.trim() === "") return "Project name is required";
    if (!/^[a-z0-9_-]+$/i.test(v.trim())) return "Use letters, numbers, hyphens or underscores only";
  },
});
if (p.isCancel(projectName)) { p.cancel("Cancelled."); process.exit(0); }

const lang = await p.select({
  message: "Language / framework",
  options: [
    { value: "ts",     label: "TypeScript  (Express)" },
    { value: "python", label: "Python      (FastAPI)" },
    { value: "go",     label: "Go          (net/http)" },
  ],
});
if (p.isCancel(lang)) { p.cancel("Cancelled."); process.exit(0); }

const priceSats = await p.text({
  message: "Price per API call (sats)",
  placeholder: "10",
  defaultValue: "10",
  validate: (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) return "Enter a whole number ≥ 1";
  },
});
if (p.isCancel(priceSats)) { p.cancel("Cancelled."); process.exit(0); }

let provider = "blink";
if (lang === "ts") {
  provider = await p.select({
    message: "Lightning provider",
    options: [
      { value: "alby",     label: "Alby Hub   (self-custodial, 0% fee — hub.getalby.com)" },
      { value: "blink",    label: "Blink      (free, plug & play — dashboard.blink.sv)" },
      { value: "opennode", label: "OpenNode   (app.opennode.com)" },
    ],
  });
  if (p.isCancel(provider)) { p.cancel("Cancelled."); process.exit(0); }
}

const install = await p.confirm({
  message: lang === "python" ? "Run pip install now?" : lang === "go" ? "Run go mod tidy now?" : "Run npm install now?",
  initialValue: true,
});
if (p.isCancel(install)) { p.cancel("Cancelled."); process.exit(0); }

// ── scaffold ──────────────────────────────────────────────────────────────────

const name = projectName.trim();
const sats = Number(priceSats);
const dir  = join(process.cwd(), name);

if (existsSync(dir)) {
  p.cancel(`Directory "${name}" already exists.`);
  process.exit(1);
}

const s = p.spinner();
s.start("Creating project…");

mkdirSync(dir);

if (lang === "ts") {
  mkdirSync(join(dir, "src"));
  write(dir, "package.json",  tplTsPackageJson(name));
  write(dir, "tsconfig.json", tplTsconfig());
  write(dir, ".env.example",  tplEnvTs(provider));
  write(dir, ".gitignore",    tplGitignore("ts"));
  write(dir, "README.md",     tplReadme(name, sats, "ts"));
  write(join(dir, "src"), "server.ts", tplTsServer(sats, provider));
} else if (lang === "python") {
  write(dir, "main.py",          tplPythonServer(sats));
  write(dir, "requirements.txt", tplPythonRequirements());
  write(dir, ".env.example",     tplPythonEnv());
  write(dir, ".gitignore",       tplGitignore("python"));
  write(dir, "README.md",        tplReadme(name, sats, "python"));
} else if (lang === "go") {
  write(dir, "main.go",     tplGoServer(sats));
  write(dir, "go.mod",      tplGoMod(name));
  write(dir, ".env.example", tplGoEnv());
  write(dir, ".gitignore",   tplGitignore("go"));
  write(dir, "README.md",    tplReadme(name, sats, "go"));
}

s.stop("Project created.");

if (install) {
  const s2 = p.spinner();
  s2.start("Installing dependencies…");
  const ok = tryInstall(dir, lang);
  ok ? s2.stop("Done.") : s2.stop("Install failed — run it manually.");
}

const port = lang === "go" ? "8080" : "3000";
p.note(
  `cd ${name}\n` +
  `cp .env.example .env\n` +
  `# Add your credentials to .env\n` +
  (install ? "" : (lang === "python" ? "pip install -r requirements.txt\n" : lang === "go" ? "go mod tidy\n" : "npm install\n")) +
  (lang === "python" ? "uvicorn main:app --reload\n" : lang === "go" ? "go run main.go\n" : "npm run dev\n") +
  `\nThen test:\n` +
  `curl http://localhost:${port}/premium\n` +
  `→ HTTP 402 Payment Required ⚡`,
  "Next steps"
);

p.outro(`Docs → https://l402kit.com/docs`);
