# Platform Tech Stack — The Full Picture

> The complete list of "Lego pieces" needed to build a full-service AI builder platform
> that competes with Bolt.new / Lovable, optimized for Uzbekistan market.

---

## What We're Building

A platform where anyone can come in and:
1. **Build websites** (static + dynamic)
2. **Build web apps** (dashboards, CRMs, booking systems)
3. **Build AI agents** (Telegram bots, customer support, automations)
4. **Deploy everything** with custom domains
5. **Accept payments** (Payme, Click for Uzbekistan)
6. **Manage everything** from one dashboard

---

## The Lego Pieces

### 🧠 LAYER 1: AI (The Brain)

These are the models that generate code and power agents.

| Piece | What It Does | Cost | We Have It? |
|-------|-------------|------|-------------|
| **Claude Sonnet 4.6** | Primary code generation — best quality HTML/CSS/JS | ~$3/1M tokens | ✅ Yes |
| **Claude Opus 4.6** | Complex apps, multi-file projects | ~$15/1M tokens | ✅ Yes |
| **Gemini 2.5 Flash** | Fast generation, brainstorming | Free-$0.60/1M | ✅ Yes |
| **Gemini 2.5 Pro** | Complex reasoning when Flash fails | ~$1.25/1M | ✅ Yes |
| **GPT-5.3 Codex** | Alternative code generation | ~$2/1M tokens | ✅ Yes |
| **GPT-4o Transcribe** | Voice → text for voice input | ~$0.006/min | ✅ Yes |
| **text-embedding-3-small** | Embeddings for RAG/knowledge base | $0.02/1M tokens | ✅ Yes (OpenAI) |
| **DeepSeek R1** | Deep reasoning, free | Free (OpenRouter) | ✅ Yes |

**Status: Complete.** We have all the AI models we need. No new ones required.

---

### 🖥️ LAYER 2: Runtime (Where User Code Runs)

This is the hardest piece. User-built apps need somewhere to actually run.

| Piece | What It Does | When Needed | Cost |
|-------|-------------|-------------|------|
| **Static file hosting (Nginx)** | Serves HTML/CSS/JS websites | ✅ Now | Free (our server) |
| **WebContainers (Nodebox/StackBlitz)** | Run Node.js IN THE BROWSER — no server needed | Level 3 | Free (open source) |
| **Serverless Functions** | Run backend code (API routes, form handlers) | Level 2 | $5-20/mo (or self-hosted) |
| **Docker containers** | Full app isolation for complex apps | Level 4 | $15-40/mo (separate VPS) |

**Key insight:** WebContainers let us run Node.js code directly in the user's browser. This is how Bolt.new works — no server required for development. The server is only needed for deployment. This saves us massive infrastructure costs.

**Recommended:** Use **Nodebox** (open source, by CodeSandbox) or **WebContainer API** (by StackBlitz). Both run Node.js in the browser using WebAssembly.

---

### 💾 LAYER 3: Database (Where Data Lives)

| Piece | What It Does | When Needed | Cost |
|-------|-------------|-------------|------|
| **Supabase (Postgres)** | Our platform database — users, projects, agents, billing | ✅ Now | Free tier (500MB) |
| **Supabase per-project schemas** | Each user app gets its own database schema | Level 2 | Same Supabase instance |
| **pgvector** | Vector embeddings for RAG knowledge base | Agent Builder | Free (Supabase extension) |
| **Redis** | Fast cache — sessions, hot conversation data | Level 3 (500+ users) | $5/mo |
| **SQLite (in browser)** | Lightweight DB for user apps running in WebContainers | Level 3 | Free |

**Status: Supabase handles everything until 500+ users.** No new databases needed for MVP.

---

### 🌐 LAYER 4: Networking & Deployment

| Piece | What It Does | When Needed | Cost |
|-------|-------------|-------------|------|
| **Nginx** | Reverse proxy, serves static files, SSL termination | ✅ Now | Free |
| **Cloudflare** | DNS, CDN, DDoS protection, SSL | ✅ Now | Free |
| **Cloudflare API** | Programmatic DNS for custom domains | Level 1 | Free |
| **Let's Encrypt / Certbot** | Auto SSL for custom domains | Level 1 | Free |
| **Wildcard DNS** | `*.kenzoagent.com` for user subdomains | ✅ Now | Free (Cloudflare) |
| **Deploy API** | Our custom deploy script (already built) | ✅ Now | Free |

