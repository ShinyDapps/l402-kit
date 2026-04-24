// Pure template generators — no I/O, no prompts.
// Extracted here so they can be imported and tested independently.

export function tplTsServer(priceSats, provider) {
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

export function tplTsPackageJson(projectName) {
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

export function tplTsconfig() {
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

export function tplEnvTs(provider) {
  return {
    alby:     `# Alby Hub — hub.getalby.com (self-custodial, 0% fee)\nALBY_TOKEN=your_alby_token\n\n# PORT=3000\n`,
    blink:    `# Blink — free at dashboard.blink.sv\nBLINK_API_KEY=your_blink_api_key\nBLINK_WALLET_ID=your_blink_wallet_id\n\n# PORT=3000\n`,
    opennode: `# OpenNode — app.opennode.com\nOPENNODE_API_KEY=your_opennode_key\n\n# PORT=3000\n`,
  }[provider];
}

export function tplPythonServer(priceSats) {
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

export function tplPythonRequirements() {
  return `fastapi>=0.110.0
uvicorn[standard]>=0.29.0
l402kit>=1.4.0
python-dotenv>=1.0.0
`;
}

export function tplGoServer(priceSats) {
  return `package main

import (
\t"encoding/json"
\t"fmt"
\t"net/http"
\t"os"
\t"time"

\tl402kit "github.com/shinydapps/l402-kit/go"
)

func main() {
\tlightning := l402kit.NewBlinkProvider(
\t\tos.Getenv("BLINK_API_KEY"),
\t\tos.Getenv("BLINK_WALLET_ID"),
\t)

\tmux := http.NewServeMux()
\tmux.Handle("/premium", l402kit.Middleware(l402kit.Options{
\t\tPriceSats: ${priceSats},
\t\tLightning: lightning,
\t}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
\t\tw.Header().Set("Content-Type", "application/json")
\t\tjson.NewEncoder(w).Encode(map[string]interface{}{
\t\t\t"message":    "Payment confirmed ⚡",
\t\t\t"price_sats": ${priceSats},
\t\t\t"timestamp":  time.Now().Format(time.RFC3339),
\t\t})
\t})))
\tfmt.Println("Listening on :3000")
\thttp.ListenAndServe(":3000", mux)
}
`;
}
