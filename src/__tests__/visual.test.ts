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

  it("tem og:url apontando para l402kit.com", () => {
    expect(html).toMatch(/og:url[^>]*l402kit\.com/);
  });

  it("tem og:title definido", () => {
    expect(html).toMatch(/og:title/);
  });

  it("título contém 'l402-kit'", () => {
    expect(html).toMatch(/<title>[^<]*l402-kit[^<]*<\/title>/i);
  });

  it("contém CTA de GitHub star", () => {
    expect(html).toMatch(/github\.com\/ShinyDapps\/l402-kit/i);
  });

  it("menciona fee 0.3%", () => {
    expect(html).toMatch(/0\.3%/);
  });

  it("tem terminal interativo de demo L402 (#live-demo)", () => {
    expect(html).toMatch(/id="live-demo"/);
    expect(html).toMatch(/id="dtBody"/);
    expect(html).toMatch(/id="dtRunBtn"/);
    expect(html).toMatch(/dtRun\(\)/);
    expect(html).toMatch(/dtSimulate\(\)/);
    expect(html).toMatch(/402 Payment Required/);
  });

  it("não tem iframe de demo.html (substituído pelo terminal embutido)", () => {
    expect(html).not.toMatch(/src="demo\.html"/);
  });

  it("não tem seção 'Under the Hood' (substituída pelo terminal)", () => {
    expect(html).not.toMatch(/class="hood"/);
    expect(html).not.toMatch(/Under the hood/i);
  });

  it("tem seção Privacy-first architecture", () => {
    expect(html).toMatch(/Privacy-first architecture/i);
    expect(html).toMatch(/Zero PII|zero PII|No email collected/i);
    expect(html).toMatch(/secp256k1/i);
  });

  it("compara com Stripe/LemonSqueezy no copy de privacidade", () => {
    expect(html).toMatch(/Stripe/);
    expect(html).toMatch(/LemonSqueezy/);
  });

  it("menciona LNURL-auth para delete criptográfico", () => {
    expect(html).toMatch(/LNURL-auth/i);
    expect(html).toMatch(/cryptographic|Cryptographic/);
  });

  it("menciona 4 linguagens: TypeScript, Python, Go, Rust", () => {
    expect(html).toMatch(/typescript/i);
    expect(html).toMatch(/python/i);
    expect(html).toMatch(/\bgo\b/i);
    expect(html).toMatch(/rust/i);
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

  it("tem cards de pagamentos: kpiPayments, kpiSats, kpiFee, kpiDevs", () => {
    expect(html).toMatch(/id="kpiPayments"/);
    expect(html).toMatch(/id="kpiSats"/);
    expect(html).toMatch(/id="kpiFee"/);
    expect(html).toMatch(/id="kpiDevs"/);
  });

  it("tem chart SVG de volume diário", () => {
    expect(html).toMatch(/id="chartSvg"/);
    expect(html).toMatch(/drawChart/);
  });

  it("tem filtros de período (7d, 30d, Tudo)", () => {
    expect(html).toMatch(/setPeriod/);
    expect(html).toMatch(/period-tab/);
  });

  it("busca /api/stats com x-lnurl-token", () => {
    expect(html).toMatch(/\/api\/stats/);
    expect(html).toMatch(/x-lnurl-token/);
  });

  it("processa byDay para o chart", () => {
    expect(html).toMatch(/byDay/);
    expect(html).toMatch(/drawChart/);
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

  it("tem login LNURL-auth (QR + botão conectar) antes de mostrar dados", () => {
    expect(html).toMatch(/id="loginView"/);
    expect(html).toMatch(/id="appView"/);
    expect(html).toMatch(/connectBtn|id="connectBtn"/);
    expect(html).toMatch(/lnurl-auth|LNURL|lnurlToken/i);
    expect(html).not.toMatch(/type="password"/);
  });
});




// ─── docs/guides/flows.mdx — diagramas de fluxo ──────────────────────────────

describe("[Visual] flows.mdx — diagramas Mermaid de todos os fluxos", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, "../../docs/guides/flows.mdx"), "utf-8"
    );
  });

  it("tem frontmatter com title e description", () => {
    expect(src).toMatch(/title: System Flows/);
    expect(src).toMatch(/description:/);
  });

  it("tem 8 seções numeradas de fluxo", () => {
    expect(src).toMatch(/## 1\./);
    expect(src).toMatch(/## 8\./);
  });

  it("todos os blocos são diagramas Mermaid válidos", () => {
    const mermaidBlocks = src.match(/```mermaid[\s\S]*?```/g);
    expect(mermaidBlocks).not.toBeNull();
    expect(mermaidBlocks!.length).toBeGreaterThanOrEqual(5);
  });

  it("core L402 flow: sequenceDiagram com 402 + preimage + 200", () => {
    expect(src).toMatch(/402 Payment Required/);
    expect(src).toMatch(/preimage/);
    expect(src).toMatch(/200 OK/);
  });

  it("token anatomy: flowchart com macaroon e preimage", () => {
    expect(src).toMatch(/Token Anatomy/i);
    expect(src).toMatch(/macaroon/);
    expect(src).toMatch(/SHA256.*preimage.*hash|SHA256\(preimage\)/);
  });

  it("managed mode: fee split 99.7% aparece no diagrama", () => {
    expect(src).toMatch(/99\.7%/);
    expect(src).toMatch(/\/api\/split/);
  });

  it("pro subscription: webhook path e poll path documentados", () => {
    expect(src).toMatch(/Webhook path/i);
    expect(src).toMatch(/Poll path/i);
    expect(src).toMatch(/\/api\/pro-subscribe/);
  });

  it("LNURL-auth: secp256k1.verify no diagrama", () => {
    expect(src).toMatch(/secp256k1\.verify/);
    expect(src).toMatch(/single.use|single use/i);
    expect(src).toMatch(/\/api\/lnurl-auth/);
  });

  it("dashboard login flow: OWNER_PUBKEY + 24h token documentados", () => {
    expect(src).toMatch(/dashboard=1/);
    expect(src).toMatch(/OWNER_PUBKEY/);
    expect(src).toMatch(/24h/);
    expect(src).toMatch(/__dashboard__/);
  });

  it("infrastructure: Cloudflare Workers + Pages → Supabase + Edge Function", () => {
    expect(src).toMatch(/Cloudflare/);
    expect(src).toMatch(/lnurl_challenges/);
    expect(src).toMatch(/Edge Function/);
  });

  it("SHA-256 preimage: explica por que é seguro armazenar hash", () => {
    expect(src).toMatch(/payment_hash/);
    expect(src).toMatch(/never store raw|❌ never store raw/i);
    expect(src).toMatch(/BOLT11/);
  });

  it("está registrado no mint.json navigation", () => {
    const mintSrc = fs.readFileSync(
      path.resolve(__dirname, "../../docs/mint.json"), "utf-8"
    );
    expect(mintSrc).toMatch(/guides\/flows/);
  });
});

