/**
 * TDD — /admin dashboard (cookie-auth board interface)
 *
 * Three endpoints:
 *   POST /admin/login   — validates DASHBOARD_SECRET, sets HttpOnly cookie
 *   POST /admin/logout  — clears cookie
 *   GET  /admin         — returns HTML (login form if no cookie, dashboard if valid)
 *   GET  /admin/data    — JSON: aggregates verity state for the dashboard
 *
 * Philosophy: VERITY tem vida própria. Dashboard é interface de board/tesoureiro,
 * não admin SaaS. Read-mostly, com poucas ações humanas (encerrar lead, limpar alerta).
 */

import {
  handleAdminDashboard,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminData,
  handleAdminFeed,
  handleAdminTreasury,
  verifySessionCookie,
  signSessionCookie,
} from "../api/admin-dashboard";

function makeKV(initial: Record<string, string> = {}): KVNamespace {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async (opts?: { prefix?: string }) => {
      const prefix = opts?.prefix ?? "";
      const keys = [...store.keys()]
        .filter(k => k.startsWith(prefix))
        .map(name => ({ name }));
      return { keys, list_complete: true, cursor: "" };
    },
    getWithMetadata: async (k: string) => ({ value: store.get(k) ?? null, metadata: null }),
  } as unknown as KVNamespace;
}

const SECRET = "test-dashboard-secret";

function makeEnv(kv?: KVNamespace): import("../worker").Env {
  return {
    demo_preimages: kv ?? makeKV(),
    DASHBOARD_SECRET: SECRET,
  } as unknown as import("../worker").Env;
}

function req(path: string, init: RequestInit = {}): Request {
  return new Request(`https://l402kit.com${path}`, init);
}

// ─── Cookie signing primitives ───────────────────────────────────────────────

describe("session cookie signing", () => {
  it("round-trips a valid signed cookie", async () => {
    const cookie = await signSessionCookie(SECRET, Date.now() + 60_000);
    const verified = await verifySessionCookie(SECRET, cookie);
    expect(verified.ok).toBe(true);
  });

  it("rejects an expired cookie", async () => {
    const cookie = await signSessionCookie(SECRET, Date.now() - 1_000);
    const verified = await verifySessionCookie(SECRET, cookie);
    expect(verified.ok).toBe(false);
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookie = await signSessionCookie("other-secret", Date.now() + 60_000);
    const verified = await verifySessionCookie(SECRET, cookie);
    expect(verified.ok).toBe(false);
  });

  it("rejects a tampered cookie", async () => {
    const cookie = await signSessionCookie(SECRET, Date.now() + 60_000);
    const tampered = cookie.replace(/.$/, c => (c === "a" ? "b" : "a"));
    const verified = await verifySessionCookie(SECRET, tampered);
    expect(verified.ok).toBe(false);
  });
});

// ─── POST /admin/login ───────────────────────────────────────────────────────

