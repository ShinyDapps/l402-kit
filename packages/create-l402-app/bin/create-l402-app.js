#!/usr/bin/env node
import * as p from "@clack/prompts";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

// ── templates ─────────────────────────────────────────────────────────────────

function tplServer(priceSats, ownerAddress) {
  return `import express from "express";
import { l402 } from "l402-kit";
import "dotenv/config";

const app = express();

// Protected endpoint — requires a Lightning payment of ${priceSats} sats
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

function tplPackageJson(projectName, provider) {
  const providerDep = provider === "opennode"
    ? ""
    : "";
  return `{
  "name": "${projectName}",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "node --loader ts-node/esm src/server.ts",
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

function tplEnv(ownerAddress, provider) {
  const blinkBlock = provider === "blink" ? `
# Blink API — get your key at dashboard.blink.sv (free account)
L402KIT_BLINK_API_KEY=your_blink_api_key
L402KIT_BLINK_WALLET_ID=your_blink_wallet_id` : `
# OpenNode API — get your key at app.opennode.com
L402KIT_OPENNODE_API_KEY=your_opennode_key`;

  return `# ─── l402-kit configuration ──────────────────────────────────────────────────

# Your Lightning Address — receives 99.7% of every payment
OWNER_ADDRESS=${ownerAddress}
${blinkBlock}

# Optional: custom port (default 3000)
# PORT=3000
`;
}

function tplGitignore() {
  return `node_modules/
dist/
.env
*.log
`;
}

function tplReadme(projectName, priceSats, ownerAddress, provider) {
  return `# ${projectName} — pay-per-call API \\u26a1

Built with [l402-kit](https://l402kit.com) — Bitcoin Lightning payments for any API.

## Quick start

\`\`\`bash
cp .env.example .env
# Edit .env: add your ${provider === "blink" ? "Blink" : "OpenNode"} API key${provider === "blink" ? "\n# Get it free at dashboard.blink.sv" : "\n# Get it at app.opennode.com"}
npm install
npm run dev
\`\`\`

## Test it

\`\`\`bash
# Returns HTTP 402 + Lightning invoice
curl http://localhost:3000/premium

# Returns 200 OK after payment
curl http://localhost:3000/premium \\
  -H "Authorization: L402 <token>:<preimage>"
\`\`\`

## How it works

1. Client calls \`GET /premium\` → server returns **402 Payment Required** + BOLT11 invoice
2. Client pays the invoice with any Lightning wallet (Phoenix, Blink, Strike…)
3. Client retries with \`Authorization: L402 <token>:<preimage>\`
4. Server verifies \`SHA256(preimage) === token.hash\` locally in <1ms — no DB, no network
5. Server returns **200 OK** and you receive **${priceSats} sats** (${ownerAddress} gets 99.7%)

## Docs

Full documentation at [l402kit.com/docs](https://l402kit.com/docs)
`;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function write(dir, filename, content) {
  writeFileSync(join(dir, filename), content, "utf8");
}

function tryInstall(dir) {
  try {
    execSync("npm install", { cwd: dir, stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
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
  placeholder: "you@blink.sv",
  validate: (v) => {
    if (!v || !v.includes("@")) return "Enter a valid Lightning Address (e.g. you@blink.sv)";
  },
});
if (p.isCancel(ownerAddress)) { p.cancel("Cancelled."); process.exit(0); }

const provider = await p.select({
  message: "Lightning provider",
  options: [
    { value: "blink",    label: "Blink  (free, recommended — dashboard.blink.sv)" },
    { value: "opennode", label: "OpenNode  (app.opennode.com)" },
  ],
});
if (p.isCancel(provider)) { p.cancel("Cancelled."); process.exit(0); }

const install = await p.confirm({
  message: "Run npm install now?",
  initialValue: true,
});
if (p.isCancel(install)) { p.cancel("Cancelled."); process.exit(0); }

// ── scaffold ──────────────────────────────────────────────────────────────────

const name    = projectName.trim();
const sats    = Number(priceSats);
const address = ownerAddress.trim().toLowerCase();
const dir     = join(process.cwd(), name);

if (existsSync(dir)) {
  p.cancel(`Directory "${name}" already exists. Choose a different name.`);
  process.exit(1);
}

const s = p.spinner();
s.start("Creating project…");

mkdirSync(dir);
mkdirSync(join(dir, "src"));

write(dir, "package.json",   tplPackageJson(name, provider));
write(dir, "tsconfig.json",  tplTsconfig());
write(dir, ".env.example",   tplEnv(address, provider));
write(dir, ".gitignore",     tplGitignore());
write(dir, "README.md",      tplReadme(name, sats, address, provider));
write(join(dir, "src"), "server.ts", tplServer(sats, address));

s.stop("Project created.");

if (install) {
  const s2 = p.spinner();
  s2.start("Installing dependencies…");
  const ok = tryInstall(dir);
  ok ? s2.stop("Dependencies installed.") : s2.stop("npm install failed — run it manually.");
}

p.note(
  `cd ${name}\n` +
  `cp .env.example .env\n` +
  `# Add your ${provider === "blink" ? "Blink" : "OpenNode"} API key to .env\n` +
  (install ? "" : `npm install\n`) +
  `npm run dev\n\n` +
  `Then test:\n` +
  `curl http://localhost:3000/premium\n` +
  `→ HTTP 402 Payment Required ⚡`,
  "Next steps"
);

p.outro(`Docs → https://l402kit.com/docs`);
