#!/usr/bin/env node
import * as p from "@clack/prompts";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

// ── TypeScript / Express templates ────────────────────────────────────────────

function tplTsServer(priceSats, ownerAddress) {
  return `import express from "express";
import { l402 } from "l402-kit";
import "dotenv/config";

const app = express();

app.get("/premium", l402({
  priceSats: ${priceSats},
  ownerLightningAddress: process.env.OWNER_ADDRESS || "${ownerAddress}",
}), (_req, res) => {
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
    "l402-kit": "^1.3.0"
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

// ── Python / FastAPI templates ─────────────────────────────────────────────────

function tplPythonServer(priceSats, ownerAddress) {
  return `import os
from fastapi import FastAPI
from l402kit import l402_required, BlinkProvider

app = FastAPI()

lightning = BlinkProvider(
    api_key=os.environ.get("L402KIT_BLINK_API_KEY", ""),
    wallet_id=os.environ.get("L402KIT_BLINK_WALLET_ID", ""),
)

@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/premium")
@l402_required(price_sats=${priceSats}, lightning=lightning)
async def premium():
    return {
        "message": "Payment confirmed ⚡",
        "price_sats": ${priceSats},
    }
`;
}

function tplPythonRequirements() {
  return `fastapi>=0.110.0
uvicorn[standard]>=0.29.0
l402kit>=1.3.0
python-dotenv>=1.0.0
`;
}

function tplPythonEnv(ownerAddress) {
  return `# l402-kit configuration
OWNER_ADDRESS=${ownerAddress}

# Blink API — free at dashboard.blink.sv
L402KIT_BLINK_API_KEY=your_blink_api_key
L402KIT_BLINK_WALLET_ID=your_blink_wallet_id
`;
}

// ── Go templates ───────────────────────────────────────────────────────────────

function tplGoServer(priceSats, ownerAddress) {
  return `package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	l402kit "github.com/shinydapps/l402-kit/go"
)

func premiumHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":    "Payment confirmed ⚡",
		"price_sats": ${priceSats},
		"timestamp":  time.Now().Format(time.RFC3339),
	})
}

func main() {
	ownerAddr := os.Getenv("OWNER_ADDRESS")
	if ownerAddr == "" {
		ownerAddr = "${ownerAddress}"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, \`{"ok":true}\`)
	})
	mux.Handle("/premium", l402kit.Middleware(l402kit.Options{
		PriceSats:             ${priceSats},
		OwnerLightningAddress: ownerAddr,
	}, http.HandlerFunc(premiumHandler)))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	fmt.Printf("⚡ l402-kit server running on http://localhost:%s\\n", port)
	fmt.Printf("   curl http://localhost:%s/premium  →  402 (pay ${priceSats} sats)  →  200 OK\\n", port)
	http.ListenAndServe(":"+port, mux)
}
`;
}

function tplGoMod(projectName) {
  return `module ${projectName}

go 1.21

require github.com/shinydapps/l402-kit/go v1.3.0
`;
}

function tplGoEnv(ownerAddress) {
  return `# l402-kit configuration
OWNER_ADDRESS=${ownerAddress}

# Blink API — free at dashboard.blink.sv
L402KIT_BLINK_API_KEY=your_blink_api_key
L402KIT_BLINK_WALLET_ID=your_blink_wallet_id
`;
}

// ── Shared templates ───────────────────────────────────────────────────────────

function tplEnvTs(ownerAddress, provider) {
  const providerBlock = provider === "blink"
    ? `\n# Blink API — free at dashboard.blink.sv\nL402KIT_BLINK_API_KEY=your_blink_api_key\nL402KIT_BLINK_WALLET_ID=your_blink_wallet_id`
    : provider === "opennode"
    ? `\n# OpenNode API — app.opennode.com\nL402KIT_OPENNODE_API_KEY=your_opennode_key`
    : `\n# Alby Hub — hub.getalby.com (self-custodial)\nALBY_ACCESS_TOKEN=your_alby_token\nALBY_HUB_URL=https://your-name.getalby.com`;
  return `# l402-kit configuration\nOWNER_ADDRESS=${ownerAddress}${providerBlock}\n\n# PORT=3000\n`;
}

function tplGitignore(lang) {
  if (lang === "python") return `__pycache__/\n*.pyc\n.env\n*.log\n.venv/\n`;
  if (lang === "go")     return `*.exe\n*.out\n.env\n*.log\n`;
  return `node_modules/\ndist/\n.env\n*.log\n`;
}

function tplReadme(projectName, priceSats, ownerAddress, lang) {
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
5. Server returns **200 OK** — ${priceSats} sats go to ${ownerAddress}

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

const ownerAddress = await p.text({
  message: "Your Lightning Address (receives payments)",
  placeholder: "you@yourdomain.com",
  validate: (v) => {
    if (!v || !v.includes("@")) return "Enter a valid Lightning Address (e.g. you@yourdomain.com)";
  },
});
if (p.isCancel(ownerAddress)) { p.cancel("Cancelled."); process.exit(0); }

let provider = "blink";
if (lang === "ts") {
  provider = await p.select({
    message: "Lightning provider",
    options: [
      { value: "blink",    label: "Blink      (free, plug & play — dashboard.blink.sv)" },
      { value: "opennode", label: "OpenNode   (app.opennode.com)" },
      { value: "alby",    label: "Alby Hub   (self-custodial, 0% fee — hub.getalby.com)" },
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

const name    = projectName.trim();
const sats    = Number(priceSats);
const address = ownerAddress.trim().toLowerCase();
const dir     = join(process.cwd(), name);

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
  write(dir, ".env.example",  tplEnvTs(address, provider));
  write(dir, ".gitignore",    tplGitignore("ts"));
  write(dir, "README.md",     tplReadme(name, sats, address, "ts"));
  write(join(dir, "src"), "server.ts", tplTsServer(sats, address));
} else if (lang === "python") {
  write(dir, "main.py",          tplPythonServer(sats, address));
  write(dir, "requirements.txt", tplPythonRequirements());
  write(dir, ".env.example",     tplPythonEnv(address));
  write(dir, ".gitignore",       tplGitignore("python"));
  write(dir, "README.md",        tplReadme(name, sats, address, "python"));
} else if (lang === "go") {
  write(dir, "main.go",     tplGoServer(sats, address));
  write(dir, "go.mod",      tplGoMod(name));
  write(dir, ".env.example", tplGoEnv(address));
  write(dir, ".gitignore",   tplGitignore("go"));
  write(dir, "README.md",    tplReadme(name, sats, address, "go"));
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
