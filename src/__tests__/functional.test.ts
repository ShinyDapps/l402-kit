/**
 * Testes funcionais — l402-kit
 *
 * Cobrem os deltas entre o código antigo em produção e as mudanças novas:
 *   1. OG PNG  — backend/logos/og-1200x630.png + meta tags corrigidas
 *   2. Resend  — welcome email automático ao signup do waitlist
 *   3. Infra   — chave Resend válida, domínio configurado, Cloudflare READY
 *
 * Rodar:
 *   INTEGRATION=1 RESEND_API_KEY=re_xxx npx jest functional
 *
 * Dependência opcional: RESEND_API_KEY no ambiente para testes Resend diretos.
 * Sem ela, os testes Resend são skippados graciosamente.
 */

const BASE = "https://l402kit.com";
const RUN = process.env.INTEGRATION === "1";
const RESEND_KEY = process.env.RESEND_API_KEY ?? "";
const HAS_RESEND = RUN && RESEND_KEY.length > 0;

const it_live = RUN ? it : it.skip;
const it_resend = HAS_RESEND ? it : it.skip;

// ─── helpers ──────────────────────────────────────────────────────────────────

async function resendGet(path: string) {
  const r = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  });
  return { status: r.status, body: await r.json() as any };
}

async function resendPost(path: string, body: unknown) {
  const r = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() as any };
}

// ─── 1. OG IMAGE ──────────────────────────────────────────────────────────────
// Delta: antes apontava para /docs/logo/og-1200x630.svg (rota redirectada para
// Mintlify → arquivo inexistente). Agora serve PNG estático em /logos/.

describe("[OG] og:image PNG em produção", () => {
  it_live("GET /logos/og-1200x630.png → 200 com content-type image/png", async () => {
    const r = await fetch(`${BASE}/logos/og-1200x630.png`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/image\/png/);
  });

  it_live("PNG tem tamanho mínimo esperado (≥ 50KB)", async () => {
    const r = await fetch(`${BASE}/logos/og-1200x630.png`);
    const buf = await r.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThanOrEqual(50_000);
  });

  it_live("landing page inclui og:image apontando para PNG (não SVG)", async () => {
    const r = await fetch(BASE);
    const html = await r.text();
    expect(html).toMatch(/og:image.*logos\/og-1200x630\.png/);
    expect(html).not.toMatch(/og:image.*\.svg/);
  });

  it_live("landing page inclui twitter:image apontando para PNG", async () => {
    const r = await fetch(BASE);
    const html = await r.text();
    expect(html).toMatch(/twitter:image.*logos\/og-1200x630\.png/);
  });

  it_live("og:image:type é image/png", async () => {
    const r = await fetch(BASE);
    const html = await r.text();
    expect(html).toMatch(/og:image:type.*image\/png/);
  });
});

// ─── 2. RESEND — infra ────────────────────────────────────────────────────────
// Delta: RESEND_API_KEY configurada no Cloudflare Workers (wrangler secret).

describe("[Resend] infraestrutura de email", () => {
  it_resend("API key ativa é válida (GET /api-keys retorna 200)", async () => {
    const { status } = await resendGet("/api-keys");
    expect(status).toBe(200);
  });

  it_resend("existe exatamente 1 chave ativa (antiga foi revogada)", async () => {
    const { body } = await resendGet("/api-keys");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
  });

  it_resend("chave ativa tem nome 'kt402'", async () => {
    const { body } = await resendGet("/api-keys");
    expect(body.data[0].name).toBe("kt402");
  });

  it_resend("domínio l402kit.com existe no Resend", async () => {
    const { body } = await resendGet("/domains");
    const domain = body.data?.find((d: any) => d.name === "l402kit.com");
    expect(domain).toBeDefined();
  });

  it_resend("domínio l402kit.com tem region us-east-1", async () => {
    const { body } = await resendGet("/domains");
    const domain = body.data?.find((d: any) => d.name === "l402kit.com");
    expect(domain?.region).toBe("us-east-1");
  });

  it_resend("domínio tem registro DKIM configurado", async () => {
    const { body } = await resendGet("/domains");
    const domain = body.data?.find((d: any) => d.name === "l402kit.com");
    expect(domain).toBeDefined();
    const detail = await resendGet(`/domains/${domain.id}`);
    const dkim = detail.body.records?.find((r: any) => r.record === "DKIM");
    expect(dkim).toBeDefined();
    expect(dkim.type).toBe("TXT");
    expect(dkim.name).toBe("resend._domainkey");
  });

  it_resend("domínio tem registro SPF (MX + TXT) configurado", async () => {
    const { body } = await resendGet("/domains");
    const domain = body.data?.find((d: any) => d.name === "l402kit.com");
    const detail = await resendGet(`/domains/${domain.id}`);
    const spfRecords = detail.body.records?.filter((r: any) => r.record === "SPF");
    expect(spfRecords?.length).toBeGreaterThanOrEqual(2);
    const hasMX = spfRecords?.some((r: any) => r.type === "MX");
    const hasTXT = spfRecords?.some((r: any) => r.type === "TXT");
    expect(hasMX).toBe(true);
    expect(hasTXT).toBe(true);
  });
});

