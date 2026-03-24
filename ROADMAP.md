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
