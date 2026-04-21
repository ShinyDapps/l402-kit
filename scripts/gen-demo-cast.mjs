#!/usr/bin/env node
// Generates demo.cast (asciinema v2 format) for l402-kit demo
// Run: node scripts/gen-demo-cast.mjs
// Then: npx svg-term-cli --in scripts/demo.cast --out docs/demo.svg --window --width 82 --height 25

import { writeFileSync } from "fs";

const RESET   = "\u001b[0m";
const BOLD    = "\u001b[1m";
const GREEN   = "\u001b[32m";
const YELLOW  = "\u001b[33m";
const CYAN    = "\u001b[36m";
const GRAY    = "\u001b[90m";
const ORANGE  = "\u001b[38;5;214m";
const WHITE   = "\u001b[97m";

const PROMPT = `${BOLD}${GREEN}❯${RESET} `;
const NL = "\r\n";

// Helper: type text character by character
function type(text, startTime, charDelay = 0.04) {
  const events = [];
  let t = startTime;
  for (const ch of text) {
    events.push([+t.toFixed(3), "o", ch]);
    t += charDelay;
  }
  return { events, end: t };
}

// Helper: instant output block
function output(text, time) {
  return { events: [[+time.toFixed(3), "o", text]], end: time + 0.05 };
}

let events = [];
let t = 0.5;

function push(block) {
  events.push(...block.events);
  t = block.end + 0.1;
}

// ── Scene 1: show prompt + npm install ───────────────────────────────────────
push(output(PROMPT, t));
const s1 = type("npm install l402-kit", t + 0.1);
push(s1);
t = s1.end + 0.3;
push(output(NL, t));
t += 0.2;
push(output(
  `${GRAY}added 4 packages in 1.2s${RESET}${NL}` +
  `${GREEN}✓${RESET} installed ${BOLD}l402-kit@0.9.2${RESET}${NL}`,
  t
));
t += 1.2;

// ── Scene 2: cat server.js ────────────────────────────────────────────────────
push(output(NL + PROMPT, t));
const s2 = type("cat server.js", t + 0.1);
push(s2);
t = s2.end + 0.3;
push(output(NL, t));
t += 0.2;
push(output(
  `${GRAY}// server.js${RESET}${NL}` +
  `${CYAN}import${RESET} express ${CYAN}from${RESET} ${YELLOW}"express"${RESET}${NL}` +
  `${CYAN}import${RESET} { l402, BlinkProvider } ${CYAN}from${RESET} ${YELLOW}"l402-kit"${RESET}${NL}` +
  NL +
  `${CYAN}const${RESET} app = express()${NL}` +
  `${CYAN}const${RESET} lightning = ${CYAN}new${RESET} BlinkProvider(${NL}` +
  `  process.env.BLINK_API_KEY,${NL}` +
  `  process.env.BLINK_WALLET_ID${NL}` +
  `)${NL}` +
  NL +
  `app.get(${YELLOW}"/premium"${RESET}, ${ORANGE}l402${RESET}({ priceSats: ${YELLOW}21${RESET}, lightning }), (req, res) => {${NL}` +
  `  res.json({ data: ${YELLOW}"₿ You paid 21 sats!"${RESET} })${NL}` +
  `})${NL}` +
  NL +
  `app.listen(${YELLOW}3000${RESET})${NL}`,
  t
));
t += 2.0;

// ── Scene 3: curl without payment → 402 ──────────────────────────────────────
push(output(NL + PROMPT, t));
const s3 = type("curl http://localhost:3000/premium", t + 0.1);
push(s3);
t = s3.end + 0.4;
push(output(NL, t));
t += 0.5;
push(output(
  `{${NL}` +
  `  ${CYAN}"error"${RESET}: ${YELLOW}"Payment Required"${RESET},${NL}` +
  `  ${CYAN}"priceSats"${RESET}: ${YELLOW}21${RESET},${NL}` +
  `  ${CYAN}"invoice"${RESET}: ${YELLOW}"lnbc210n1p5r7x3..."${RESET},${NL}` +
  `  ${CYAN}"macaroon"${RESET}: ${YELLOW}"eyJoYXNoIjoiNGJj..."${RESET}${NL}` +
  `}${NL}`,
  t
));
t += 1.5;

// ── Scene 4: "paying..." ──────────────────────────────────────────────────────
push(output(
  NL + `${GRAY}# ⚡ agent pays the Lightning invoice autonomously...${RESET}${NL}`,
  t
));
t += 1.0;

// ── Scene 5: curl WITH L402 token → 200 ──────────────────────────────────────
push(output(NL + PROMPT, t));
const cmd5 = 'curl http://localhost:3000/premium \\\n     -H "Authorization: L402 eyJo...:4bcd..."';
const s5 = type(cmd5, t + 0.1, 0.025);
push(s5);
t = s5.end + 0.4;
push(output(NL, t));
t += 0.5;
push(output(
  `{${NL}` +
  `  ${CYAN}"data"${RESET}: ${YELLOW}"₿ You paid 21 sats!"${RESET}${NL}` +
  `}${NL}`,
  t
));
t += 1.0;

// ── Scene 6: tagline ─────────────────────────────────────────────────────────
push(output(
  NL +
  `${BOLD}${ORANGE}  ⚡ l402-kit${RESET} ${GRAY}v0.9.2${RESET} — Bitcoin Lightning pay-per-call in 3 lines${NL}` +
  `${GRAY}  npm i l402-kit  •  pip install l402kit  •  cargo add l402kit  •  go get .../go${RESET}${NL}` +
  `${GRAY}  github.com/ShinyDapps/l402-kit${RESET}${NL}`,
  t
));
t += 2.0;

// ── Write cast file ───────────────────────────────────────────────────────────
const header = JSON.stringify({
  version: 2,
  width: 82,
  height: 25,
  timestamp: 1745193600,  // 2026-04-21
  title: "l402-kit demo — Lightning pay-per-call in 3 lines",
});

const body = events.map(e => JSON.stringify(e)).join("\n");
const cast = header + "\n" + body + "\n";

writeFileSync("scripts/demo.cast", cast, "utf8");
console.log(`✅ demo.cast written (${events.length} events, ${(cast.length/1024).toFixed(1)} KB)`);
console.log("Run: npx svg-term-cli --in scripts/demo.cast --out docs/demo.svg --window --width 82 --height 25 --no-optimize");