**Status: Complete for Level 1-2.** Custom domains just need Cloudflare API integration.

---

### 💳 LAYER 5: Payments (How You Make Money)

| Piece | What It Does | When Needed | Cost |
|-------|-------------|-------------|------|
| **Payme** | Uzbek payment system — cards, wallets | Before launch | ~2% fee |
| **Click** | Second Uzbek payment system | Before launch | ~2% fee |
| **Stripe** | International payments (USD) | Later (non-UZ users) | 2.9% + $0.30 |
| **Subscription billing logic** | Plan management, upgrades, downgrades | Before launch | Custom code |
| **Usage metering** | Track generations, messages, deploys per user | Before launch | Custom code |

**Status: Not started. This is the #1 priority before launch.**

---

### 🔐 LAYER 6: Auth & Security

| Piece | What It Does | When Needed | Cost |
|-------|-------------|-------------|------|
| **Supabase Auth** | Email/password signup, sessions, JWT | ✅ Now | Free |
| **Row Level Security (RLS)** | Users can only see their own data | ✅ Now | Free |
| **Rate limiting** | Prevent abuse — API calls per minute | ✅ Now | Free (express-rate-limit) |
| **CSP headers** | Prevent XSS in user-generated sites | ✅ Now | Free |
| **Sandbox (iframe)** | Isolate user site previews | ✅ Now | Free |
| **API key encryption** | Encrypt stored Telegram tokens, etc. | Agent Builder | Free (crypto module) |

**Status: Core security in place.** Agent builder needs encryption for stored tokens.

---

### 🛠️ LAYER 7: Developer Tools (What Users See)

| Piece | What It Does | When Needed | Cost |
|-------|-------------|-------------|------|
| **Monaco Editor** | In-browser code editor (VS Code engine) | ✅ Now | Free |
| **Live Preview (iframe)** | Real-time preview of generated sites | ✅ Now | Free |
| **File Tree** | Multi-file project navigation | ✅ Now | Free |
| **Device Preview** | Desktop/tablet/phone frames | ✅ Now | Free |
| **Git integration** | Export to GitHub | Level 3 | Free (GitHub API) |
| **npm/package support** | Install packages in WebContainer | Level 3 | Free |
| **Terminal** | In-browser terminal for WebContainer | Level 4 | Free |

**Status: Core tools built.** WebContainer adds the rest.

---

### 📡 LAYER 8: Integrations (What Makes It Powerful)

| Piece | What It Does | When Needed | Cost |
|-------|-------------|-------------|------|
| **Telegram Bot API** | Create/manage Telegram bots | Agent Builder | Free |
| **grammy** | Telegram bot framework (lightweight) | Agent Builder | Free |
| **Brave Search API** | Web search for agents | Agent Builder | ✅ Have key |
| **Deepgram / OpenAI Whisper** | Voice transcription | ✅ Now | ~$0.006/min |
| **Resend / SendGrid** | Email sending for user apps | Level 2 | Free tier |
| **Twilio** | SMS for user apps | Level 3 | ~$0.01/msg |
| **Supabase Realtime** | WebSocket for live updates | Level 2 | Free |
| **Webhook receiver** | Accept external data into agents | Agent Builder | Custom code |

---

### 🏗️ LAYER 9: Infrastructure (Where Everything Runs)

| Piece | What It Does | When Needed | Monthly Cost |
|-------|-------------|-------------|-------------|
| **Hetzner VPS #1 (current)** | OpenClaw + Website Builder backend + Nginx | ✅ Now | ~$7 |
| **Hetzner VPS #2** | Agent runtime + app hosting | Level 3 | ~$15-20 |
| **Hetzner VPS #3** | Scale — dedicated to user app containers | Level 4 (500+ users) | ~$30-50 |
| **PM2** | Process manager — keeps Node.js alive | ✅ Now | Free |
| **Docker** | Container isolation for user apps | Level 3-4 | Free |
| **GitHub** | Code backup, version control | ✅ Now | Free |

**Current monthly infrastructure cost: ~$7**
**At Level 3 (100 users): ~$25/mo**
**At Level 4 (500+ users): ~$60-80/mo**