// ─── 3. RESEND — envio real ────────────────────────────────────────────────────
// Delta: onboarding@resend.dev funciona hoje. hello@l402kit.com = pendente DNS.

describe("[Resend] envio de email", () => {
  it_resend("envia com onboarding@resend.dev → 200 com ID de email", async () => {
    const { status, body } = await resendPost("/emails", {
      from: "l402-kit <onboarding@resend.dev>",
      to: "thiagoyoshiaki@gmail.com",
      subject: "[l402-kit] functional test",
      html: "<p>Teste funcional automatizado — <strong>l402-kit</strong>.</p>",
    });
    expect(status).toBe(200);
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
  });

  it_resend("hello@l402kit.com rejeitado (403) enquanto domínio não verificado", async () => {
    const { status, body } = await resendPost("/emails", {
      from: "l402-kit <hello@l402kit.com>",
      to: "thiagoyoshiaki@gmail.com",
      subject: "test",
      html: "<p>test</p>",
    });
    expect(status).toBe(403);
    expect(body.name).toBe("validation_error");
    expect(body.message).toMatch(/not verified/i);
  });
});

// ─── 4. WAITLIST — endpoint com email ────────────────────────────────────────
// Delta: antes só salvava no Supabase. Agora dispara email via Resend.

describe("[Waitlist] endpoint /api/waitlist com Resend integrado", () => {
  const uniq = `functional-${Date.now()}@l402kit.test`;

  it_live("novo email → 200 + ok:true", async () => {
    const r = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: uniq }),
    });
    expect(r.status).toBe(200);
    const d = await r.json() as any;
    expect(d.ok).toBe(true);
  });

  it_live("email duplicado → 200 + ok:true (idempotente, sem segundo email)", async () => {
    const r = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: uniq }),
    });
    expect(r.status).toBe(200);
  });

  it_live("email inválido → 400", async () => {
    const r = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nope" }),
    });
    expect(r.status).toBe(400);
  });

  it_live("body vazio → 400", async () => {
    const r = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });

  it_live("GET → 405 (método não permitido)", async () => {
    const r = await fetch(`${BASE}/api/waitlist`);
    expect(r.status).toBe(405);
  });

  it_live("resposta não vaza stack trace ou dados internos", async () => {
    const r = await fetch(`${BASE}/api/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bad" }),
    });
    const text = await r.text();
    expect(text).not.toMatch(/supabase/i);
    expect(text).not.toMatch(/resend/i);
    expect(text).not.toMatch(/stack/i);
    expect(text).not.toMatch(/re_[A-Za-z0-9]/); // nunca vaza API key
  });
});

// ─── 5. RESEND WEBHOOK — endpoint em produção ─────────────────────────────────
// Delta: novo endpoint /api/resend-webhook com verificação Svix.

describe("[Resend Webhook] /api/resend-webhook em produção", () => {
  it_live("GET → 405 (só aceita POST)", async () => {
    const r = await fetch(`${BASE}/api/resend-webhook`);
    expect(r.status).toBe(405);
  });

  it_live("POST sem headers Svix → 400", async () => {
    const r = await fetch(`${BASE}/api/resend-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email.delivered", data: { email_id: "x" } }),
    });
    expect(r.status).toBe(400);
  });

  it_live("POST com assinatura inválida → 401", async () => {
    const r = await fetch(`${BASE}/api/resend-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": "msg_fake",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,invalidsignature==",
      },
      body: JSON.stringify({ type: "email.delivered", data: { email_id: "x" } }),
    });
    expect(r.status).toBe(401);
  });

  it_live("response não vaza internal state em nenhum erro", async () => {
    const r = await fetch(`${BASE}/api/resend-webhook`, { method: "POST",
      headers: { "Content-Type": "application/json",
        "svix-id": "msg_fake", "svix-timestamp": "123", "svix-signature": "v1,bad==" },
      body: JSON.stringify({}),
    });
    const text = await r.text();
    expect(text).not.toMatch(/supabase/i);
    expect(text).not.toMatch(/stack/i);
    expect(text).not.toMatch(/whsec_/i);
  });
});

// ─── 6. STATS — emailStats no response ────────────────────────────────────────
// Delta: stats.ts agora retorna emailStats + recentWaitlist.

describe("[Stats] /api/stats — emailStats e waitlist", () => {
  const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET ?? "shdp_dash_mK9pL2xQwRtNvJ4eHcBfUu3YsA7dZiXo";

  it_live("retorna emailStats com campos esperados", async () => {
    const r = await fetch(`${BASE}/api/stats`, {
      headers: { "x-dashboard-secret": DASHBOARD_SECRET },
    });
    expect(r.status).toBe(200);
    const d = await r.json() as any;
    expect(d).toHaveProperty("emailStats");
    expect(typeof d.emailStats.total).toBe("number");
    expect(typeof d.emailStats.delivered).toBe("number");
    expect(typeof d.emailStats.bounced).toBe("number");
    expect(typeof d.emailStats.sending).toBe("number");
    expect(typeof d.emailStats.pending).toBe("number");
    expect(typeof d.emailStats.complained).toBe("number");
  });

  it_live("retorna recentWaitlist como array", async () => {
    const r = await fetch(`${BASE}/api/stats`, {
      headers: { "x-dashboard-secret": DASHBOARD_SECRET },
    });
    const d = await r.json() as any;
    expect(Array.isArray(d.recentWaitlist)).toBe(true);
  });

  it_live("recentWaitlist items têm campos: email, email_status, resend_id, created_at", async () => {
    const r = await fetch(`${BASE}/api/stats`, {
      headers: { "x-dashboard-secret": DASHBOARD_SECRET },
    });
    const d = await r.json() as any;
    if (d.recentWaitlist.length > 0) {
      const item = d.recentWaitlist[0];
      expect(item).toHaveProperty("email");
      expect(item).toHaveProperty("email_status");
      expect(item).toHaveProperty("resend_id");
      expect(item).toHaveProperty("created_at");
    }
  });

  it_live("sem secret → 401", async () => {
    const r = await fetch(`${BASE}/api/stats`);
    expect(r.status).toBe(401);
  });

  it_live("secret errado → 401", async () => {
    const r = await fetch(`${BASE}/api/stats`, {
      headers: { "x-dashboard-secret": "wrong" },
    });
    expect(r.status).toBe(401);
  });
});

// ─── 7. DELETE DATA — endpoint /api/delete-data ───────────────────────────────

describe("[Delete Data] /api/delete-data", () => {
  it_live("GET → 405", async () => {
    const r = await fetch(`${BASE}/api/delete-data`);
    expect(r.status).toBe(405);
  });

  it_live("POST body vazio → 400", async () => {
    const r = await fetch(`${BASE}/api/delete-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });

  it_live("lightningAddress inválido (sem @) → 400", async () => {
    const r = await fetch(`${BASE}/api/delete-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lightningAddress: "notanemail" }),
    });
    expect(r.status).toBe(400);
  });

  it_live("lightningAddress válido desconhecido → 200 com deleted.payments=0", async () => {
    const r = await fetch(`${BASE}/api/delete-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lightningAddress: "nonexistent@blink.sv" }),
    });
    expect(r.status).toBe(200);
    const d = await r.json() as any;
    expect(d).toHaveProperty("deleted");
    expect(typeof d.deleted.payments).toBe("number");
    expect(d.deleted.payments).toBe(0);
    expect(typeof d.deleted.proAccess).toBe("boolean");
  });

  it_live("response não vaza stack trace ou internal state", async () => {
    const r = await fetch(`${BASE}/api/delete-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lightningAddress: "bad" }),
    });
    const text = await r.text();
    expect(text).not.toMatch(/supabase/i);
    expect(text).not.toMatch(/stack/i);
    expect(text).not.toMatch(/SERVICE_KEY/i);
  });
});

// ─── 9. CLOUDFLARE — ambiente de produção ────────────────────────────────────

describe("[Cloudflare] ambiente de produção", () => {
  it_live("Pages: landing retorna 200", async () => {
    const r = await fetch(BASE);
    expect(r.status).toBe(200);
  });

  it_live("Workers: /api/invoice rejeita body vazio com 400", async () => {
    const r = await fetch(`${BASE}/api/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
  });

  it_live("Pages: /dashboard acessível", async () => {
    const r = await fetch(`${BASE}/dashboard`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/x-dashboard-secret/);
  });

  it_live("Workers: CORS headers presentes", async () => {
    const r = await fetch(`${BASE}/api/invoice`, { method: "OPTIONS" });
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
  });
});
