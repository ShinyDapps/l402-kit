#!/usr/bin/env node
// Run: node scripts/set-secrets.mjs
// Reads secrets from environment and uploads to Cloudflare Workers
import { execSync } from "child_process";

const secrets = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_KEY",
  "SPLIT_SECRET",
  "DASHBOARD_SECRET",
];

for (const name of secrets) {
  const val = process.env[name];
  if (!val) { console.warn(`⚠  ${name} not set — skipping`); continue; }
  try {
    execSync(`echo "${val}" | wrangler secret put ${name}`, { stdio: "inherit" });
    console.log(`✅ ${name} set`);
  } catch (e) {
    console.error(`❌ ${name} failed:`, e.message);
  }
}
