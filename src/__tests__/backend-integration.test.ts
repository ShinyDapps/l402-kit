/**
 * Backend Integration Tests — l402-kit
 *
 * Testa os endpoints da API ao vivo (https://l402kit.vercel.app).
 * Para rodar: INTEGRATION=1 npx jest backend-integration
 *
 * Por padrão skippados em CI para não depender de rede/Blink.
 * Em dev: INTEGRATION=1 npm test -- backend-integration
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = "https://l402kit.vercel.app";
const RUN = process.env.INTEGRATION === "1";
const it_live = RUN ? it : it.skip;

async function json(r: Response): Promise<any> {
  return r.json();
}

// ── /api/invoice ──────────────────────────────────────────────────────────────

describe("/api/invoice", () => {
  it_live("retorna paymentRequest + paymentHash + macaroon para 100 sats", async () => {
    const r = await fetch(`${BASE}/api/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountSats: 100 }),
    });
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d).toHaveProperty("paymentRequest");
    expect(d).toHaveProperty("paymentHash");
    expect(d).toHaveProperty("macaroon");
    expect(typeof d.paymentRequest).toBe("string");
    expect(d.paymentRequest.startsWith("lnbc")).toBe(true);
    expect(d.paymentHash).toMatch(/^[0-9a-f]{64}$/);
    const mac = JSON.parse(Buffer.from(d.macaroon, "base64").toString());
    expect(mac).toHaveProperty("hash");
    expect(mac).toHaveProperty("exp");
    expect(mac.hash).toBe(d.paymentHash);
    expect(mac.exp).toBeGreaterThan(Date.now());
  });

  it_live("rejeita amountSats ausente — 400", async () => {
    const r = await fetch(`${BASE}/api/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });

  it_live("rejeita amountSats = 0 — 400", async () => {
    const r = await fetch(`${BASE}/api/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountSats: 0 }),
    });
    expect(r.status).toBe(400);
  });

  it_live("rejeita método GET — 405", async () => {
    const r = await fetch(`${BASE}/api/invoice`);
    expect(r.status).toBe(405);
  });
});

// ── /api/waitlist ─────────────────────────────────────────────────────────────

describe("/api/waitlist", () => {
  const testEmail = `integration-test-${Date.now()}@l402kit.dev`;

  it_live("aceita email válido — 200", async () => {
    const r = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d.ok).toBe(true);
  });

  it_live("segundo envio do mesmo email retorna 200 (idempotente)", async () => {
    const r = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    expect(r.status).toBe(200);
  });

  it_live("rejeita email inválido — 400", async () => {
    const r = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "notanemail" }),
    });
    expect(r.status).toBe(400);
  });

  it_live("rejeita body vazio — 400", async () => {
    const r = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });

  it_live("rejeita GET — 405", async () => {
    const r = await fetch(`${BASE}/api/waitlist`);
    expect(r.status).toBe(405);
  });
});

// ── /api/pro-check ────────────────────────────────────────────────────────────

describe("/api/pro-check", () => {
  it_live("retorna { pro: false } para address inexistente", async () => {
    const r = await fetch(`${BASE}/api/pro-check?address=nobody@nonexistent.sv`);
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d.pro).toBe(false);
  });

  it_live("retorna 400 sem address", async () => {
    const r = await fetch(`${BASE}/api/pro-check`);
    expect(r.status).toBe(400);
  });
});

// ── /api/stats ────────────────────────────────────────────────────────────────

describe("/api/stats — proteção de acesso", () => {
  it_live("retorna 401 sem secret", async () => {
    const r = await fetch(`${BASE}/api/stats`);
    expect(r.status).toBe(401);
  });

  it_live("retorna 401 com secret errado", async () => {
    const r = await fetch(`${BASE}/api/stats`, {
      headers: { "x-dashboard-secret": "wrong-secret" },
    });
    expect(r.status).toBe(401);
  });
});

// ── /api/pro-subscribe — validações sem pagar ─────────────────────────────────

describe("/api/pro-subscribe — validações", () => {
  it_live("rejeita tier inválido — 400", async () => {
    const r = await fetch(`${BASE}/api/pro-subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lightningAddress: "you@blink.sv", tier: "hacker" }),
    });
    expect(r.status).toBe(400);
  });

  it_live("rejeita body sem lightningAddress — 400", async () => {
    const r = await fetch(`${BASE}/api/pro-subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "pro" }),
    });
    expect(r.status).toBe(400);
  });

  it_live("rejeita GET — 405", async () => {
    const r = await fetch(`${BASE}/api/pro-subscribe`);
    expect(r.status).toBe(405);
  });
});

// ── /api/pro-poll — validações sem paymentHash real ──────────────────────────

describe("/api/pro-poll — validações", () => {
  it_live("retorna 400 sem paymentHash", async () => {
    const r = await fetch(`${BASE}/api/pro-poll?address=you@blink.sv&tier=pro`);
    expect(r.status).toBe(400);
  });

  it_live("retorna paid:false para hash inexistente", async () => {
    const fakeHash = "a".repeat(64);
    const r = await fetch(
      `${BASE}/api/pro-poll?paymentHash=${fakeHash}&address=you@blink.sv&tier=pro`
    );
    expect([200, 404]).toContain(r.status);
    if (r.status === 200) {
      const d = await json(r);
      expect(d.paid).toBe(false);
    }
  });
});

// ── Segurança: dev endpoints não devem expor dados sem auth ──────────────────

describe("segurança — dev endpoints", () => {
  it_live("/api/dev-stats sem auth não retorna 200", async () => {
    const r = await fetch(`${BASE}/api/dev-stats`);
    expect(r.status).not.toBe(200);
  });

  it_live("/api/dev-token sem auth não retorna 200", async () => {
    const r = await fetch(`${BASE}/api/dev-token`);
    expect(r.status).not.toBe(200);
  });
});

// ── Segurança: Supabase RLS — anon key não deve ler dados sensíveis ───────────

describe("segurança — Supabase RLS", () => {
  const SB_URL = "https://urcqtpklpfyvizcgcsia.supabase.co";
  const ANON_KEY = "sb_publishable_v_dOX1JVgEm_vlT-Qr5lsw_EQHc-av-";

  it_live("anon key NÃO pode ver registros em pro_access (Lightning Addresses protegidas)", async () => {
    const r = await fetch(`${SB_URL}/rest/v1/pro_access?select=address&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    if (r.status === 200) {
      const d = await json(r);
      expect(Array.isArray(d)).toBe(true);
      expect(d.length).toBe(0);
    } else {
      expect(r.status).toBe(403);
    }
  });

  it_live("anon key pode inserir na waitlist (captura pública)", async () => {
    const r = await fetch(`${SB_URL}/rest/v1/waitlist`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ email: `rls-test-${Date.now()}@l402kit.dev` }),
    });
    expect([200, 201, 409]).toContain(r.status);
  });
});

// ── Smoke tests — landing e links públicos ────────────────────────────────────

describe("smoke tests — landing e links públicos", () => {
  it_live("landing page retorna 200", async () => {
    const r = await fetch(BASE);
    expect(r.status).toBe(200);
  });

  it_live("mempool.space retorna preço BTC válido", async () => {
    const r = await fetch("https://mempool.space/api/v1/prices");
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(typeof d.USD).toBe("number");
    expect(d.USD).toBeGreaterThan(0);
  });

  it_live("npm package l402-kit existe e está publicado", async () => {
    const r = await fetch("https://registry.npmjs.org/l402-kit/latest");
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d.name).toBe("l402-kit");
  });

  it_live("PyPI package l402kit existe e está publicado", async () => {
    const r = await fetch("https://pypi.org/pypi/l402kit/json");
    expect(r.status).toBe(200);
    const d = await json(r);
    expect(d.info.name).toBe("l402kit");
  });

  it_live("OG image PNG acessível em /logos/og-1200x630.png", async () => {
    const r = await fetch(`${BASE}/logos/og-1200x630.png`);
    expect(r.status).toBe(200);
    const ct = r.headers.get("content-type") ?? "";
    expect(ct).toMatch(/image\/png/);
    const buf = await r.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(50_000);
  });
});
