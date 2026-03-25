# AI Website Builder — Product Roadmap

## ✅ Shipped (v3.1.0)

### Core Builder
- [x] Chat-based website generation (prompt → HTML)
- [x] 5 AI models (MiMo V2 Pro, MiniMax M2.5, Gemini 2.5 Pro, Claude Sonnet 4, Claude Opus 4)
- [x] Split-screen: Chat + Preview + Code editor (Monaco)
- [x] One-click deploy to *.kenzoagent.com subdomains
- [x] Copy, download, open in new tab
- [x] Iterative refinement (modify existing code via chat)
- [x] Mobile-optimized builder (bottom tab bar)

### Landing Page
- [x] Dark theme with animated background
- [x] UZ/RU/EN language switcher (localStorage)
- [x] Features section, model cards with info modals
- [x] Pricing tiers: Free ($0), Starter ($5), Pro ($15), Expert ($30)
- [x] Mobile hamburger nav

### Auth System (Supabase)
- [x] Email + password signup/login
- [x] Continue as Guest option
- [x] Session persistence
- [x] User avatar + dropdown menu
- [x] Landing page → app auth flow (?auth=login / ?auth=signup)

### UI/UX Polish
- [x] Resizable divider (drag chat/preview boundary)
- [x] Device preview modes: Desktop / Tablet (iPad frame) / Phone (iPhone frame with notch)
- [x] Lovable-style redesign: avatars, URL bar, status dot, underline tabs, Inter font
- [x] Chat clear / new chat button
- [x] Iframe sandboxing (links open in new tab, no builder-in-builder)

### Brainstorm Mode
- [x] Brainstorm / Build toggle in chat
- [x] AI strategist asks questions, plans structure, suggests copy before coding
- [x] Uses PRD + JTBD + AIDA + Value Prop Canvas frameworks
- [x] "Build it →" button auto-generates from finalized plan
- [x] Separate /api/brainstorm endpoint with conversational history

---

## 🔜 Next Up (Phase 1)

### Save & Revisit Projects
- [ ] Save generated sites to Supabase (projects table exists)
- [ ] "My Projects" page/modal — list, open, delete
- [ ] Auto-save after generation
- [ ] Project naming

### Usage Tracking + Plan Limits
- [ ] Count generations per user per month
- [ ] Enforce plan limits (Free: 5/mo, Starter: 50, Pro: 200, Expert: unlimited)
- [ ] Show usage in user dropdown
- [ ] Upgrade prompt when limit hit

### Streaming Responses
- [ ] Show HTML appearing live instead of waiting for full generation
- [ ] Progress indicator with partial preview

---

## 📋 Phase 2

### 4 Build Modes
- [ ] 🌐 Website — HTML + Tailwind + JS (current)
- [ ] ⚙️ Interactive Tool — HTML + JS + localStorage
- [ ] 🤖 Telegram Bot — Node.js + Telegraf (code + deployment guide)
- [ ] 📊 CRM — needs Supabase per-user backends

### Multi-Page Projects
- [ ] Page/route dropdown selector (like Lovable)
- [ ] Generate multiple pages per project
- [ ] Navigation between pages
- [ ] Shared layout/header/footer

### File Tree Code View
- [ ] Collapsible folder structure in code tab
- [ ] Multiple files per project (components, pages, assets)
- [ ] Search within code

### Payment Integration
- [ ] Payme integration (Uzbekistan)
- [ ] Click integration (Uzbekistan)
- [ ] Plan upgrade flow
- [ ] Subscription management
- [ ] Requires LLC (Khumoyun handling separately)

---

## 💡 Marketing & Growth Tactics (to implement)

### Free User Experience Optimization
- [ ] Generous free tier to hook users (5 generations enough to see value)
- [ ] Brainstorm mode is unlimited (no generation cost) — keeps users engaged
- [ ] Show "upgrade for more" not "you're blocked"
- [ ] Share generated sites → viral loop (built with AI Web Builder watermark?)
- [ ] Guest mode → friction-free first experience → ask for signup after first generation

### Conversion Tactics
- [ ] Show premium model output quality vs free (side-by-side?)
- [ ] "Sites built" counter on landing page (social proof)
- [ ] Showcase gallery of best generated sites
- [ ] Telegram channel/group for Uzbek builders community
- [ ] Template library — pre-made starting points

### Retention
- [ ] Email after signup with tips + examples
- [ ] "Your site got X views" notifications (after deploy)
- [ ] Weekly "new models added" or "new features" updates
- [ ] In-app changelog/what's new

---

## 🏗 Infrastructure

- **Frontend:** Static HTML at /var/www/builder.kenzoagent.com/
- **Backend:** Node.js + Express, PM2 process "website-builder", port 3500
- **AI:** OpenRouter API (all models)
- **Auth + DB:** Supabase (ljfkpkytcahmugwphrqo)
- **Deploy API:** Flask on host:5000
- **DNS:** Wildcard *.kenzoagent.com via Cloudflare

---

## 🤖 Phase 3+ — Personal AI Agent Platform ("Agent Hub")

**Vision:** Every user gets their own personal AI agent (powered by OpenClaw under the hood).

