# ShinyDapps ⚡ Lightning Payments

🇺🇸 [English](#english) · 🇧🇷 [Português](#português) · 🇪🇸 [Español](#español) · 🇨🇳 [中文](#中文) · 🇯🇵 [日本語](#日本語) · 🇫🇷 [Français](#français) · 🇩🇪 [Deutsch](#deutsch) · 🇷🇺 [Русский](#русский) · 🇮🇳 [हिंदी](#हिंदी) · 🇸🇦 [العربية](#العربية) · 🇮🇹 [Italiano](#italiano)

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ShinyDapps.shinydapps-l402)](https://marketplace.visualstudio.com/items?itemName=ShinyDapps.shinydapps-l402)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/ShinyDapps.shinydapps-l402)](https://marketplace.visualstudio.com/items?itemName=ShinyDapps.shinydapps-l402)
[![npm](https://img.shields.io/npm/v/l402-kit)](https://npmjs.com/package/l402-kit)
[![PyPI](https://img.shields.io/pypi/v/l402kit)](https://pypi.org/project/l402kit)
[![GitHub Stars](https://img.shields.io/github/stars/ShinyDapps/l402-kit)](https://github.com/ShinyDapps/l402-kit)

---

## English

**Monitor your Bitcoin Lightning API earnings in real-time — right inside VS Code.**

This extension is part of the **l402-kit** ecosystem — the simplest way to add Bitcoin Lightning pay-per-call to any API.

![ShinyDapps Lightning Payments — VS Code sidebar showing sats counter, chart and payment history](https://raw.githubusercontent.com/ShinyDapps/l402-kit/main/vscode-extension/docs/screenshot.svg)

### Features

⚡ **Live sats counter** in the status bar — updates every 30 seconds

📊 **Payment sidebar** with real-time chart — click the ⚡ icon in the activity bar

🌍 **Multilingual panel** — switch between 🇺🇸 🇧🇷 🇪🇸 🇨🇳 🇯🇵 🇫🇷 🇩🇪 🇷🇺 🇮🇳 🇸🇦 🇮🇹 inside the sidebar

🎨 **Light / Dark / Auto theme** — selector built into the panel

📈 **7-day bar chart** — see your sats per day at a glance

🔐 **Cryptographic verification** — SHA256 proof of payment, no chargebacks

🤖 **AI agent native** — machines paying machines, no human needed

### How to use

**1. Add l402-kit to your API**

```bash
npm install l402-kit        # TypeScript / Node.js
pip install l402kit         # Python
```

**2. Configure the extension**

Open Command Palette (`Ctrl+Shift+P`) → **ShinyDapps: Configure Lightning Address**

Enter your Lightning Address (e.g. `you@blink.sv`) and press Enter. Done.

**Or set all three values in VS Code Settings (`Ctrl+,` → search "shinydapps"):**

| Setting | What to put |
|---|---|
| `shinydapps.lightningAddress` | Your Lightning address, e.g. `you@blink.sv` |
| `shinydapps.supabaseUrl` | Your Supabase project URL — found at supabase.com → Project → Settings → API |
| `shinydapps.supabaseKey` | Your Supabase **anon** key — same page, under "Project API keys" |

> **Getting Supabase keys:** Go to [supabase.com](https://supabase.com) → open your project → Settings → API → copy the **Project URL** and the **anon public** key.

**3. Watch the sats come in**

The **⚡ sidebar icon** shows your payment chart and history. The **status bar** shows total sats received.

### vs. the competition

| | Stripe | PayPal | **l402-kit** |
|---|---|---|---|
| Minimum fee | $0.30 | $0.30 | **< 1 sat (~$0.00003)** |
| Settlement | 2–7 days | 1–3 days | **< 1 second** |
| Chargebacks | Yes | Yes | **Impossible** |
| AI agent support | No | No | **Yes** |
| Countries blocked | ~50 | ~30 | **0** |
| Setup time | Hours | Hours | **3 lines of code** |
| VS Code monitor | No | No | **Yes — this extension** |

### The full ecosystem

```
l402-kit (npm + PyPI)     ← add to your API
    │
    ├── TypeScript / Express
    ├── Python / FastAPI / Flask
    │
    └── ShinyDapps backend
            │
            ├── Creates Lightning invoices
            ├── Sends 99.7% to your Lightning Address
            ├── Keeps 0.3% fee
            └── Logs to Supabase
                    │
                    └── This VS Code extension reads here ← YOU ARE HERE
```

---

## Português

**Monitore seus ganhos em Bitcoin Lightning em tempo real — dentro do VS Code.**

Esta extensão faz parte do ecossistema **l402-kit** — a forma mais simples de adicionar pagamentos Bitcoin Lightning por chamada de API.

### Funcionalidades

⚡ **Contador de sats ao vivo** na barra de status — atualiza a cada 30 segundos

📊 **Painel lateral com gráfico** — clique no ícone ⚡ na barra de atividades

🌍 **Painel multilíngue** — troque entre 🇺🇸 🇧🇷 🇪🇸 🇨🇳 🇯🇵 dentro da barra lateral

🎨 **Tema Claro / Escuro / Auto** — seletor embutido no painel

📈 **Gráfico de barras 7 dias** — veja seus sats por dia de relance

🔐 **Verificação criptográfica** — prova de pagamento SHA256, sem chargebacks

🤖 **Nativo para agentes de IA** — máquinas pagando máquinas, sem humano no meio

### Como usar

**1. Adicione l402-kit à sua API**

```bash
npm install l402-kit        # TypeScript / Node.js
pip install l402kit         # Python
```

**2. Configure a extensão**

Abra o Command Palette (`Ctrl+Shift+P`) → **ShinyDapps: Configure Lightning Address**

Digite seu Lightning Address (ex: `voce@blink.sv`) e pressione Enter.

**Ou configure manualmente nas Configurações do VS Code (`Ctrl+,` → pesquise "shinydapps"):**

| Configuração | O que colocar |
|---|---|
| `shinydapps.lightningAddress` | Seu endereço Lightning, ex: `voce@blink.sv` |
| `shinydapps.supabaseUrl` | URL do projeto Supabase — em supabase.com → Projeto → Settings → API |
| `shinydapps.supabaseKey` | Chave **anon** do Supabase — mesma página, em "Project API keys" |

> **Obtendo as chaves Supabase:** Acesse [supabase.com](https://supabase.com) → abra seu projeto → Settings → API → copie a **Project URL** e a chave **anon public**.

**3. Veja os sats chegando**

O **ícone ⚡ na barra lateral** mostra seu gráfico e histórico de pagamentos.

### vs. a concorrência

| | Stripe | PayPal | **l402-kit** |
|---|---|---|---|
| Taxa mínima | $0,30 | $0,30 | **< 1 sat (~$0,00003)** |
| Liquidação | 2–7 dias | 1–3 dias | **< 1 segundo** |
| Chargebacks | Sim | Sim | **Impossível** |
| Suporte a agentes IA | Não | Não | **Sim** |
| Países bloqueados | ~50 | ~30 | **0** |
| Tempo de setup | Horas | Horas | **3 linhas de código** |

---

## Español

**Monitorea tus ganancias en Bitcoin Lightning en tiempo real — dentro de VS Code.**

### Características

⚡ **Contador de sats en vivo** en la barra de estado

📊 **Panel lateral con gráfico** — haz clic en el icono ⚡

🌍 **Panel multilingüe** — cambia entre 🇺🇸 🇧🇷 🇪🇸 🇨🇳 🇯🇵

🎨 **Tema Claro / Oscuro / Auto**

📈 **Gráfico de barras 7 días**

🔐 **Verificación criptográfica** — SHA256, sin contracargos

🤖 **Nativo para agentes IA**

### Cómo usar

```bash
npm install l402-kit        # TypeScript
pip install l402kit         # Python
```

Abre Command Palette (`Ctrl+Shift+P`) → **ShinyDapps: Configure Lightning Address**

**O configura manualmente en Configuración VS Code (`Ctrl+,` → busca "shinydapps"):**

| Ajuste | Valor |
|---|---|
| `shinydapps.lightningAddress` | Tu dirección Lightning, ej: `tu@blink.sv` |
| `shinydapps.supabaseUrl` | URL del proyecto Supabase — supabase.com → Proyecto → Settings → API |
| `shinydapps.supabaseKey` | Clave **anon** de Supabase — misma página |

---

## 中文

**在 VS Code 中实时监控您的比特币闪电网络 API 收入。**

### 功能特点

⚡ **状态栏实时 sats 计数器** — 每30秒更新

📊 **带图表的支付侧边栏**

🌍 **多语言面板** — 支持 🇺🇸 🇧🇷 🇪🇸 🇨🇳 🇯🇵 切换

🎨 **亮色 / 暗色 / 自动主题**

📈 **7天柱状图**

🔐 **密码学验证** — SHA256，无拒付

🤖 **AI 智能体原生支持**

### 如何使用

```bash
npm install l402-kit        # TypeScript
pip install l402kit         # Python
```

打开命令面板 (`Ctrl+Shift+P`) → **ShinyDapps: Configure Lightning Address**

**或在 VS Code 设置中手动配置 (`Ctrl+,` → 搜索 "shinydapps")：**

| 设置项 | 填写内容 |
|---|---|
| `shinydapps.lightningAddress` | 您的闪电地址，如 `you@blink.sv` |
| `shinydapps.supabaseUrl` | Supabase 项目 URL — supabase.com → 项目 → Settings → API |
| `shinydapps.supabaseKey` | Supabase **anon** 密钥 — 同一页面 |

---

## 日本語

**VS Code内でBitcoin Lightning API収益をリアルタイムで監視。**

### 機能

⚡ **ステータスバーのリアルタイムsatsカウンター**

📊 **グラフ付き支払いサイドバー**

🌍 **多言語パネル** — 🇺🇸 🇧🇷 🇪🇸 🇨🇳 🇯🇵 切替対応

🎨 **ライト / ダーク / 自動テーマ**

📈 **7日間棒グラフ**

🔐 **暗号学的検証** — SHA256、チャージバック不可

🤖 **AIエージェントネイティブ**

### 使い方

```bash
npm install l402-kit        # TypeScript
pip install l402kit         # Python
```

コマンドパレット (`Ctrl+Shift+P`) → **ShinyDapps: Configure Lightning Address**

**または VS Code 設定で手動設定 (`Ctrl+,` → "shinydapps" で検索)：**

| 設定 | 入力内容 |
|---|---|
| `shinydapps.lightningAddress` | Lightningアドレス (例: `you@blink.sv`) |
| `shinydapps.supabaseUrl` | Supabase プロジェクト URL — supabase.com → プロジェクト → Settings → API |
| `shinydapps.supabaseKey` | Supabase **anon** キー — 同ページ |

---

## Français

**Surveillez vos gains en Bitcoin Lightning en temps réel — directement dans VS Code.**

### Fonctionnalités

⚡ **Compteur de sats en direct**

📊 **Panneau latéral avec graphique**

🌍 **Panneau multilingue** — 🇺🇸 🇧🇷 🇪🇸 🇨🇳 🇯🇵

🎨 **Thème Clair / Sombre / Auto**

📈 **Graphique à barres 7 jours**

🔐 **Vérification cryptographique** — SHA256, sans rétrofacturation

🤖 **Natif pour les agents IA**

### Comment utiliser

```bash
npm install l402-kit
pip install l402kit
```

Ouvrez le Command Palette (`Ctrl+Shift+P`) → **ShinyDapps: Configure Lightning Address**

**Ou configurez dans les Paramètres VS Code (`Ctrl+,` → recherchez "shinydapps").**

---

## Deutsch

**Überwachen Sie Ihre Bitcoin-Lightning-API-Einnahmen in Echtzeit — direkt in VS Code.**

### Funktionen

⚡ **Live-Sats-Zähler** in der Statusleiste

📊 **Zahlungs-Seitenleiste mit Diagramm**

🌍 **Mehrsprachiges Panel** — 🇺🇸 🇧🇷 🇪🇸 🇨🇳 🇯🇵

🎨 **Hell / Dunkel / Auto-Theme**

📈 **7-Tage-Balkendiagramm**

🔐 **Kryptografische Verifizierung** — SHA256, keine Rückbuchungen

🤖 **KI-Agenten-nativ**

### Verwendung

```bash
npm install l402-kit
pip install l402kit
```

Command Palette (`Ctrl+Shift+P`) → **ShinyDapps: Configure Lightning Address**

**Oder manuell in den VS Code-Einstellungen (`Ctrl+,` → "shinydapps" suchen).**

---

## Русский

**Отслеживайте заработок в Bitcoin Lightning API в реальном времени — прямо в VS Code.**

### Возможности

⚡ **Живой счётчик сатошей** в строке состояния

📊 **Боковая панель с графиком**

🌍 **Многоязычная панель** — 🇺🇸 🇧🇷 🇪🇸 🇨🇳 🇯🇵

🎨 **Светлая / Тёмная / Авто тема**

📈 **Столбчатая диаграмма за 7 дней**

🔐 **Криптографическая верификация** — SHA256, без чарджбэков

🤖 **Нативная поддержка ИИ-агентов**

### Использование

```bash
npm install l402-kit
pip install l402kit
```

Command Palette (`Ctrl+Shift+P`) → **ShinyDapps: Configure Lightning Address**

**Или вручную в настройках VS Code (`Ctrl+,` → поиск "shinydapps").**

---

## हिंदी

**VS Code के अंदर ही अपनी Bitcoin Lightning API कमाई को रियल-टाइम में मॉनिटर करें।**

### विशेषताएं

⚡ **स्टेटस बार में लाइव sats काउंटर**

📊 **चार्ट के साथ पेमेंट साइडबार**

🌍 **बहुभाषी पैनल** — 🇺🇸 🇧🇷 🇪🇸 🇨🇳 🇯🇵

🎨 **लाइट / डार्क / ऑटो थीम**

📈 **7 दिन का बार चार्ट**

🔐 **क्रिप्टोग्राफिक वेरिफिकेशन** — SHA256

🤖 **AI एजेंट नेटिव**

### कैसे उपयोग करें

```bash
npm install l402-kit
pip install l402kit
```

Command Palette (`Ctrl+Shift+P`) → **ShinyDapps: Configure Lightning Address**

---

## العربية

**راقب أرباحك من Bitcoin Lightning API في الوقت الفعلي — داخل VS Code مباشرةً.**

### المميزات

⚡ **عداد sats مباشر** في شريط الحالة

📊 **لوحة جانبية مع رسم بياني**

🌍 **لوحة متعددة اللغات** — 🇺🇸 🇧🇷 🇪🇸 🇨🇳 🇯🇵

🎨 **ثيم فاتح / داكن / تلقائي**

📈 **مخطط شريطي لـ 7 أيام**

🔐 **تحقق تشفيري** — SHA256، لا استردادات

🤖 **مصمم لوكلاء الذكاء الاصطناعي**

### كيفية الاستخدام

```bash
npm install l402-kit
pip install l402kit
```

افتح Command Palette (`Ctrl+Shift+P`) → **ShinyDapps: Configure Lightning Address**

---

🇺🇸 [English Docs](https://shinydapps-bd9fa40b.mintlify.app) ·
🇧🇷 [Português](https://shinydapps-bd9fa40b.mintlify.app/pt/introduction) ·
🇪🇸 [Español](https://shinydapps-bd9fa40b.mintlify.app/es/introduction) ·
🇨🇳 [中文](https://shinydapps-bd9fa40b.mintlify.app/zh/introduction) ·
🇮🇳 [हिंदी](https://shinydapps-bd9fa40b.mintlify.app/hi/introduction) ·
🇸🇦 [العربية](https://shinydapps-bd9fa40b.mintlify.app/ar/introduction) ·
🇫🇷 [Français](https://shinydapps-bd9fa40b.mintlify.app/fr/introduction) ·
🇩🇪 [Deutsch](https://shinydapps-bd9fa40b.mintlify.app/de/introduction) ·
🇷🇺 [Русский](https://shinydapps-bd9fa40b.mintlify.app/ru/introduction) ·
🇯🇵 [日本語](https://shinydapps-bd9fa40b.mintlify.app/ja/introduction) ·
🇮🇹 [Italiano](https://shinydapps-bd9fa40b.mintlify.app/it/introduction)

---

Built with ⚡ by [ShinyDapps](https://github.com/ShinyDapps) · MIT License · Bitcoin has no borders.
