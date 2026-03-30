# AI Builder — Competitive Strategy & Technical Roadmap
## How to reach Lovable/Bolt quality (80-90%)

**Last updated:** 2026-03-30
**Status:** Active — update after every major session

---

## 🎯 North Star Goal

Build an AI app builder that generates beautiful, functional, deployable apps from natural language prompts — targeting Uzbek small business owners who need CRMs, POS systems, booking apps, inventory tools. 80-90% of Lovable/Bolt quality at a fraction of the cost.

---

## 📊 Current State vs Competitors

| Feature | Us (Today) | Lovable | Bolt.new |
|---|---|---|---|
| Output quality | 40-50% | 100% | 95% |
| React + Shadcn/UI | ✅ (just built) | ✅ | ✅ |
| Long prompt support | ❌ (timeouts) | ✅ | ✅ |
| Modify/iterate | ❌ (regenerates all) | ✅ | ✅ |
| Auth in apps | ❌ | ✅ | ✅ |
| File-by-file streaming | ❌ | ✅ | ✅ |
| Project thumbnails | ❌ | ✅ | ✅ |
| Deploy React | ✅ (just built) | ✅ | ✅ |
| Uzbek market context | ✅ unique | ❌ | ❌ |
| Wizard onboarding | ✅ unique | ❌ | ❌ |

---

## 🔍 How Competitors Generate Beautiful Apps

### What Lovable does that we don't (yet)

**1. Pre-built page templates per app type**
Lovable has hardcoded HTML/JSX templates for: Dashboard, Data Table, Form Page, Auth Page, Settings Page. AI fills in the content — not the structure. This is why every Lovable app looks polished: the layout is pre-designed, AI only customizes it.

**Our path:** Build `src/templates/` with 10 pre-built page layouts per app type (CRM dashboard, POS terminal, booking calendar, etc.). Inject them into the system prompt.

**2. Job queue + polling (not SSE)**
Lovable never loses a generation. User submits → gets job ID → polls for status. Works even if user closes tab. We use SSE which dies on disconnect.

**Our path:** Build `/api/generate-job` + `/api/job/:id` polling endpoints. Frontend polls every 2s.

**3. Surgical file editing (not full regeneration)**
When you say "fix the login page," Lovable patches just that file. We regenerate the entire project (expensive, slow, loses customizations).

**Our path:** Build a diff/patch system. Store current files. When user requests changes, send only changed files to AI + instruction to return only modified files.

**4. Design system enforcement**
Lovable enforces consistent typography, spacing, color tokens across every page. AI is given strict design constraints: exact font sizes, spacing scale, color palette values.

**Our path:** Per-wizard-run design system injection. Wizard collects brand colors → these get injected as Tailwind CSS variable overrides in the system prompt.

**5. Multi-round iteration loop**
Bolt/Lovable: Generate → Preview → "Change the nav color" → AI patches nav → Preview → repeat. Each iteration is fast (seconds) because it only changes what's needed.

**Our path:** React modify mode. Detect if project already exists → use REACT_MODIFY_PROMPT → AI receives current files + change request → returns only changed files → merge.

---

## 🏗️ Technical Architecture (Current)

### Stack
- **Frontend:** Vanilla HTML/CSS/JS (builder UI) + React + Vite + Shadcn/UI (generated apps)
- **Backend:** Node.js + Express (port 3500, inside Docker container)
- **Generation:** OpenRouter → Sonnet 4.6 for React builds, any model for static sites
- **Preview:** WebContainers (StackBlitz) — full Node.js in browser
- **Deploy:** Vite build → Nginx static → kenzoagent.com subdomains
- **Database:** Supabase (Postgres) — users, projects, generations

### Key Files
- `backend/server.js` — main API (2,200+ lines)
- `backend/templates/react-base/` — 37-file React + Shadcn template
- `backend/data/architectures.json` — 10 app type architectures
- `frontend/app/build/index.html` — builder UI (~4,900 lines)
- `frontend/app/index.html` — dashboard
- `backend/start.sh` — server startup script

### Auto-restart
- Crontab: `@reboot sleep 30 && docker exec openclaw-openclaw-gateway-1 bash -c "mkdir -p /tmp/wb-builds ... nohup node server.js ..."`
- Start manually: `bash backend/start.sh`

---

## 🗺️ Roadmap: What to Build Next (Priority Order)

### Priority 1 — OUTPUT QUALITY (biggest impact)

**1.1 Job Queue Architecture**
- Why: Long prompts timeout. Users lose work. Kills trust.
- What: `/api/generate-job` + `/api/job/:id` polling. Job survives tab close.
- Effort: ~2 hours
- Impact: Unlocks complex apps (Learner V1, full CRM, booking system)

**1.2 Per-App-Type Page Templates**
- Why: Lovable's secret weapon. Pre-built layouts = consistent quality.
- What: `backend/templates/react-base/src/templates/` — Dashboard.template.jsx, DataTable.template.jsx, Form.template.jsx, Auth.template.jsx, Settings.template.jsx. AI fills data, not structure.
- Effort: ~4 hours
- Impact: Output quality jumps from 50% → 75% of Lovable

**1.3 React Modify Mode**
- Why: Users can't iterate. Every change = full regeneration.
- What: New REACT_MODIFY_PROMPT. Detects existing project. Sends changed files only.
- Effort: ~3 hours
- Impact: Makes the builder actually useful for iteration

