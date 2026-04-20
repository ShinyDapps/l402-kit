# L402-KIT — BLUEPRINT COMPLETO
> Documento mestre para Claude Code. Leia tudo antes de começar.

---

## QUEM SOU EU (O DONO DO PROJETO)

- Thiago — engenheiro de dados, brasileiro, Mairiporã/SP
- Já publiquei extensão VSCode: `ShinyDapps.dapp-agent-forge-vscode`
- 79+ installs orgânicos no marketplace
- CLT estável — posso arriscar sem pressão de sobrevivência
- Inglês fluente — produto nasce em inglês, global
- Meta: R$2.5M até Novembro de 2026
- Carteira Lightning: Phoenix Wallet (instalar ainda)

---

## O QUE É O L402-KIT

Um middleware TypeScript que qualquer dev instala em 3 linhas
e sua API começa a cobrar em Bitcoin (sats) automaticamente.

Sem cartão de crédito. Sem cadastro. Sem intermediário.
Pay-per-call via Lightning Network.

### A analogia exata:
- Stripe = forma simples de aceitar cartão
- l402-kit = forma simples de aceitar sats

### Uma linha que resume:
```
npm install l402-kit → sua API agora cobra em Bitcoin
```

---

## O PROBLEMA QUE RESOLVE

Hoje um dev que quer cobrar por chamada de API tem só 2 opções:
1. Stripe — mínimo $0.30 por transação (inviável para micropagamentos)
2. Assinatura mensal — quem usa pouco subsidia quem usa muito

O L402 é a terceira opção:
- Cliente chama API
- Servidor responde: "custa 100 sats, paga aqui"
- Cliente paga via Lightning em 2 segundos
- Servidor libera automaticamente
- Sem cadastro, sem cartão, sem chargeback

---

## POR QUE AGORA

- Lightning Labs lançou LN Agent Tools em fev/2026
- Cloudflare processa 1 bilhão de respostas HTTP 402/dia
- AI agents já consomem mais APIs pagas que humanos
- Aperture (solução atual) é complexo demais
- boltwall está desatualizado
- Lightning Enable existe mas é pequeno, sem VSCode, sem comunidade
- JANELA ABERTA: ninguém fez o "Stripe do Lightning" ainda

---

## AS PEÇAS DO PRODUTO

### 1. npm package — `l402-kit` (PRODUTO PRINCIPAL)
```
O que é:  middleware que o dev instala na API dele
Onde vai: npmjs.com/package/l402-kit
Stack:    TypeScript
Uso:      3 linhas de código
```

### 2. VSCode Extension — `l402-dashboard` (DIFERENCIAL)
```
O que é:  dashboard de earnings em sats no VSCode
Mostra:   sats recebidos hoje, calls por endpoint,
          histórico, configuração, status do nó
Idiomas:  10 línguas com seletor visual
Base:     Thiago já sabe fazer — tem extensão publicada
```

### 3. Documentação — `docs.l402kit.com`
```
Feita em: Docusaurus + Vercel (grátis)
Idiomas:  10 línguas
Padrão:   docs.stripe.com / docs.supabase.com
```

### 4. Backend invisível
```
Railway:   servidor na nuvem ($0 para começar)
Supabase:  banco de dados ($0 até 50k usuários)
Breez SDK: processa Lightning sem nó próprio
```

### 5. Carteira do Thiago
```
Phoenix Wallet: onde os sats chegam
Taxa:           0.4% por transação recebida
Custo único:    ~R$15 para abrir canal (1x só)
```

---

## O FLUXO COMPLETO (5 PASSOS)

```
PASSO 1: Dev encontra l402-kit no npm
         npm install l402-kit

PASSO 2: Dev adiciona na API Express dele
         import { l402 } from 'l402-kit'
         app.use('/premium', l402({ price: 100 }))

PASSO 3: Usuário/agente chama a API
         Recebe: HTTP 402 + invoice Lightning de 100 sats

PASSO 4: Usuário/agente paga em 2 segundos
         Breez SDK verifica automaticamente
         Libera o acesso

PASSO 5: Dev abre VSCode
         Dashboard mostra: +100 sats recebidos
         Thiago recebe 0.5% = 0.5 sats automaticamente
```

---

## COMO THIAGO GANHA DINHEIRO

```
FONTE 1: Assinatura Pro
         $29/mês por dev
         100 devs = $2.900/mês

FONTE 2: Nó gerenciado
         $9/mês (dev não quer rodar infra)
         200 devs = $1.800/mês

FONTE 3: Taxa por transação
         0.5% de cada pagamento que passa
         $100k em transações = $500/mês passivo

META REALISTA MÊS 12:
300 devs Pro × $29 = $8.700
200 nós × $9 = $1.800
Transações = $500+
TOTAL = ~$11.000/mês (~R$66k/mês)
```

---

## CENÁRIOS DE SUCESSO NO MUNDO REAL

1. Dev em país sem Stripe (Nigéria, Índia, Argentina)
   → sem acesso a Stripe, Bitcoin é única saída

2. Dev construindo AI agents
   → agente paga automaticamente, sem humano no loop

3. Dev com dados exclusivos
   → cobra 10 sats por consulta (impossível com Stripe)

4. Comunidade Bitcoin BR
   → Renato 38, Bitcoiners — já entendem e confiam

5. Mercado futuro de agentes pagando agentes
   → L402 foi construído exatamente para isso

---

## 10 IDIOMAS (COBERTURA GLOBAL)

