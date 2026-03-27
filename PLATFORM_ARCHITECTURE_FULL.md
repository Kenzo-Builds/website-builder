# Full Platform Architecture — Master Blueprint

> **Created:** 2026-03-26/27 (session discussion)
> **Status:** Approved by Khumoyun. Follow this architecture for all-in-one platform build.
> **Purpose:** Complete technical reference for building a multi-tenant app builder platform.

---

## Vision

One platform where users can:
1. Build websites (static + dynamic)
2. Build web apps (CRMs, booking systems, dashboards, e-commerce)
3. Build AI agents (Telegram bots, customer support, automations)
4. Deploy everything with custom domains
5. Accept payments (Payme/Click for Uzbekistan)
6. Manage everything from one dashboard

Competes with Bolt.new / Lovable, optimized for Uzbekistan market.

---

## Core Architecture — Three Pillars

### Pillar 1: Development (User's Browser — $0 cost)

WebContainers run Node.js inside the user's browser. No server needed during development.

```
User's Browser:
├── Chat (describe what you want)
├── AI generates code (frontend + backend + database schema)
├── WebContainer boots (Node.js in WebAssembly)
├── npm install runs in browser
├── App runs at localhost:3000 in browser
├── User tests forms, buttons, database — all local
└── Your server cost: $0
```

**Technology:** Nodebox (CodeSandbox) or WebContainer API (StackBlitz)

### Pillar 2: Database (Supabase — Multi-tenant)

One Supabase instance, schema-per-user isolation.

```
Supabase (one instance):
├── public schema — YOUR platform (users, billing, projects)
├── app_user_A schema — User A's CRM tables
├── app_user_B schema — User B's booking tables
├── app_user_C schema — User C's shop tables
└── Postgres enforces isolation — users can't see each other's data
```

**AI generates SQL** for each user's app → platform creates schema → runs migrations.

### Pillar 3: Production (Your Server — where deployed apps run)

Each deployed app runs in an isolated Docker container with resource limits.

```
Production Server:
├── Docker containers (one per deployed app)
│   ├── user-app-A: 128MB RAM, 0.25 CPU, port 4001
│   ├── user-app-B: 128MB RAM, 0.25 CPU, port 4002
│   └── user-app-C: 128MB RAM, 0.25 CPU, port 4003
├── Nginx (routes domains to containers)
│   ├── crm.kenzoagent.com → port 4001
│   ├── booking.kenzoagent.com → port 4002
│   └── shop.kenzoagent.com → port 4003
└── Deploy Manager (orchestrates everything)
```

---

## Deploy Manager — The Conductor

One Node.js service (~200 lines) that orchestrates deployment:

```
User clicks "Deploy" →
  1. Create Supabase schema (app_user_123)
  2. Run SQL migrations (create tables)
  3. Build Docker image from user's code
  4. Start container with resource limits
  5. Configure Nginx routing
  6. Get SSL certificate
  7. Return live URL to user
```

Already have a simpler version (deploy API at port 5000). This extends it with database + Docker steps.

---

## Multi-Tenant Isolation (Three Walls)

| Layer | Technology | What It Prevents |
|---|---|---|
| **Data isolation** | Postgres schemas | User A can't see User B's data |
| **Runtime isolation** | Docker containers | User A's crash can't affect User B |
| **Network isolation** | Nginx routing | Each app has its own domain, can't talk to other containers |

Even if one wall fails, the other two still protect.

---

## Resource Limits Per Plan

| Resource | Free | Starter $9.99 | Pro $19.99 | Expert $69.99 |
|---|---|---|---|---|
| Deployed apps | 1 | 3 | 10 | Unlimited |
| RAM per app | 64MB | 128MB | 256MB | 512MB |
| CPU per app | 0.1 core | 0.25 core | 0.5 core | 1 core |
| Database rows | 10,000 | 100,000 | 1,000,000 | Unlimited |
| Custom domain | No | No | Yes | Yes |
| Auto-sleep | 30min idle | 2hr idle | Never | Never |

---

## Full Tech Stack

### AI Layer (all ready ✅)
- Claude Sonnet 4.6 — primary code generation
- Claude Opus 4.6 — complex apps
- Gemini 2.5 Flash / 3 Flash — fast generation
- GPT-5.3 Codex / 5.4 — alternative code gen
- GPT-4o Transcribe — voice input
- text-embedding-3-small — RAG embeddings
- **Future routing:** Nano (chat) → Mini (simple) → Flash (standard) → GPT-5.4/Sonnet (premium)

### Runtime Layer
- WebContainers — browser-based Node.js for development
- Docker — container isolation for production
- PM2 — process management (current), Docker replaces at scale
- Node.js 20 — server runtime

### Database Layer
- Supabase Postgres — all platform + user app data
- pgvector — RAG knowledge base embeddings
- Schema-per-user — multi-tenant isolation
- Redis — conversation cache (at 500+ users)

### Networking Layer
- Nginx — reverse proxy, SSL, domain routing
- Cloudflare — DNS, CDN, DDoS protection, wildcard DNS
- Cloudflare API — programmatic custom domain management
- Let's Encrypt / Certbot — auto SSL