// ─── docs/guides/privacy.mdx — arquitetura de privacidade ────────────────────

describe("[Visual] privacy.mdx — Privacy Architecture", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(
      path.resolve(__dirname, "../../docs/guides/privacy.mdx"), "utf-8"
    );
  });

  it("tem frontmatter com title Privacy Architecture", () => {
    expect(src).toMatch(/title: Privacy Architecture/);
  });

  it("documenta que payment_hash é seguro (já público no BOLT11)", () => {
    expect(src).toMatch(/payment_hash/);
    expect(src).toMatch(/BOLT11/);
    expect(src).toMatch(/SHA-256/);
  });

  it("explica autenticação por secp256k1 (LNURL-auth)", () => {
    expect(src).toMatch(/secp256k1/);
    expect(src).toMatch(/LNURL-auth/);
  });

  it("documenta distribuição de chaves (Cloudflare, Supabase, wallet)", () => {
    expect(src).toMatch(/Cloudflare/);
    expect(src).toMatch(/Supabase/);
    expect(src).toMatch(/Edge Functions/);
  });

  it("menciona LGPD e GDPR compliance by design", () => {
    expect(src).toMatch(/LGPD/);
    expect(src).toMatch(/GDPR/);
  });

  it("compara com Stripe e LemonSqueezy", () => {
    expect(src).toMatch(/Stripe/);
    expect(src).toMatch(/LemonSqueezy/);
  });

  it("explica delete criptográfico (single-use token)", () => {
    expect(src).toMatch(/single-use/i);
    expect(src).toMatch(/delete-data/);
  });

  it("está registrado no mint.json antes de flows", () => {
    const mintSrc = fs.readFileSync(
      path.resolve(__dirname, "../../docs/mint.json"), "utf-8"
    );
    expect(mintSrc).toMatch(/guides\/privacy/);
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