describe("POST /admin/login", () => {
  it("returns 401 for wrong secret", async () => {
    const res = await handleAdminLogin(
      req("/admin/login", { method: "POST", body: JSON.stringify({ secret: "wrong" }) }),
      makeEnv(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 + Set-Cookie for correct secret", async () => {
    const res = await handleAdminLogin(
      req("/admin/login", { method: "POST", body: JSON.stringify({ secret: SECRET }) }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toMatch(/admin_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
  });

  it("rejects non-POST", async () => {
    const res = await handleAdminLogin(req("/admin/login"), makeEnv());
    expect(res.status).toBe(405);
  });
});

// ─── POST /admin/logout ──────────────────────────────────────────────────────

describe("POST /admin/logout", () => {
  it("clears the cookie", async () => {
    const res = await handleAdminLogout(req("/admin/logout", { method: "POST" }));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toMatch(/admin_session=;/);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});

// ─── GET /admin ──────────────────────────────────────────────────────────────

describe("GET /admin", () => {
  it("returns login HTML when no cookie present", async () => {
    const res = await handleAdminDashboard(req("/admin"), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toMatch(/login|secret/i);
  });

  it("returns dashboard HTML when cookie valid", async () => {
    const cookie = await signSessionCookie(SECRET, Date.now() + 60_000);
    const res = await handleAdminDashboard(
      req("/admin", { headers: { Cookie: `admin_session=${cookie}` } }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    // Dashboard markers — must mention VERITY status framing
    expect(body).toMatch(/VERITY/);
    expect(body).toMatch(/action-queue|Action queue|Fila/i);
  });

  it("returns login HTML when cookie invalid", async () => {
    const res = await handleAdminDashboard(
      req("/admin", { headers: { Cookie: "admin_session=not-a-real-cookie" } }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/login|secret/i);
  });
});

// ─── GET /admin/data ─────────────────────────────────────────────────────────

describe("GET /admin/data", () => {
  it("returns 401 without valid cookie", async () => {
    const res = await handleAdminData(req("/admin/data"), makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns aggregated JSON with valid cookie", async () => {
    const cookie = await signSessionCookie(SECRET, Date.now() + 60_000);
    const today = new Date().toISOString().slice(0, 10);

    const kv = makeKV({
      [`verity_fiscal:${today}`]: JSON.stringify({
        date: today,
        gross_sats: 1500,
        cogs_sats: 300,
        net_sats: 1200,
        calls: 7,
      }),
      "verity_radar:pending:human:hot": JSON.stringify([
        { url: "https://github.com/foo/bar", title: "hot lead", signal: "hot", persona: "human", score: 9, foundAt: new Date().toISOString(), expiresAt: Date.now() + 86_400_000 },
      ]),
      "verity_alerts": JSON.stringify([
        { key: "budget_low:2026-05-19", type: "budget_low", message: "80% used", createdAt: new Date().toISOString() },
      ]),
    });

    const res = await handleAdminData(
      req("/admin/data", { headers: { Cookie: `admin_session=${cookie}` } }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const data = await res.json() as {
      header: { receita_hoje_sats: number; status: string };
      action_queue: { hot_leads: unknown[]; alerts: unknown[] };
    };
    expect(data.header).toBeDefined();
    expect(data.header.receita_hoje_sats).toBe(1200);
    expect(data.action_queue).toBeDefined();
    expect(data.action_queue.hot_leads.length).toBeGreaterThanOrEqual(1);
    expect(data.action_queue.alerts.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── GET /admin/feed — 24h observation timeline ──────────────────────────────

describe("GET /admin/feed", () => {
  it("returns 401 without cookie", async () => {
    const res = await handleAdminFeed(req("/admin/feed"), makeEnv());
    expect(res.status).toBe(401);
  });

  it("aggregates RADAR + fiscal + acted leads into a chronological feed", async () => {
    const cookie = await signSessionCookie(SECRET, Date.now() + 60_000);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    const hourTs = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const prevHour = new Date(now.getTime() - 3_600_000).toISOString().slice(0, 13);

    const kv = makeKV({
      // RADAR hourly logs
      [`verity_radar:log:${hourTs}`]: JSON.stringify({ ts: now.toISOString(), found: 12, queued: 3, skipped: 9, errors: 0 }),
      [`verity_radar:log:${prevHour}`]: JSON.stringify({ ts: new Date(now.getTime() - 3_600_000).toISOString(), found: 8, queued: 1, skipped: 7, errors: 0 }),
      // Fiscal daily
      [`verity_fiscal:${today}`]: JSON.stringify({ date: today, net_sats: 1200, calls: 7 }),
      [`verity_fiscal:${yesterday}`]: JSON.stringify({ date: yesterday, net_sats: 800, calls: 4 }),
      // Acted leads (humans dismissed)
      "verity_radar:acted:abc123": JSON.stringify({ url: "https://github.com/foo/bar", date: new Date(now.getTime() - 1_800_000).toISOString() }),
    });

    const res = await handleAdminFeed(
      req("/admin/feed", { headers: { Cookie: `admin_session=${cookie}` } }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { events: Array<{ ts: string; type: string; summary: string }> };
    expect(Array.isArray(data.events)).toBe(true);
    // Should include radar runs, fiscal closes, acted leads
    const types = new Set(data.events.map(e => e.type));
    expect(types.has("radar_run")).toBe(true);
    expect(types.has("fiscal_close")).toBe(true);
    expect(types.has("lead_acted")).toBe(true);
    // Sorted descending by ts
    for (let i = 1; i < data.events.length; i++) {
      expect(data.events[i - 1].ts >= data.events[i].ts).toBe(true);
    }
  });

  it("returns empty events array when KV is bare", async () => {
    const cookie = await signSessionCookie(SECRET, Date.now() + 60_000);
    const res = await handleAdminFeed(
      req("/admin/feed", { headers: { Cookie: `admin_session=${cookie}` } }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const data = await res.json() as { events: unknown[] };
    expect(data.events).toEqual([]);
  });
});

// ─── GET /admin/treasury — 30d fiscal timeline ───────────────────────────────

describe("GET /admin/treasury", () => {
  it("returns 401 without cookie", async () => {
    const res = await handleAdminTreasury(req("/admin/treasury"), makeEnv());
    expect(res.status).toBe(401);
  });

  it("aggregates 30 days of fiscal data with totals + sparkline", async () => {
    const cookie = await signSessionCookie(SECRET, Date.now() + 60_000);
    const now = Date.now();
    const initial: Record<string, string> = {};
    // Populate 5 days of fiscal reports (gross > cogs so net positive)
    for (let i = 0; i < 5; i++) {
      const d = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
      initial[`verity_fiscal:${d}`] = JSON.stringify({
        date: d,
        gross_sats: 1000 + i * 100,
        cogs_sats: 200,
        net_sats: 800 + i * 100,
        calls: 5 + i,
      });
    }
    const kv = makeKV(initial);

    const res = await handleAdminTreasury(
      req("/admin/treasury", { headers: { Cookie: `admin_session=${cookie}` } }),
      makeEnv(kv),
    );
    expect(res.status).toBe(200);
    const data = await res.json() as {
      days: Array<{ date: string; net_sats: number }>;
      totals: { net_sats: number; gross_sats: number; cogs_sats: number; calls: number };
      sparkline: number[];
    };
    expect(data.days.length).toBe(30); // always 30 slots
    expect(data.totals.net_sats).toBe(800 + 900 + 1000 + 1100 + 1200);
    expect(data.totals.calls).toBe(5 + 6 + 7 + 8 + 9);
    expect(data.sparkline.length).toBe(30);
    // Days are oldest → newest so sparkline can be plotted left-to-right
    expect(data.days[0].date < data.days[29].date).toBe(true);
  });

  it("fills missing days with zeros (no fiscal report yet)", async () => {
    const cookie = await signSessionCookie(SECRET, Date.now() + 60_000);
    const res = await handleAdminTreasury(
      req("/admin/treasury", { headers: { Cookie: `admin_session=${cookie}` } }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const data = await res.json() as {
      days: Array<{ date: string; net_sats: number }>;
      totals: { net_sats: number };
    };
    expect(data.days.length).toBe(30);
    expect(data.totals.net_sats).toBe(0);
    expect(data.days.every(d => d.net_sats === 0)).toBe(true);
  });
});