---

## The Full Stack — One Page Summary

```
USER DEVICE (Browser)
├── Monaco Editor (code editing)
├── WebContainer/Nodebox (run Node.js in browser) ← Level 3
├── Live Preview (iframe sandbox)
├── Voice Input (MediaRecorder → OpenAI Whisper)
└── Chat Interface (prompt → AI → code)

PLATFORM SERVER (Hetzner VPS #1)
├── Nginx (reverse proxy, static hosting, SSL)
├── Website Builder API (Express.js, port 3500)
├── Agent Runtime (Express.js, port 3600) ← Agent Builder phase
├── Deploy API (port 5000)
└── PM2 (process manager)

AI PROVIDERS (External APIs)
├── Anthropic (Claude Sonnet + Opus)
├── Google (Gemini Flash + Pro)
├── OpenAI (GPT-5.3 Codex + Whisper)
├── OpenRouter (DeepSeek R1, Llama, Qwen)
└── Brave Search

DATABASE (Supabase)
├── Auth (users, sessions)
├── Projects (sites, apps, agents)
├── Generations (usage tracking)
├── Knowledge Base (pgvector embeddings)
└── Billing (plans, payments, invoices)

DNS & CDN (Cloudflare)
├── Wildcard DNS (*.kenzoagent.com)
├── Custom domain CNAME management
├── SSL certificates
├── DDoS protection
└── CDN caching

PAYMENTS (Uzbekistan)
├── Payme (cards)
├── Click (cards + wallets)
└── Stripe (international, later)

INTEGRATIONS
├── Telegram (grammy — bot framework)
├── Email (Resend)
├── SMS (Twilio, later)
└── Webhooks (custom)
```

---

## What We DON'T Need (Saves Money)

| What Competitors Use | Why We Skip It | Our Alternative |
|---------------------|---------------|-----------------|
| AWS/GCP | Expensive, overkill for Uzbek market | Hetzner VPS ($7-20/mo) |
| Kubernetes | Complex, needs DevOps team | PM2 + Docker |
| Vercel/Netlify | Costly at scale | Our own Nginx deploy |
| Firebase | Google lock-in | Supabase (open source) |
| Stripe Atlas | Not available in Uzbekistan | Payme + Click |
| MongoDB | Unnecessary complexity | Postgres (Supabase) |
| Microservices | Over-engineering | Monolith + PM2 |

---

## Build Order (The Roadmap)

### Phase 1 — Launch Ready (NOW → 2 weeks)
- [x] Website builder (static sites)
- [ ] Payme/Click payment integration
- [ ] Plan enforcement (generation limits)
- [ ] Custom subdomains (already works)
- [ ] Streaming responses (live code generation)

### Phase 2 — Dynamic Sites (Month 2)
- [ ] Custom domain support (Cloudflare API)
- [ ] Form handling backend
- [ ] Email integration (contact forms)
- [ ] Basic database for user sites (Supabase schemas)
- [ ] Onboarding flow

### Phase 3 — Agent Builder (Month 3)
- [ ] Agent CRUD + dashboard
- [ ] Telegram bot integration
- [ ] Tool/skill system
- [ ] Knowledge base (RAG)
- [ ] Web chat widget

### Phase 4 — App Builder (Month 4-5)
- [ ] WebContainer integration (run Node.js in browser)
- [ ] Multi-file projects with npm
- [ ] Database provisioning per app
- [ ] Git export to GitHub
- [ ] Second server for app hosting

### Phase 5 — Scale (Month 6+)
- [ ] Template marketplace
- [ ] Plugin/integration marketplace
- [ ] Team collaboration
- [ ] White-label option
- [ ] Mobile app

---

## Competitive Advantage Over Bolt/Lovable

1. **Language:** UZ/RU/EN — they're English only
2. **Payments:** Payme/Click — they don't support Uzbekistan
3. **Price:** Our $9.99 Starter = their $20+ plans
4. **Telegram:** Built-in agent builder — they don't have this
5. **Local market:** We understand Uzbek businesses — they don't
6. **All-in-one:** Website + Agent + App in one platform — they're website-only

---

*This document is the master blueprint. Every technology listed here is a Lego piece.
Build them in order. Don't skip phases. Revenue from Phase 1 funds Phase 2, and so on.*