```
1. Inglês    → EUA, UK, global (PRINCIPAL)
2. Português → Brasil, Portugal, Angola
3. Espanhol  → América Latina, Espanha
4. Mandarim  → China, Taiwan
5. Árabe     → Oriente Médio, Norte África
6. Hindi     → Índia
7. Francês   → França, África Ocidental
8. Russo     → Rússia, Europa Oriental
9. Japonês   → Japão
10. Alemão   → Alemanha, Áustria, Suíça
```

---

## INFRA — ONDE CADA PEÇA FICA

```
GitHub:    código fonte (criar repo: l402-kit)
Railway:   backend + Breez SDK ($0 início → $5/mês)
Supabase:  banco PostgreSQL ($0 até 50k users)
Vercel:    site + docs ($0 para sempre no básico)
npm:       publicação do package (grátis)
Phoenix:   carteira Lightning do Thiago (celular)
```

### Evolução futura da infra:
```
Agora:     Railway + Supabase + Vercel ($0-5/mês)
6 meses:   mesmo stack com mais capacidade (~$20/mês)
1 ano+:    AWS/GCP + RDS + LND próprio (~$200/mês)
           Só migra quando a receita justificar
```

---

## CONCORRENTES

```
Aperture (Lightning Labs):
→ complexo, requer nó próprio, não é npm package

boltwall:
→ desatualizado, sem manutenção

Lightning Enable (lightningenable.com):
→ existe mas pequeno, sem VSCode, sem comunidade BR
→ foca em .NET, não TypeScript

x402 (Coinbase):
→ usa USDC, não sats — Thiago escolheu Bitcoin-first

NOSSA VANTAGEM:
→ TypeScript (maior ecossistema)
→ VSCode extension (único no mercado)
→ 10 idiomas nativos
→ Comunidade Bitcoin BR + global
→ Thiago já tem extensão publicada como prova
```

---

## ROADMAP — 6 SEMANAS

```
SEMANA 1-2: middleware core (npm package)
            src/middleware.ts
            src/lightning.ts  
            src/verify.ts
            Testes com Breez SDK testnet

SEMANA 3:   VSCode Extension básica
            Dashboard com earnings
            Status do nó Lightning
            Seletor de idioma (10 línguas)

SEMANA 4:   Railway + Supabase configurados
            Backend rodando em produção
            Primeiros sats reais recebidos

SEMANA 5:   Documentação Docusaurus
            docs.l402kit.com no ar
            README multilíngue no GitHub
            Exemplos de uso em cada idioma

SEMANA 6:   Launch
            Product Hunt (em inglês)
            Twitter/X thread
            Comunidade Bitcoin BR (Renato 38 território)
            OpenSats grant application
```

---

## ESTRUTURA DE PASTAS DO PROJETO

```
l402-kit/
├── src/
│   ├── middleware.ts      ← CORAÇÃO: o porteiro da API
│   ├── lightning.ts       ← fala com Breez SDK
│   ├── verify.ts          ← verifica se pagou de verdade
│   ├── types.ts           ← tipos TypeScript
│   └── index.ts           ← exporta tudo
├── extension/             ← VSCode Dashboard
│   ├── src/
│   │   ├── extension.ts   ← entry point
│   │   ├── dashboard.ts   ← UI de earnings
│   │   └── i18n/          ← 10 idiomas
│   └── package.json
├── docs/                  ← Docusaurus
│   ├── en/
│   ├── pt/
│   ├── es/
│   └── ...
├── examples/
│   ├── express-basic/     ← exemplo mínimo
│   ├── fastapi-python/    ← exemplo Python
│   └── ai-agent/         ← exemplo com agente IA
├── tests/
├── package.json
├── tsconfig.json
├── README.md              ← 10 idiomas
└── BLUEPRINT.md           ← ESTE ARQUIVO
```

---

## O PRIMEIRO ARQUIVO A ESCREVER

`src/middleware.ts` — o coração do kit.

Lógica:
```
1. Recebe requisição HTTP
2. Verifica se tem token L402 válido no header
3. Se sim → deixa passar
4. Se não → gera invoice Lightning via Breez
5. Retorna HTTP 402 com a invoice
6. Quando cliente pagar → verifica preimage
7. Gera token L402 válido
8. Registra no Supabase
9. Deixa passar
```

---

## COMO ME CHAMAR NO CLAUDE CODE

Quando abrir o Claude Code no VSCode, começa com:

```
Olá Claude. Estou construindo o l402-kit com base
no BLUEPRINT.md deste projeto. Leia o arquivo e
me ajude a construir o src/middleware.ts primeiro.
Usa TypeScript strict, Breez SDK para Lightning,
Express para o middleware. Vamos linha por linha.
```

---

## REFERÊNCIAS TÉCNICAS

- Protocolo L402: https://github.com/lightninglabs/L402
- Breez SDK docs: https://sdk-doc.breez.technology
- Documentação LN: https://docs.lightning.engineering
- SatsAPI (exemplo real): https://satsapi.dev
- Lightning Enable (concorrente): https://api.lightningenable.com

---

## FILOSOFIA DO PROJETO

Alinhado com Olavo de Carvalho (método) + Renato 38 (Bitcoin):

- Bitcoin não pede permissão
- Soberania individual começa no dinheiro
- Quem constrói a infraestrutura controla o fluxo
- Produto resolve problema real — não é especulação
- Lança imperfeito, melhora com uso real

```
"Moderação na defesa da verdade é serviço prestado à mentira."
— Olavo de Carvalho

"Curto prazo é imprevisível, longo prazo é inevitável."
— Renato 38

Escreve o código. Publica. Melhora. Repete.
```

---

**Versão do blueprint:** 1.0  
**Data:** Abril 2026  
**Autor:** Thiago + Claude  
**Status:** PRONTO PARA COMEÇAR
