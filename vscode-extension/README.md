# ShinyDapps ⚡ Lightning Payments

🇺🇸 [English](#english) · 🇧🇷 [Português](#português) · 🇪🇸 [Español](#español) · 🇨🇳 [中文](#中文) · 🇯🇵 [日本語](#日本語) · 🇫🇷 [Français](#français) · 🇩🇪 [Deutsch](#deutsch) · 🇷🇺 [Русский](#русский) · 🇮🇳 [हिंदी](#हिंदी) · 🇸🇦 [العربية](#العربية) · 🇮🇹 [Italiano](#italiano)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.png)](https://github.com/ShinyDapps/l402-kit/blob/main/LICENSE)

> **🌐 [l402kit.vercel.app](https://l402kit.vercel.app)** — docs, demo, and SDK for all languages

---

## English

**Watch your sats roll in — without leaving VS Code.**

Real-time Bitcoin Lightning payment dashboard for developers using [l402-kit](https://npmjs.com/package/l402-kit). Every payment your API receives appears instantly: endpoint, amount in sats, USD value, live chart.

### Features

⚡ **Live sats counter** in the status bar — updates every 30 seconds

📊 **Payment sidebar** with real-time bar chart — click the ⚡ icon in the activity bar

📋 **Full payment history** — endpoint, amount, timestamp, USD value

🌍 **11 languages built-in** — switch inside the sidebar: 🇺🇸 🇧🇷 🇪🇸 🇨🇳 🇯🇵 🇫🇷 🇩🇪 🇷🇺 🇮🇳 🇸🇦 🇮🇹

🎨 **Light / Dark / Auto theme** — follows your VS Code theme or set manually

📈 **Chart ranges** — 1D / 7D (free) · 30D / 1Y / ALL (Pro)

🤖 **AI-agent native** — works with any l402-kit powered API: TypeScript, Python, Go, Rust

### How to use

![ShinyDapps extension in action — live sats counter, payment sidebar, bar chart](https://l402kit.vercel.app/demo-extension.gif)

**Step 1 — Add l402-kit to your API**

Pick your language and add pay-per-call in 3 lines:

```bash
npm install l402-kit      # TypeScript / Node.js / Express
pip install l402kit       # Python / FastAPI / Flask
go get github.com/shinydapps/l402-kit/go@v1.1.6   # Go
cargo add l402kit         # Rust / axum
```

Use your Lightning address as the owner:

```typescript
app.get("/premium", l402({
  priceSats: 100,
  ownerLightningAddress: "you@blink.sv",  // ← your Lightning address
}), handler);
```

**Step 2 — Install this extension and configure it**

Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) →
**ShinyDapps: Configure Lightning Address**

Enter the **same Lightning address** you used in your API (e.g. `you@blink.sv`).
That's it — the extension connects automatically.

> **No Lightning address yet?** Get one free at [dashboard.blink.sv](https://dashboard.blink.sv) — no credit card, instant setup.

**Step 3 — Watch your payments arrive**

Click the ⚡ icon in the activity bar. The sidebar shows:
- Total sats received
- Payment history per endpoint
- Live bar chart (day by day)
- Status bar counter in the bottom left

### How it works

![Payment flow — HTTP 402 → Lightning invoice → pay → token → data](https://l402kit.vercel.app/flow-en.gif)

```
Your API  ──── l402-kit middleware ────► HTTP 402 + Lightning invoice
                                                  │
                      Client pays (any Lightning wallet, < 1 second)
                                                  │
                      ShinyDapps backend verifies payment
                                 │
                    99.7% → your Lightning Address  (instant)
                     0.3% → ShinyDapps (fee)
                                 │
                    Payment logged → this extension reads here
                    (polls every 30 seconds)          ▲
                                                  YOU ARE HERE
```

### Why not Stripe?

|  | Stripe | PayPal | **l402-kit** |
|--|--------|--------|--------------|
| Minimum fee | $0.30 | $0.30 | **< 1 sat (~$0.0003)** |
| Settlement | 2–7 days | 1–3 days | **< 1 second** |
| Chargebacks | Yes | Yes | **Impossible** |
| AI agent support | No | No | **Yes — native** |
| Countries blocked | ~50 | ~30 | **0 — global** |
| Setup time | Hours | Hours | **3 lines of code** |
| VS Code monitor | No | No | **✓ This extension** |

### SDK ecosystem — live download stats

| SDK | Install | Version | Downloads |
|:----|:--------|:-------:|----------:|
| ![npm](https://l402kit.vercel.app/logos/npm.png) **TypeScript** · Express / Node.js | `npm install l402-kit` | [![npm](https://img.shields.io/npm/v/l402-kit?color=f7931a&label=)](https://npmjs.com/package/l402-kit) | [![npm total](https://img.shields.io/npm/dt/l402-kit?color=f7931a&label=total)](https://npmjs.com/package/l402-kit) |
| ![python](https://l402kit.vercel.app/logos/python.png) **Python** · FastAPI / Flask | `pip install l402kit` | [![pypi](https://img.shields.io/pypi/v/l402kit?color=3776ab&label=)](https://pypi.org/project/l402kit) | [![pypi total](https://img.shields.io/pepy/dt/l402kit?color=3776ab&label=total)](https://pypi.org/project/l402kit) |
| ![rust](https://l402kit.vercel.app/logos/rust.png) **Rust** · axum | `cargo add l402kit` | [![crates](https://img.shields.io/crates/v/l402kit?color=ce422b&label=)](https://crates.io/crates/l402kit) | [![crates dls](https://img.shields.io/crates/d/l402kit?color=ce422b&label=total)](https://crates.io/crates/l402kit) |
| ![go](https://l402kit.vercel.app/logos/go.png) **Go** · net/http / Chi / Gin | `go get github.com/shinydapps/l402-kit/go` | [![go](https://img.shields.io/badge/v1.1.6-00acd7?label=)](https://pkg.go.dev/github.com/shinydapps/l402-kit/go) | [![go docs](https://img.shields.io/badge/pkg.go.dev-reference-00acd7)](https://pkg.go.dev/github.com/shinydapps/l402-kit/go) |

### Links

[📖 Docs](https://l402kit.vercel.app/docs) · [▶ Live demo](https://l402kit.vercel.app/demo) · [npm](https://npmjs.com/package/l402-kit) · [PyPI](https://pypi.org/project/l402kit) · [GitHub](https://github.com/ShinyDapps/l402-kit)

---

## Português

**Veja os sats chegando — sem sair do VS Code.**

Dashboard de pagamentos Bitcoin Lightning em tempo real para desenvolvedores usando [l402-kit](https://npmjs.com/package/l402-kit).

### Funcionalidades

⚡ **Contador de sats ao vivo** na barra de status

📊 **Painel lateral** com gráfico de barras em tempo real

📋 **Histórico completo** — endpoint, valor, timestamp, valor em USD

🌍 **11 idiomas embutidos** — troque dentro da barra lateral

🎨 **Tema Claro / Escuro / Auto**

📈 **Intervalos de gráfico** — 1D / 7D (grátis) · 30D / 1Y / ALL (Pro)

🤖 **Nativo para agentes de IA** — TypeScript, Python, Go, Rust

### Como usar

![Extensão ShinyDapps em ação — contador de sats ao vivo, painel lateral, gráfico de barras](https://l402kit.vercel.app/demo-extension.gif)

**Passo 1 — Adicione l402-kit à sua API**

```bash
npm install l402-kit      # TypeScript / Node.js
pip install l402kit       # Python
go get github.com/shinydapps/l402-kit/go@v1.1.6
cargo add l402kit         # Rust
```

Use seu Lightning address como `ownerLightningAddress` na configuração.

**Passo 2 — Configure a extensão**

Abra o Command Palette (`Ctrl+Shift+P`) →
**ShinyDapps: Configure Lightning Address**

Digite o **mesmo Lightning address** que você usou na sua API (ex: `voce@blink.sv`).

> **Não tem Lightning address?** Crie grátis em [dashboard.blink.sv](https://dashboard.blink.sv) — sem cartão, instantâneo.

**Passo 3 — Veja os pagamentos chegarem**

Clique no ícone ⚡ na barra de atividades. O painel mostra sats recebidos, histórico por endpoint e gráfico ao vivo.

### Como funciona

![Fluxo de pagamento — HTTP 402 → fatura Lightning → pagamento → token → dados](https://l402kit.vercel.app/flow-pt.gif)

```
Sua API ──► l402-kit ──► HTTP 402 + fatura Lightning
                                  │
                    Cliente paga (< 1 segundo)
                                  │
                99,7% → seu Lightning Address  (instantâneo)
                 0,3% → ShinyDapps (taxa)
                                  │
                Pagamento registrado → extensão lê aqui  ▲ VOCÊ ESTÁ AQUI
```

### Por que não Stripe / Pix?

| | Stripe | Pix | **l402-kit** |
|--|--------|-----|--------------|
| Taxa mínima | R$1,50 | R$0,01 | **< 1 sat** |
| Liquidação | 2–7 dias | Instante | **< 1 segundo** |
| Chargeback | Sim | Não | **Impossível** |
| Funciona pra IA | Não | Não | **Sim — nativo** |
| Global | Não | Só Brasil | **Sim — 0 fronteiras** |

### Links

[📖 Docs PT](https://l402kit.vercel.app/docs/pt/introduction) · [▶ Demo](https://l402kit.vercel.app/demo) · [GitHub](https://github.com/ShinyDapps/l402-kit)

---

## Español

**Mira cómo llegan tus sats — sin salir de VS Code.**

### Características

⚡ **Contador de sats en vivo** en la barra de estado

📊 **Panel lateral** con gráfico de barras en tiempo real

📋 **Historial completo** — endpoint, monto, timestamp, valor USD

🌍 **11 idiomas integrados**

🎨 **Tema Claro / Oscuro / Auto**

📈 **Rangos de gráfico** — 1D / 7D (gratis) · 30D / 1Y / ALL (Pro)

### Cómo usar

![Extensión ShinyDapps en acción — contador de sats en vivo, panel lateral, gráfico de barras](https://l402kit.vercel.app/demo-extension.gif)

**Paso 1 — Agrega l402-kit a tu API**

```bash
npm install l402-kit      # TypeScript / Node.js
pip install l402kit       # Python
go get github.com/shinydapps/l402-kit/go@v1.1.6
cargo add l402kit         # Rust
```

**Paso 2 — Configura la extensión**

Abre Command Palette (`Ctrl+Shift+P`) →
**ShinyDapps: Configure Lightning Address**

Ingresa el **mismo Lightning address** que usaste en tu API (ej: `tu@blink.sv`).

**Paso 3 — Observa los pagos en tiempo real**

Haz clic en el icono ⚡ en la barra de actividades.

### Cómo funciona

![Flujo de pago — HTTP 402 → factura Lightning → pago → token → datos](https://l402kit.vercel.app/flow-es.gif)

```
Tu API ──► l402-kit ──► HTTP 402 + factura Lightning
                                 │
                   Cliente paga (< 1 segundo)
                                 │
              99,7% → tu Lightning Address  (instantáneo)
               0,3% → ShinyDapps (comisión)
                                 │
              Esta extensión lee aquí  ▲ ESTÁS AQUÍ
```

### Links

[📖 Docs ES](https://l402kit.vercel.app/docs/es/introduction) · [▶ Demo](https://l402kit.vercel.app/demo) · [GitHub](https://github.com/ShinyDapps/l402-kit)

---

## 中文

**在 VS Code 中实时查看您的 sats 收入。**

### 功能特点

⚡ **状态栏实时 sats 计数器**

📊 **带实时柱状图的支付侧边栏**

📋 **完整支付历史** — 端点、金额、时间戳、USD 价值

🌍 **内置 11 种语言**

🎨 **亮色 / 暗色 / 自动主题**

📈 **图表范围** — 1D / 7D（免费）· 30D / 1Y / ALL（Pro）

### 如何使用

![ShinyDapps 扩展实操 — 实时 sats 计数器、支付侧边栏、柱状图](https://l402kit.vercel.app/demo-extension.gif)

**第一步 — 将 l402-kit 添加到您的 API**

```bash
npm install l402-kit      # TypeScript / Node.js
pip install l402kit       # Python
go get github.com/shinydapps/l402-kit/go@v1.1.6
cargo add l402kit         # Rust
```

**第二步 — 配置扩展**

打开命令面板 (`Ctrl+Shift+P`) →
**ShinyDapps: Configure Lightning Address**

输入与您的 API 中相同的闪电地址（例如：`you@blink.sv`）。

**第三步 — 实时查看支付**

点击活动栏中的 ⚡ 图标查看实时图表和支付历史。

### 工作原理

![支付流程 — HTTP 402 → 闪电发票 → 支付 → 令牌 → 数据](https://l402kit.vercel.app/flow-zh.gif)

```
您的 API ──► l402-kit ──► HTTP 402 + 闪电发票
                                   │
                     客户支付（< 1 秒）
                                   │
                  99.7% → 您的闪电地址  （即时）
                   0.3% → ShinyDapps（手续费）
                                   │
                  此扩展在此读取  ▲ 您在这里
```

### 链接

[📖 中文文档](https://l402kit.vercel.app/docs/zh/introduction) · [▶ 演示](https://l402kit.vercel.app/demo) · [GitHub](https://github.com/ShinyDapps/l402-kit)

---

## 日本語

**VS Code を離れずに sats の収入をリアルタイムで確認。**

### 機能

⚡ **ステータスバーのリアルタイム sats カウンター**

📊 **リアルタイム棒グラフ付き支払いサイドバー**

📋 **完全な支払い履歴** — エンドポイント、金額、タイムスタンプ、USD 値

🌍 **11言語内蔵**

🎨 **ライト / ダーク / 自動テーマ**

📈 **グラフ範囲** — 1D / 7D（無料）· 30D / 1Y / ALL（Pro）

### 使い方

![ShinyDapps 拡張機能の実際動作 — リアルタイム sats カウンター、支払いサイドバー、棒グラフ](https://l402kit.vercel.app/demo-extension.gif)

**ステップ 1 — API に l402-kit を追加**

```bash
npm install l402-kit      # TypeScript / Node.js
pip install l402kit       # Python
go get github.com/shinydapps/l402-kit/go@v1.1.6
cargo add l402kit         # Rust
```

**ステップ 2 — 拡張機能を設定**

コマンドパレット (`Ctrl+Shift+P`) →
**ShinyDapps: Configure Lightning Address**

API で使用したのと**同じ Lightning アドレス**を入力（例：`you@blink.sv`）。

**ステップ 3 — リアルタイムで支払いを確認**

アクティビティバーの ⚡ アイコンをクリック。

### 仕組み

![支払いフロー — HTTP 402 → Lightning インボイス → 支払い → トークン → データ](https://l402kit.vercel.app/flow-ja.gif)

```
あなたの API ──► l402-kit ──► HTTP 402 + Lightning インボイス
                                        │
                          クライアントが支払う（< 1秒）
                                        │
                       99.7% → あなたの Lightning アドレス  （即時）
                        0.3% → ShinyDapps（手数料）
                                        │
                       この拡張機能がここを読む  ▲ ここです
```

### リンク

[📖 日本語ドキュメント](https://l402kit.vercel.app/docs/ja/introduction) · [▶ デモ](https://l402kit.vercel.app/demo) · [GitHub](https://github.com/ShinyDapps/l402-kit)

---

## Français

**Regardez vos sats arriver — sans quitter VS Code.**

### Fonctionnalités

⚡ **Compteur de sats en direct** dans la barre d'état

📊 **Panneau latéral** avec graphique en barres en temps réel

📋 **Historique complet** — endpoint, montant, horodatage, valeur USD

🌍 **11 langues intégrées**

🎨 **Thème Clair / Sombre / Auto**

📈 **Plages de graphique** — 1D / 7D (gratuit) · 30D / 1Y / ALL (Pro)

### Comment utiliser

![Extension ShinyDapps en action — compteur de sats en direct, panneau latéral, graphique](https://l402kit.vercel.app/demo-extension.gif)

**Étape 1 — Ajoutez l402-kit à votre API**

```bash
npm install l402-kit      # TypeScript / Node.js
pip install l402kit       # Python
go get github.com/shinydapps/l402-kit/go@v1.1.6
cargo add l402kit         # Rust
```

**Étape 2 — Configurez l'extension**

Ouvrez la palette de commandes (`Ctrl+Shift+P`) →
**ShinyDapps: Configure Lightning Address**

Entrez la **même adresse Lightning** que celle utilisée dans votre API.

**Étape 3 — Observez vos paiements en temps réel**

Cliquez sur l'icône ⚡ dans la barre d'activités.

### Comment ça marche

![Flux de paiement — HTTP 402 → facture Lightning → paiement → token → données](https://l402kit.vercel.app/flow-fr.gif)

```
Votre API ──► l402-kit ──► HTTP 402 + facture Lightning
                                    │
                      Le client paie (< 1 seconde)
                                    │
                   99,7% → votre adresse Lightning  (instantané)
                    0,3% → ShinyDapps (frais)
                                    │
                   Cette extension lit ici  ▲ VOUS ÊTES ICI
```

### Liens

[📖 Docs FR](https://l402kit.vercel.app/docs/fr/introduction) · [▶ Démo](https://l402kit.vercel.app/demo) · [GitHub](https://github.com/ShinyDapps/l402-kit)

---

## Deutsch

**Sehen Sie Ihre Sats in Echtzeit — ohne VS Code zu verlassen.**

### Funktionen

⚡ **Live-Sats-Zähler** in der Statusleiste

📊 **Seitenleiste** mit Echtzeit-Balkendiagramm

📋 **Vollständige Zahlungshistorie** — Endpoint, Betrag, Zeitstempel, USD-Wert

🌍 **11 Sprachen integriert**

🎨 **Hell / Dunkel / Auto-Theme**

📈 **Diagramm-Bereiche** — 1D / 7D (kostenlos) · 30D / 1Y / ALL (Pro)

### Verwendung

![ShinyDapps Erweiterung in Aktion — Live-Sats-Zähler, Zahlungs-Seitenleiste, Balkendiagramm](https://l402kit.vercel.app/demo-extension.gif)

**Schritt 1 — l402-kit zu Ihrer API hinzufügen**

```bash
npm install l402-kit      # TypeScript / Node.js
pip install l402kit       # Python
go get github.com/shinydapps/l402-kit/go@v1.1.6
cargo add l402kit         # Rust
```

**Schritt 2 — Erweiterung konfigurieren**

Command Palette (`Ctrl+Shift+P`) →
**ShinyDapps: Configure Lightning Address**

Geben Sie dieselbe Lightning-Adresse ein, die Sie in Ihrer API verwendet haben.

**Schritt 3 — Zahlungen in Echtzeit beobachten**

Klicken Sie auf das ⚡-Symbol in der Aktivitätsleiste.

### So funktioniert es

![Zahlungsfluss — HTTP 402 → Lightning-Rechnung → Zahlung → Token → Daten](https://l402kit.vercel.app/flow-de.gif)

```
Ihre API ──► l402-kit ──► HTTP 402 + Lightning-Rechnung
                                   │
                     Client zahlt (< 1 Sekunde)
                                   │
                  99,7% → Ihre Lightning-Adresse  (sofort)
                   0,3% → ShinyDapps (Gebühr)
                                   │
                  Diese Erweiterung liest hier  ▲ SIE SIND HIER
```

### Links

[📖 Docs DE](https://l402kit.vercel.app/docs/de/introduction) · [▶ Demo](https://l402kit.vercel.app/demo) · [GitHub](https://github.com/ShinyDapps/l402-kit)

---

## Русский

**Наблюдайте за поступлением сатошей — не выходя из VS Code.**

### Возможности

⚡ **Живой счётчик сатошей** в строке состояния

📊 **Боковая панель** с графиком в реальном времени

📋 **Полная история платежей** — endpoint, сумма, время, стоимость в USD

🌍 **11 языков встроено**

🎨 **Светлая / Тёмная / Авто тема**

📈 **Диапазоны графика** — 1D / 7D (бесплатно) · 30D / 1Y / ALL (Pro)

### Использование

![Расширение ShinyDapps в действии — живой счётчик сатошей, боковая панель, диаграмма](https://l402kit.vercel.app/demo-extension.gif)

**Шаг 1 — Добавьте l402-kit в ваш API**

```bash
npm install l402-kit      # TypeScript / Node.js
pip install l402kit       # Python
go get github.com/shinydapps/l402-kit/go@v1.1.6
cargo add l402kit         # Rust
```

**Шаг 2 — Настройте расширение**

Command Palette (`Ctrl+Shift+P`) →
**ShinyDapps: Configure Lightning Address**

Введите тот же Lightning-адрес, что использовали в API.

**Шаг 3 — Наблюдайте за платежами в реальном времени**

Нажмите на иконку ⚡ в панели активности.

### Как это работает

![Поток платежей — HTTP 402 → Lightning-инвойс → оплата → токен → данные](https://l402kit.vercel.app/flow-ru.gif)

```
Ваш API ──► l402-kit ──► HTTP 402 + Lightning-инвойс
                                  │
                    Клиент платит (< 1 секунды)
                                  │
                 99,7% → ваш Lightning-адрес  (мгновенно)
                  0,3% → ShinyDapps (комиссия)
                                  │
                 Расширение читает здесь  ▲ ВЫ ЗДЕСЬ
```

### Ссылки

[📖 Docs RU](https://l402kit.vercel.app/docs/ru/introduction) · [▶ Демо](https://l402kit.vercel.app/demo) · [GitHub](https://github.com/ShinyDapps/l402-kit)

---

## हिंदी

**VS Code से बाहर निकले बिना अपने sats को रियल-टाइम में देखें।**

### विशेषताएं

⚡ **स्टेटस बार में लाइव sats काउंटर**

📊 **रियल-टाइम बार चार्ट के साथ पेमेंट साइडबार**

📋 **पूरी पेमेंट हिस्ट्री** — endpoint, राशि, समय, USD मूल्य

🌍 **11 भाषाएं बिल्ट-इन**

🎨 **लाइट / डार्क / ऑटो थीम**

📈 **चार्ट रेंज** — 1D / 7D (मुफ्त) · 30D / 1Y / ALL (Pro)

### कैसे उपयोग करें

![ShinyDapps एक्सटेंशन in action — live sats counter, payment sidebar, bar chart](https://l402kit.vercel.app/demo-extension.gif)

**चरण 1 — अपनी API में l402-kit जोड़ें**

```bash
npm install l402-kit      # TypeScript / Node.js
pip install l402kit       # Python
go get github.com/shinydapps/l402-kit/go@v1.1.6
cargo add l402kit         # Rust
```

**चरण 2 — एक्सटेंशन कॉन्फ़िगर करें**

Command Palette (`Ctrl+Shift+P`) →
**ShinyDapps: Configure Lightning Address**

वही Lightning address डालें जो आपने API में उपयोग किया था।

**चरण 3 — पेमेंट देखें**

Activity bar में ⚡ आइकन क्लिक करें।

### यह कैसे काम करता है

![भुगतान प्रवाह — HTTP 402 → Lightning invoice → भुगतान → token → डेटा](https://l402kit.vercel.app/flow-hi.gif)

```
आपकी API ──► l402-kit ──► HTTP 402 + Lightning invoice
                                    │
                      Client भुगतान करता है (< 1 सेकंड)
                                    │
                   99.7% → आपका Lightning Address  (तुरंत)
                    0.3% → ShinyDapps (शुल्क)
                                    │
                   यह एक्सटेंशन यहाँ पढ़ता है  ▲ आप यहाँ हैं
```

### लिंक

[📖 Docs HI](https://l402kit.vercel.app/docs/hi/introduction) · [▶ Demo](https://l402kit.vercel.app/demo) · [GitHub](https://github.com/ShinyDapps/l402-kit)

---

## العربية

**شاهد الـ sats تتدفق — دون مغادرة VS Code.**

### المميزات

⚡ **عداد sats مباشر** في شريط الحالة

📊 **لوحة جانبية** مع رسم بياني في الوقت الفعلي

📋 **سجل كامل للمدفوعات** — النقطة النهائية، المبلغ، التوقيت، قيمة USD

🌍 **11 لغة مدمجة**

🎨 **ثيم فاتح / داكن / تلقائي**

📈 **نطاقات الرسم البياني** — 1D / 7D (مجاني) · 30D / 1Y / ALL (Pro)

### كيفية الاستخدام

![إضافة ShinyDapps في العمل — عداد sats مباشر، لوحة جانبية، رسم بياني](https://l402kit.vercel.app/demo-extension.gif)

**الخطوة 1 — أضف l402-kit إلى API الخاص بك**

```bash
npm install l402-kit      # TypeScript / Node.js
pip install l402kit       # Python
go get github.com/shinydapps/l402-kit/go@v1.1.6
cargo add l402kit         # Rust
```

**الخطوة 2 — قم بتهيئة الإضافة**

افتح Command Palette (`Ctrl+Shift+P`) →
**ShinyDapps: Configure Lightning Address**

أدخل نفس عنوان Lightning الذي استخدمته في API الخاص بك.

**الخطوة 3 — شاهد المدفوعات في الوقت الفعلي**

انقر على أيقونة ⚡ في شريط النشاط.

### كيف يعمل

![تدفق الدفع — HTTP 402 → فاتورة Lightning → دفع → رمز → بيانات](https://l402kit.vercel.app/flow-ar.gif)

```
API الخاص بك ──► l402-kit ──► HTTP 402 + فاتورة Lightning
                                         │
                           العميل يدفع (< ثانية واحدة)
                                         │
                        99.7% → عنوان Lightning الخاص بك  (فوري)
                         0.3% → ShinyDapps (رسوم)
                                         │
                        هذه الإضافة تقرأ هنا  ▲ أنت هنا
```

### الروابط

[📖 Docs AR](https://l402kit.vercel.app/docs/ar/introduction) · [▶ Demo](https://l402kit.vercel.app/demo) · [GitHub](https://github.com/ShinyDapps/l402-kit)

---

## Italiano

**Guarda i tuoi sats arrivare — senza lasciare VS Code.**

### Funzionalità

⚡ **Contatore sats live** nella barra di stato

📊 **Pannello laterale** con grafico a barre in tempo reale

📋 **Cronologia completa** — endpoint, importo, timestamp, valore USD

🌍 **11 lingue integrate**

🎨 **Tema Chiaro / Scuro / Auto**

📈 **Intervalli grafico** — 1D / 7D (gratuito) · 30D / 1Y / ALL (Pro)

### Come usare

![Estensione ShinyDapps in azione — contatore sats live, pannello laterale, grafico a barre](https://l402kit.vercel.app/demo-extension.gif)

**Passo 1 — Aggiungi l402-kit alla tua API**

```bash
npm install l402-kit      # TypeScript / Node.js
pip install l402kit       # Python
go get github.com/shinydapps/l402-kit/go@v1.1.6
cargo add l402kit         # Rust
```

**Passo 2 — Configura l'estensione**

Apri Command Palette (`Ctrl+Shift+P`) →
**ShinyDapps: Configure Lightning Address**

Inserisci lo stesso Lightning address usato nella tua API.

**Passo 3 — Osserva i pagamenti in tempo reale**

Clicca sull'icona ⚡ nella barra delle attività.

### Come funziona

![Flusso di pagamento — HTTP 402 → fattura Lightning → pagamento → token → dati](https://l402kit.vercel.app/flow-it.gif)

```
La tua API ──► l402-kit ──► HTTP 402 + fattura Lightning
                                      │
                        Il client paga (< 1 secondo)
                                      │
                     99,7% → il tuo Lightning address  (istantaneo)
                      0,3% → ShinyDapps (commissione)
                                      │
                     Questa estensione legge qui  ▲ SEI QUI
```

### Link

[📖 Docs IT](https://l402kit.vercel.app/docs/it/introduction) · [▶ Demo](https://l402kit.vercel.app/demo) · [GitHub](https://github.com/ShinyDapps/l402-kit)

---

<div align="center">

Built with ⚡ by [ShinyDapps](https://github.com/ShinyDapps) · MIT License

**Bitcoin has no borders.**

[Docs](https://l402kit.vercel.app/docs) · [Demo](https://l402kit.vercel.app/demo) · [npm](https://npmjs.com/package/l402-kit) · [PyPI](https://pypi.org/project/l402kit) · [GitHub](https://github.com/ShinyDapps/l402-kit)

</div>