### Core Features
- [ ] Per-user agent instance with persistent memory
- [ ] Personal VPS provisioning (each agent runs on its own server)
- [ ] Agent learns about the user — preferences, business, goals
- [ ] Conversational interface (chat with your agent via web, Telegram, WhatsApp)

### Tool Integrations
- [ ] Gmail — read/send emails, manage inbox
- [ ] Google Calendar — view/create events, scheduling
- [ ] Flight & train booking
- [ ] Task management & reminders
- [ ] Web browsing & research
- [ ] File management

### Business Advisor Mode
- [ ] Learns about user's business (industry, customers, challenges)
- [ ] Proactive suggestions and problem-solving
- [ ] Market research and competitor analysis
- [ ] Financial tracking & advice

### Infrastructure Required
- [ ] Per-user VPS orchestration (create/destroy/manage)
- [ ] Billing per compute (metered or tier-based)
- [ ] OAuth flows for tool integrations (Google, etc.)
- [ ] Agent memory/knowledge base per user (Supabase vectors?)
- [ ] Admin dashboard for managing all agent instances

**Note:** This converges with the Business Advisor product. Consider merging them into one "AI Agent" offering.

---

*Last updated: 2026-03-24*

---

## Phase 4: Production Infrastructure (Pre-launch)

### Architecture Decision (2026-03-24)
- **Supabase** stays for: Auth, RLS security, database (projects/generations/usage), vector search (pgvector for future AI features)
- **PocketBase** added for: Per-user runtime isolation, multi-tenant subscriber spaces, file storage for generated sites
- **Separate production VPS** (Hetzner CX31): dedicated server for builder.kenzoagent.com, bigger capacity for concurrent users
- **Object storage**: Hetzner S3 or Cloudflare R2 for storing deployed user sites

### When to execute
- After first paying users
- When Supabase free tier limits are hit
- Before scaling to 100+ active users

---

## Phase 3: Agent Hub + Design Intelligence (Vision)

### RAG-Powered Design System (2026-03-24)

**Core idea:** Template library becomes a vector knowledge base. AI retrieves similar examples before generating — like a designer who studied 500 sites.

**Architecture:**
1. **Template indexing** — each template stored with metadata (industry, design patterns, colors, layout type) + full HTML embedded as vector in Supabase pgvector
2. **Retrieval at generation** — user prompt → embed → similarity search → top 3 templates injected as context → AI generates inspired by real examples
3. **Per-user design agents** — each user's agent has: full template library access, memory of user's past builds, brand preferences, style taste memory
4. **Flywheel** — more templates → better retrieval → better output → users add their best builds back as templates

**Stack:** Supabase pgvector (already have it) + OpenRouter embeddings + per-user agent context

**Implementation phases:**
- Phase 3a: Index all templates into pgvector with metadata
- Phase 3b: RAG retrieval in generate endpoint (top 3 similar as context)
- Phase 3c: Per-user agent with build history memory
- Phase 3d: User can "train" their agent on their own style

**Pricing:** Agent Hub = separate subscription tier (Expert+)

---

## Launch Readiness Checklist (Pre-launch Priority)

**Goal: Zero friction onboarding — user lands, builds, publishes without confusion.**

### Friction points to eliminate before launch:
- [ ] Onboarding flow: first-time user should immediately understand what to do (tooltip, guided prompt, or example)
- [ ] Guest → signup conversion: make the limit prompt feel natural, not punishing
- [ ] Template → Build flow: one click from template preview to generating
- [ ] Voice + image: should feel native, not like a hidden feature
- [ ] Mobile experience: test full flow on Safari/iOS
- [ ] Error states: AI timeout, generation failure — show clear retry messaging
- [ ] Loading states: streaming should feel exciting, not broken
- [ ] Deploy flow: after generating, "Publish your site" should be obvious and one-click
- [ ] Payment flow: Payme integration (after LLC) must be frictionless for Uzbek users

**Core principle: User should go from "I want a website" to "my site is live" in under 5 minutes.**

---

## Phase 4 — AI Builder Platform (2026-2027 Vision)

### Evolution: Website Builder → AI Builder Platform

Three pillars:

**Pillar 1: Vibe Coding (current)**
- Build websites, apps, e-commerce by describing it
- Target: freelancers, designers, regular users

**Pillar 2: Agent Builder (new)**
- Users create personal AI assistants for their business
- Agent learns over time — financials, marketing, operations, mistakes
- Under the hood: OpenClaw or custom agent framework
- Moat: switching cost increases as agent accumulates business knowledge

**Pillar 3: Agentic Services (convergence)**
- Built tools + embedded agents = smarter tools
- POS with AI advisor (director-only access)
- E-commerce with AI customer support
- Any tool + agent = competitive advantage

### Target Users
- Freelancers: build anything for clients
- Regular people: personal projects, no-code apps
- Business owners: tools + AI advisors that grow with them

### Key Principle
"Build anything you can imagine, with words."
The platform is limited only by imagination, not technical skill.

### Technical Direction
- OpenClaw as agent runtime (or custom framework later)
- Per-user agent memory (RAG + vector store)
- Multi-tenant isolation (PocketBase or similar)
- Agent context accumulates over weeks/months → deep business understanding
