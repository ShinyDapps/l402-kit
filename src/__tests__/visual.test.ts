/**
 * Testes visuais / estruturais — l402-kit
 *
 * Verificam a estrutura HTML de páginas e templates de email sem precisar
 * de browser. Leem os arquivos diretamente e fazem assertions de conteúdo,
 * atributos, classes CSS e meta tags.
 *
 * Rodar: npx jest visual
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../backend");

function readHtml(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf-8");
}

// ─── Landing page (index.html) ────────────────────────────────────────────────

describe("[Visual] landing page — index.html", () => {
  let html: string;
  beforeAll(() => { html = readHtml("index.html"); });

  it("tem charset UTF-8", () => {
    expect(html).toMatch(/charset=["']?UTF-8/i);
  });

  it("og:image aponta para PNG (não SVG)", () => {
    const match = html.match(/og:image[^>]*content=["']([^"']+)["']/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/\.png$/);
    expect(match![1]).not.toMatch(/\.svg$/);
  });

  it("og:image está em /logos/ (não em /docs/ que redireciona para Mintlify)", () => {
    expect(html).toMatch(/logos\/og-1200x630\.png/);
    expect(html).not.toMatch(/docs\/logo\/og.*\.svg/);
  });

  it("twitter:card é summary_large_image", () => {
    expect(html).toMatch(/twitter:card[^>]*summary_large_image/);
  });

  it("twitter:image aponta para PNG", () => {
    const match = html.match(/twitter:image[^>]*content=["']([^"']+)["']/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/\.png$/);
  });

  it("og:image:type é image/png", () => {
    expect(html).toMatch(/og:image:type[^>]*image\/png/);
  });

  it("tem og:url apontando para l402kit.vercel.app", () => {
    expect(html).toMatch(/og:url[^>]*l402kit\.vercel\.app/);
  });

  it("tem og:title definido", () => {
    expect(html).toMatch(/og:title/);
  });

  it("título contém 'l402-kit'", () => {
    expect(html).toMatch(/<title>[^<]*l402-kit[^<]*<\/title>/i);
  });

  it("contém CTA de waitlist (input email ou form)", () => {
    expect(html).toMatch(/waitlist|email.*subscribe|subscribe.*email/i);
  });

  it("menciona fee 0.3%", () => {
    expect(html).toMatch(/0\.3%/);
  });

  it("menciona 4 linguagens: TypeScript, Python, Go, Rust", () => {
    expect(html).toMatch(/typescript/i);
    expect(html).toMatch(/python/i);
    expect(html).toMatch(/\bgo\b/i);
    expect(html).toMatch(/rust/i);
  });

  it("referencia /api/waitlist para o form de cadastro", () => {
    expect(html).toMatch(/\/api\/waitlist/);
  });

  it("não tem credenciais ou chaves expostas", () => {
    expect(html).not.toMatch(/re_[A-Za-z0-9]{20,}/);   // Resend key
    expect(html).not.toMatch(/blink_[A-Za-z0-9]{20,}/); // Blink key
    expect(html).not.toMatch(/whsec_/);                  // webhook secret
    expect(html).not.toMatch(/sbp_[A-Za-z0-9]{20,}/);   // Supabase PAT
  });
});

// ─── Dashboard (dashboard.html) ───────────────────────────────────────────────

describe("[Visual] dashboard — dashboard.html", () => {
  let html: string;
  beforeAll(() => { html = readHtml("dashboard.html"); });

  it("tem cards de pagamentos: totalPayments, totalSats, shinydappsFee", () => {
    expect(html).toMatch(/id="totalPayments"/);
    expect(html).toMatch(/id="totalSats"/);
    expect(html).toMatch(/id="shinydappsFee"/);
  });

  it("tem cards de email: emailTotal, emailDelivered, emailSending, emailBounced", () => {
    expect(html).toMatch(/id="emailTotal"/);
    expect(html).toMatch(/id="emailDelivered"/);
    expect(html).toMatch(/id="emailSending"/);
    expect(html).toMatch(/id="emailBounced"/);
  });

  it("tem tabela de waitlist recente (#waitlistTable)", () => {
    expect(html).toMatch(/id="waitlistTable"/);
  });

  it("tem CSS classes para status pills", () => {
    expect(html).toMatch(/status-pending/);
    expect(html).toMatch(/status-delivered/);
    expect(html).toMatch(/status-bounced/);
    expect(html).toMatch(/status-complained/);
    expect(html).toMatch(/status-sending/);
  });

  it("busca /api/stats com x-dashboard-secret", () => {
    expect(html).toMatch(/\/api\/stats/);
    expect(html).toMatch(/x-dashboard-secret/);
  });

  it("processa emailStats do response", () => {
    expect(html).toMatch(/emailStats/);
    expect(html).toMatch(/recentWaitlist/);
  });

  it("tem tabela byOwner para pagamentos", () => {
    expect(html).toMatch(/id="byOwnerTable"/);
    expect(html).toMatch(/id="recentTable"/);
  });

  it("tem botão de refresh", () => {
    expect(html).toMatch(/loadStats\(\)/);
    expect(html).toMatch(/Atualizar|refresh/i);
  });

  it("não tem credenciais expostas", () => {
    expect(html).not.toMatch(/shdp_dash_/);
    expect(html).not.toMatch(/re_[A-Za-z0-9]{20,}/);
  });

  it("tem login com password input antes de mostrar dados", () => {
    expect(html).toMatch(/type="password"/);
    expect(html).toMatch(/id="loginView"/);
    expect(html).toMatch(/id="appView"/);
  });
});

// ─── Email template (welcome HTML) ────────────────────────────────────────────

describe("[Visual] welcome email — template HTML", () => {
  let html: string;

  beforeAll(() => {
    // Extrai WELCOME_HTML do waitlist.ts via regex (evita importar todo o handler)
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../backend/api/waitlist.ts"), "utf-8"
    );
    const match = src.match(/const WELCOME_HTML = `([\s\S]*?)`;/);
    expect(match).not.toBeNull();
    html = match![1];
  });

  it("é HTML válido com DOCTYPE", () => {
    expect(html.trim()).toMatch(/^<!DOCTYPE html>/i);
  });

  it("tem subject visual: 'You're on the list'", () => {
    expect(html).toMatch(/You're on the list/);
  });

  it("tem snippet de código TypeScript com l402-kit", () => {
    expect(html).toMatch(/l402-kit/);
    expect(html).toMatch(/TYPESCRIPT/i);
    expect(html).toMatch(/ownerLightningAddress/);
  });

  it("tem 4 benefícios listados", () => {
    expect(html).toMatch(/Pay-per-call in sats/i);
    expect(html).toMatch(/No bank, no account/i);
    expect(html).toMatch(/AI agent native/i);
    expect(html).toMatch(/0\.3% flat fee/i);
  });

  it("tem 2 CTAs: landing page e docs", () => {
    expect(html).toMatch(/l402kit\.vercel\.app/);
    expect(html).toMatch(/mintlify\.app/);
    expect(html).toMatch(/View landing page/i);
    expect(html).toMatch(/Read the docs/i);
  });

  it("from é onboarding@resend.dev (domínio ainda não verificado)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../backend/api/waitlist.ts"), "utf-8"
    );
    expect(src).toMatch(/onboarding@resend\.dev/);
    expect(src).not.toMatch(/hello@l402kit\.com.*from/); // não no campo from
  });

  it("cor da marca (#F7931A bitcoin orange) está presente", () => {
    expect(html).toMatch(/#F7931A/i);
  });

  it("fundo escuro (#07080E) está presente", () => {
    expect(html).toMatch(/#07080E/i);
  });

  it("tem footer com link para GitHub ShinyDapps", () => {
    expect(html).toMatch(/github\.com\/ShinyDapps/);
  });

  it("não tem credenciais ou chaves expostas no template", () => {
    expect(html).not.toMatch(/re_[A-Za-z0-9]{20,}/);
    expect(html).not.toMatch(/whsec_/);
  });
});

// ─── resend-webhook.ts — estrutura do handler ─────────────────────────────────

describe("[Visual] resend-webhook — estrutura do código", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, "../../backend/api/resend-webhook.ts"), "utf-8"
    );
  });

  it("verifica todas as 4 headers Svix", () => {
    expect(src).toMatch(/svix-id/);
    expect(src).toMatch(/svix-timestamp/);
    expect(src).toMatch(/svix-signature/);
  });

  it("tem replay protection (300 segundos)", () => {
    expect(src).toMatch(/300/);
  });

  it("usa timingSafeEqual para comparar assinaturas", () => {
    expect(src).toMatch(/timingSafeEqual/);
  });

  it("mapeia todos os 4 eventos Resend", () => {
    expect(src).toMatch(/email\.sent/);
    expect(src).toMatch(/email\.delivered/);
    expect(src).toMatch(/email\.bounced/);
    expect(src).toMatch(/email\.complained/);
  });

  it("faz PATCH no Supabase com resend_id como filtro", () => {
    expect(src).toMatch(/resend_id=eq\./);
    expect(src).toMatch(/PATCH/);
  });

  it("usa service key (não anon) para updates", () => {
    expect(src).toMatch(/SUPABASE_SERVICE_KEY/);
  });
});

// ─── delete-data.ts — estrutura do endpoint ──────────────────────────────────

describe("[Visual] delete-data — estrutura do endpoint", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, "../../backend/api/delete-data.ts"), "utf-8"
    );
  });

  it("rejeita GET → 405", () => {
    expect(src).toMatch(/405/);
    expect(src).toMatch(/Method not allowed/);
  });

  it("valida que lightningAddress contém '@'", () => {
    expect(src).toMatch(/includes\("@"\)/);
    expect(src).toMatch(/400/);
  });

  it("usa SERVICE_KEY (não anon) para deletar", () => {
    expect(src).toMatch(/SUPABASE_SERVICE_KEY/);
    expect(src).not.toMatch(/SUPABASE_ANON_KEY/);
  });

  it("deleta de payments filtrando por owner_address", () => {
    expect(src).toMatch(/payments\?owner_address=eq\./);
    expect(src).toMatch(/method.*DELETE/i);
  });

  it("deleta de pro_access filtrando por address", () => {
    expect(src).toMatch(/pro_access\?address=eq\./);
  });

  it("retorna { deleted: { payments, proAccess } }", () => {
    expect(src).toMatch(/deleted/);
    expect(src).toMatch(/payments/);
    expect(src).toMatch(/proAccess/);
  });

  it("não vaza stack trace (catch sem rethrow)", () => {
    expect(src).toMatch(/Internal server error/);
    expect(src).not.toMatch(/console\.error/);
  });
});

// ─── extension.ts — Danger Zone ──────────────────────────────────────────────

describe("[Visual] extension — Danger Zone", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, "../../vscode-extension/src/extension.ts"), "utf-8"
    );
  });

  it("tem seção Danger Zone no HTML", () => {
    expect(src).toMatch(/Danger Zone/);
    expect(src).toMatch(/danger-zone/);
  });

  it("botão de trigger existe", () => {
    expect(src).toMatch(/deleteTriggerBtn/);
    expect(src).toMatch(/Delete all my data/i);
  });

  it("caixa de confirmação existe", () => {
    expect(src).toMatch(/deleteConfirmBox/);
    expect(src).toMatch(/deleteInput/);
    expect(src).toMatch(/deleteConfirmBtn/);
  });

  it("aviso menciona payment history E Pro subscription", () => {
    expect(src).toMatch(/payment history/i);
    expect(src).toMatch(/Pro subscription/i);
    expect(src).toMatch(/cannot be undone/i);
  });

  it("confirmação desabilitada até texto bater com ADDR", () => {
    expect(src).toMatch(/disabled.*ADDR|ADDR.*disabled/s);
    expect(src).toMatch(/deleteInput.*value.*ADDR|ADDR.*deleteInput.*value/s);
  });

  it("chama /api/delete-data com POST", () => {
    expect(src).toMatch(/api\/delete-data/);
    expect(src).toMatch(/method.*POST.*delete-data|delete-data.*POST/s);
  });

  it("tem CSS para todos os elementos da danger zone", () => {
    expect(src).toMatch(/\.danger-zone/);
    expect(src).toMatch(/\.delete-trigger-btn/);
    expect(src).toMatch(/\.delete-confirm-btn/);
    expect(src).toMatch(/\.delete-input/);
  });
});

// ─── checkout.html — QR code e UI ────────────────────────────────────────────

describe("[Visual] checkout — backend/checkout.html", () => {
  let html: string;
  beforeAll(() => { html = readHtml("checkout.html"); });

  it("QR size é 200 (reduzido de 240)", () => {
    expect(html).toMatch(/size:\s*200/);
    expect(html).not.toMatch(/size:\s*240/);
  });

  it("tem label 'Scan with your Lightning wallet'", () => {
    expect(html).toMatch(/Scan with your Lightning wallet/i);
  });

  it("tem classe .scan-label definida no CSS", () => {
    expect(html).toMatch(/\.scan-label/);
  });

  it("qr-wrap tem frame CSS (background:#fff e border)", () => {
    expect(html).toMatch(/\.qr-wrap\{[^}]*background:#fff/);
    expect(html).toMatch(/\.qr-wrap\{[^}]*border:/);
  });

  it("tem estados: loading, checkout, success, expired", () => {
    expect(html).toMatch(/id="loadingView"/);
    expect(html).toMatch(/id="checkoutView"/);
    expect(html).toMatch(/id="successView"/);
    expect(html).toMatch(/id="expiredView"/);
  });

  it("usa QRious para renderizar QR", () => {
    expect(html).toMatch(/qrious/i);
    expect(html).toMatch(/id="qrCanvas"/);
  });

  it("tem botão Copy Lightning Invoice", () => {
    expect(html).toMatch(/Copy Lightning Invoice/);
    expect(html).toMatch(/copyInvoice/);
  });

  it("não tem credenciais expostas", () => {
    expect(html).not.toMatch(/re_[A-Za-z0-9]{20,}/);
    expect(html).not.toMatch(/whsec_/);
    expect(html).not.toMatch(/blink_[A-Za-z0-9]{20,}/);
  });

  it("tem countdown timer e polling a cada 3 segundos", () => {
    expect(html).toMatch(/setInterval.*poll.*3000/s);
    expect(html).toMatch(/Invoice expires in/);
  });
});

// ─── OG PNG — arquivo existe e tem tamanho mínimo ─────────────────────────────

// ─── Under the hood section ───────────────────────────────────────────────────

describe("[Visual] landing — seção 'Under the hood'", () => {
  let html: string;
  beforeAll(() => { html = readHtml("index.html"); });

  it("tem seção .hood com h2", () => {
    expect(html).toMatch(/class="hood"/);
    expect(html).toMatch(/Under the hood/);
  });

  it("tem subtítulo .hood-sub mencionando HTTP 402", () => {
    expect(html).toMatch(/hood-sub/);
    expect(html).toMatch(/HTTP 402/);
  });

  it("tem 5 .hood-row (um por etapa do protocolo)", () => {
    const matches = html.match(/class="hood-row"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(5);
  });

  it("mostra os 5 hood-box-label com 'Step'", () => {
    expect(html).toMatch(/Step 1/);
    expect(html).toMatch(/Step 2/);
    expect(html).toMatch(/Step 3/);
    expect(html).toMatch(/Step 4/);
    expect(html).toMatch(/Step 5/);
  });

  it("contém headers HTTP reais (WWW-Authenticate, Authorization)", () => {
    expect(html).toMatch(/WWW-Authenticate/);
    expect(html).toMatch(/Authorization/);
  });

  it("contém token anatomy (.hood-token) com separador ':'", () => {
    expect(html).toMatch(/hood-token/);
    expect(html).toMatch(/hood-token-sep/);
    expect(html).toMatch(/Macaroon/i);
    expect(html).toMatch(/Preimage/i);
  });

  it("tem i18n: hoodTitle e hoodSteps no T object", () => {
    expect(html).toMatch(/hoodTitle/);
    expect(html).toMatch(/hoodSteps/);
    expect(html).toMatch(/hoodSub/);
  });

  it("tem traduções para PT e ES", () => {
    expect(html).toMatch(/Por dentro/);
    expect(html).toMatch(/Sous le capot/);
    expect(html).toMatch(/Unter der Haube/);
  });
});

// ─── Problem section ──────────────────────────────────────────────────────────

describe("[Visual] landing — seção 'Why credit cards fail'", () => {
  let html: string;
  beforeAll(() => { html = readHtml("index.html"); });

  it("tem seção .problem com h2", () => {
    expect(html).toMatch(/class="problem"/);
    expect(html).toMatch(/Why credit cards fail for APIs/);
  });

  it("tem subtítulo .problem-sub", () => {
    expect(html).toMatch(/problem-sub/);
    expect(html).toMatch(/Stripe was built for humans/);
  });

  it("tem 4 .problem-card", () => {
    const matches = html.match(/class="problem-card"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(4);
  });

  it("menciona os 4 problemas core", () => {
    expect(html).toMatch(/\$0\.30 minimum fee/);
    expect(html).toMatch(/AI agents can't hold cards/);
    expect(html).toMatch(/APIs can't be.*returned/);
    expect(html).toMatch(/50\+ countries blocked/);
  });

  it("tem .problem-footer com menção ao HTTP 402", () => {
    expect(html).toMatch(/problem-footer/);
    expect(html).toMatch(/HTTP 402/);
  });

  it("tem i18n: problemTitle e problemCards no T object", () => {
    expect(html).toMatch(/problemTitle/);
    expect(html).toMatch(/problemCards/);
    expect(html).toMatch(/problemFooter/);
  });

  it("tem traduções para PT, ES, JA, AR", () => {
    expect(html).toMatch(/Por que cart[oõ]es falham/);
    expect(html).toMatch(/tarjetas fallan/);
    expect(html).toMatch(/クレジットカードがAPIに向かない/);
    expect(html).toMatch(/لماذا تفشل بطاقات الائتمان/);
  });
});

describe("[Visual] OG image — backend/logos/og-1200x630.png", () => {
  const PNG_PATH = path.resolve(__dirname, "../../backend/logos/og-1200x630.png");

  it("arquivo existe em backend/logos/", () => {
    expect(fs.existsSync(PNG_PATH)).toBe(true);
  });

  it("é um arquivo PNG válido (magic bytes \\x89PNG)", () => {
    const buf = fs.readFileSync(PNG_PATH);
    expect(buf[0]).toBe(0x89);
    expect(buf.toString("ascii", 1, 4)).toBe("PNG");
  });

  it("tamanho ≥ 50KB (imagem real, não placeholder)", () => {
    const { size } = fs.statSync(PNG_PATH);
    expect(size).toBeGreaterThanOrEqual(50_000);
  });

  it("tamanho ≤ 500KB (não excessivamente grande)", () => {
    const { size } = fs.statSync(PNG_PATH);
    expect(size).toBeLessThanOrEqual(500_000);
  });
});