**1.4 Design System Enforcement**
- Why: Colors/fonts drift between pages. Looks inconsistent.
- What: Inject Tailwind config with wizard colors as CSS variables. All pages use `text-primary`, `bg-card` etc.
- Effort: ~1 hour
- Impact: Visual consistency across all pages

### Priority 2 — USER EXPERIENCE

**2.1 Project Thumbnails**
- Why: Project cards look empty without previews.
- What: After generation, capture screenshot of preview iframe → save to Supabase Storage.
- Effort: ~2 hours

**2.2 File-by-File Streaming**
- Why: 60-second blank wait feels broken.
- What: Stream generated files to Monaco editor one by one as AI writes them. File tree updates in real-time.
- Effort: ~3 hours

**2.3 Loading Progress Bar**
- Why: Users don't know how long React builds take.
- What: Deterministic progress bar (0→30% generation, 30→70% npm install, 70→100% Vite compile). Based on timings, not actual progress.
- Effort: ~1 hour

### Priority 3 — FEATURE COMPLETENESS

**3.1 Auth in Generated Apps**
- Why: Every real app needs login. Lovable generates auth by default.
- What: Supabase Auth injection. Wizard asks "Add user authentication?" → yes → generates login/register/protected routes.
- Effort: ~4 hours

**3.2 Payme/Click Payment Integration**
- Why: Uzbek market differentiator. No competitor has Payme pre-built.
- What: Template for payment pages with Payme/Click SDKs. Wizard asks about payments.
- Effort: ~3 hours

**3.3 AI in Generated Apps**
- Why: Huge differentiator. Built apps can have their own AI assistant.
- What: Template includes an AI chat widget. Wizard asks "Add AI assistant?" → yes → injects OpenRouter API call.
- Effort: ~3 hours

**3.4 Multi-round Iteration UI**
- Why: Lovable's core UX — chat to modify. We have it but it regenerates everything.
- What: Conversation history per project. AI sees last 3 generations + current request.
- Effort: ~2 hours

### Priority 4 — SCALE

**4.1 Headless Postgres (Hetzner)**
- Why: Supabase free tier limits at scale. Per-app schemas take quota.
- What: Self-hosted Postgres on Hetzner for generated app data.
- Effort: ~1 day (infrastructure)

**4.2 Docker Deploy for Full-Stack Apps**
- Why: React static deploy works, but apps with custom backend logic need Docker.
- What: Wire `/api/deploy-fullstack` correctly for React apps that need server-side logic.
- Effort: ~3 hours

**4.3 Rate Limiting Per Tenant**
- Why: One heavy user can block others.
- What: Per-user generation queue. Max 1 concurrent generation per user.
- Effort: ~2 hours

---

## 💡 Uzbek Market Advantages (Our Unique Edge)

These are things Lovable/Bolt will NEVER build. Our moat:

1. **Uzbek language wizard** — detects Uzbek/Russian input, responds in user's language
2. **Nasiya (credit) tracking** — built into CRM templates by default
3. **Payme/Click payment** — native payment integrations
4. **UZS currency formatting** — POS and invoice apps use Uzbek sum by default
5. **Telegram-first** — contact fields include Telegram username, notification templates use Telegram bot
6. **Tashkent delivery zones** — restaurant templates have local zone data
7. **Multi-branch POS** — Uzbek retail often has multiple branches

---

## 📐 Design Philosophy

**What makes Lovable apps look beautiful:**
- Dark theme with subtle gradients (not flat black)
- Cards with slight border + shadow (not harsh borders)
- Muted color palette with one strong accent
- Consistent 8px spacing grid
- Inter or Geist font everywhere
- Skeleton loaders during data fetch
- Smooth transitions (150ms ease)
- Status badges with semantic colors (green=active, yellow=pending, red=error)

**Current gaps in our output:**
- No skeleton loaders (data loads → blank flash → content)
- No transitions (instant state changes feel cheap)
- Color palette inconsistency across pages
- No empty states (blank tables look broken)

**Fix:** Add these to the React system prompt as explicit requirements.

---

## 🔄 Session Log

### 2026-03-30 (Major session)
**Built:**
- Wizard feature (3-stage: App Type → Brand Strategy → Brand Identity)
- Canva-style left sidebar (hover float, click dock, 5 tabs)
- React + Shadcn/UI base template (37 files, zero Radix deps)
- React deploy endpoint (Vite build → static)
- Server-side project save on disconnect
- Double-fire bug fix
- Auto-restart via crontab
- Startup script (start.sh)
- Full Stack → direct build (no wizard for apps)
- React-specific build status messages

**Bugs fixed (13 total):**
- nginx proxy wrong IP (127.0.0.1 vs 172.18.0.2)
- Wizard build loop
- Full Stack mode overwritten by wizard mode  
- Sidebar code in wrong script scope
- JS syntax error crashed entire builder
- Filename lowercasing broke React (App.jsx → app.jsx)
- builds/ dir owned by root → server crash
- "type:module" conflicted with require()
- 30+ Radix packages froze WebContainers
- Double-fire in onDone callback
- Server crash on client disconnect (ERR_STREAM_WRITE_AFTER_END)
- React deploy calling wrong endpoint (Docker vs static)
- Systemd service trying to run inside container from host

**What still needs work:**
- Job queue architecture (long prompts)
- React modify mode
- Per-app-type page templates
- Project thumbnails
- Auth in generated apps
