# AI Website Builder — Product Roadmap

*Last updated: 2026-03-25*

---

## ✅ Shipped

### Core Builder
- [x] Chat-based website generation (prompt → HTML)
- [x] 5 AI models (MiMo V2 Pro, MiniMax M2.5, Gemini 2.5 Pro, Claude Sonnet 4, Claude Opus 4)
- [x] Split-screen: Chat + Preview + Code editor (Monaco)
- [x] One-click deploy to *.kenzoagent.com subdomains
- [x] Copy, download, open in new tab
- [x] Iterative refinement (modify existing code via chat)
- [x] Mobile-optimized builder (bottom tab bar)
- [x] Streaming responses (SSE — live HTML preview)
- [x] Multi-page projects (URL dropdown, multiple HTML files)
- [x] File tree code view (collapsible panel, switch between files)

### Landing Page
- [x] Dark theme with animated background
- [x] UZ/RU/EN language switcher (localStorage)
- [x] Features section, model cards with info modals
- [x] Pricing tiers: Free ($0), Starter ($5), Pro ($15), Expert ($30)
- [x] Mobile hamburger nav
- [x] OG tags, meta descriptions, favicon, canonical URLs
- [x] Privacy policy page

### Auth System (Supabase)
- [x] Email + password signup/login
- [x] Continue as Guest option
- [x] Session persistence
- [x] User avatar + dropdown menu
- [x] Landing page → app auth flow (?auth=login / ?auth=signup)

### Dashboard
- [x] Save & revisit projects (auto-save, list, open, delete, rename)
- [x] Template library (grid with previews)
- [x] Profile page (name, username, phone, bio, location, website)
- [x] Usage tracking + plan limits (Free: 5, Starter: 50, Pro: 200, Expert: unlimited)
- [x] Profile stats (builds, projects, deployed)

### UI/UX Polish
- [x] Resizable divider (drag chat/preview boundary)
- [x] Device preview modes: Desktop / Tablet / Phone
- [x] Lovable-style redesign: avatars, URL bar, status dot, underline tabs
- [x] Chat clear / new chat button
- [x] Iframe sandboxing

### Brainstorm Mode
- [x] Brainstorm / Build toggle in chat
- [x] AI strategist with PRD + JTBD + AIDA + Value Prop Canvas
- [x] "Build it →" button from finalized plan
- [x] Separate /api/brainstorm endpoint with conversation history

### Security & SEO (Audit Fixes)
- [x] Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- [x] Static asset caching (7 day expiry via nginx)
- [x] Preconnect hints for CDNs
- [x] Accessibility: aria-labels, iframe titles, zoom enabled, contrast fixes
- [x] OG/Twitter meta tags on all pages

---

## 🔜 Next Up — Pre-Launch

### Account Settings Page
- [ ] Change password
- [ ] Delete account
- [ ] Email change (optional)

### Appearance Page
- [ ] Light/dark theme toggle
- [ ] Save preference to localStorage
- [ ] CSS variable swap (builder already has 166 vars)

### Support & Help Page
- [ ] FAQ section
- [ ] Contact email

### Launch Polish
- [ ] "Built with AI Builder" badge on free tier deploys
- [ ] Landing page redesign (deferred — works for now)

---

## 📋 Phase 2 — Post-Launch Growth

### Payment Integration
- [ ] Payme integration (Uzbekistan)
- [ ] Click integration (Uzbekistan)
- [ ] Plan upgrade flow
- [ ] Subscription management
- [ ] *Requires LLC (Khumoyun handling separately)*

### 4 Build Modes
- [ ] 🌐 Website — HTML + Tailwind + JS (current)
- [ ] ⚙️ Interactive Tool — HTML + JS + localStorage
- [ ] 🤖 Telegram Bot — Node.js + Telegraf
- [ ] 📊 CRM — Supabase per-user backends

### Marketing & Growth
- [ ] "Sites built" counter on landing page (social proof)
- [ ] Showcase gallery of best generated sites
- [ ] Telegram community for Uzbek builders
- [ ] Email after signup with tips + examples
- [ ] "Your site got X views" notifications

---

## 🤖 Phase 3 — Agent Hub (Personal AI Agent Platform)

### Core
- [ ] Per-user agent instance with persistent memory
- [ ] Personal VPS provisioning
- [ ] Conversational interface (web, Telegram, WhatsApp)

### Tool Integrations
- [ ] Gmail, Google Calendar
- [ ] Flight & train booking
- [ ] Task management & reminders
- [ ] Web browsing & research

### Business Advisor Mode
- [ ] Learn about user's business
- [ ] Proactive suggestions
- [ ] Market research & competitor analysis

---

## 🏗 Infrastructure

- **Frontend:** Static HTML at /var/www/builder.kenzoagent.com/
- **Backend:** Node.js + Express, PM2 process "website-builder", port 3500
- **AI:** OpenRouter API (all models)
- **Auth + DB:** Supabase (ljfkpkytcahmugwphrqo)
- **Deploy API:** Flask on host:5000
- **DNS:** Wildcard *.kenzoagent.com via Cloudflare