### Payment Layer
- Payme — Uzbek card payments (platform subscriptions + user app payments)
- Click — second Uzbek payment option
- Stripe — international payments (later)
- Webhook-based — Payme notifies your server when payment completes

### Auth & Security
- Supabase Auth — signup, login, sessions, JWT
- Row Level Security — database-level access control
- Rate limiting — express-rate-limit
- CSP headers — XSS prevention
- Docker isolation — container-level security
- API key encryption — for stored user credentials

### Developer Tools
- Monaco Editor — in-browser code editor
- Live Preview — iframe sandbox
- File Tree — multi-file navigation
- Device Preview — desktop/tablet/phone
- Git integration — export to GitHub (future)

### Integrations
- Telegram (grammy) — agent builder
- Brave Search API — web search for agents
- Deepgram / OpenAI Whisper — voice transcription
- Resend — email for user apps (future)
- Webhooks — external data integration

---

## Infrastructure Scaling Path

| Users | Setup | Monthly Cost |
|---|---|---|
| 0-200 | 1 Hetzner VPS (upgrade to 8GB) | ~$13 |
| 200-500 | 1 Hetzner VPS (16GB) | ~$18 |
| 500-2,000 | 2 VPS (platform + production) | ~$40 |
| 2,000-5,000 | 3-4 VPS | ~$80-150 |
| 5,000+ | Consider DO managed or stay Hetzner with automation | ~$150-500 |

**Migration path:** Hetzner → DigitalOcean when manual management exceeds 10hr/week.
**Migration effort:** 30 minutes (code on GitHub, data in Supabase, server is stateless).
**Docker backup:** `docker commit` + push to Docker Hub (khumoyun09 account ready).

---

## Payment Architecture

### Platform Subscriptions (users pay you)
```
User → Upgrade button → Your backend creates Payme payment →
User redirected to Payme checkout → Pays with Uzcard/Humo →
Payme webhook → Your backend upgrades plan in Supabase
```

### User App Payments (their customers pay them)
```
User enters THEIR OWN Payme merchant credentials →
AI generates payment integration code →
User's customers pay → Money goes to USER's Payme account
You never touch their money.
```

---

## Agent Builder (Separate Product, Same Platform)

Lightweight framework — single Node.js process handles all agents:

```
agent-runtime/
├── agent-manager.js — loads/manages all active agents
├── llm.js — AI API calls
├── tool-executor.js — runs tools (search, weather, RAG)
├── integrations/telegram.js — grammy bots
├── integrations/web-chat.js — embeddable widget
└── scheduler.js — cron tasks
```

- Each agent = system prompt + LLM + tool loop + Telegram bot
- No containers per agent — one process handles all
- Knowledge base via pgvector RAG
- Full blueprint in AGENT_BUILDER_ARCHITECTURE.md

---

## What Users Can Build

Any web application:
- CRM systems, booking apps, e-commerce stores
- Dashboards, project management, HR systems
- Invoice/billing, inventory management
- Chat applications, course platforms
- Any CRUD application

**Cannot build:** Native mobile apps (but PWA works), GPU-heavy tasks, multiplayer games.

---

## Competitive Advantages

1. **Language:** UZ/RU/EN — competitors are English only
2. **Payments:** Payme/Click — competitors don't support Uzbekistan
3. **Price:** $9.99 Starter vs competitor's $20+
4. **Telegram:** Built-in agent builder — unique feature
5. **Local market:** Understands Uzbek businesses
6. **All-in-one:** Website + App + Agent in one platform

---

## Build Phases

### Phase 1 — Launch (NOW → 2 weeks)
- [x] Website builder (static sites)
- [ ] Payme/Click payment integration
- [ ] Plan enforcement (generation limits)
- [ ] Streaming responses
- [ ] Custom subdomains

### Phase 2 — Dynamic Sites (Month 2)
- [ ] Custom domain support (Cloudflare API)
- [ ] Form handling backend
- [ ] Basic database for user sites
- [ ] Onboarding flow

### Phase 3 — Agent Builder (Month 3)
- [ ] Agent CRUD + dashboard
- [ ] Telegram bot integration
- [ ] Tool/skill system
- [ ] Knowledge base (RAG)

### Phase 4 — App Builder (Month 4-5)
- [ ] WebContainer integration
- [ ] Multi-file projects with npm
- [ ] Database provisioning (schema-per-user)
- [ ] Docker container deployment
- [ ] Deploy manager v2

### Phase 5 — Scale (Month 6+)
- [ ] Template/plugin marketplace
- [ ] Team collaboration
- [ ] White-label option
- [ ] Mobile app (PWA)

---

## Key Decisions Made

1. **Hetzner for now**, DigitalOcean when management overhead exceeds value
2. **Supabase for everything** — auth, database, storage, vectors
3. **Schema-per-user** multi-tenancy (not project-per-user)
4. **Docker containers** for deployed apps (not bare PM2)
5. **WebContainers** for development (not server-side sandboxes)
6. **Lightweight agent framework** (not OpenClaw per user)
7. **Single server** until 500+ deployed apps, then second server
8. **Revenue from Phase 1 funds Phase 2**, and so on

---

*This is the master blueprint. Every technical decision flows from this document.
When in doubt, refer here. When building, follow the phases in order.*
