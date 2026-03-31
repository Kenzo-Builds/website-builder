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

---

## ⚡ Next Session — Start Here

Pull up this file, pick the top item from Priority 1, and build it. Don't plan, just build.

**Order to tackle:**
1. Job Queue Architecture — unlocks long prompts (Learner V1, full apps)
2. Per-App-Type Page Templates — biggest output quality jump
3. React Modify Mode — makes iteration actually work
4. Project Thumbnails — makes the dashboard look professional
5. Loading Progress Bar — stops users from thinking it's frozen

After those 5 are done, we're at ~75-80% of Lovable. The remaining 20% is auth, payments, AI-in-apps — all separate features that can be added incrementally.

---

## 🔧 Job Queue Architecture — Implementation Plan

**Why:** SSE dies when browser disconnects. Long prompts (5-8 min) always fail. Users lose work.

**How Lovable does it:**
1. User submits → gets `{jobId}` back immediately (<1s)
2. Backend queues job, generates in background
3. Frontend polls `/api/job/{id}` every 2-3s
4. Job survives tab close/refresh/network drop
5. User comes back 5 min later — app is ready

**What to build:**

Backend:
- `POST /api/generate-job` — accepts prompt, returns `{jobId}` immediately, starts async generation
- In-memory job store: `{ jobId: { status, progress, files, error, userId } }`
- `GET /api/job/:id` — returns status + files when done
- Job cleanup: delete jobs older than 24h

Frontend:
- `generateFullStack()` calls `/api/generate-job` → gets jobId
- Polls `/api/job/:id` every 2s
- Shows server-side progress messages ("Generating App.jsx... [3/8 files]")
- On done: downloads all files, boots WebContainer

**Bonus — file-by-file streaming to Monaco:**
- As each file is generated, job store updates with partial files
- Polling picks up new files → adds to Monaco file tree in real-time
- User sees code appearing live (Lovable's "watching it build" effect)

**Effort:** ~150 lines backend + ~50 lines frontend. ~3 hours total.

---

## 🏗️ DEFINITIVE ARCHITECTURE — Opus Analysis (2026-03-31)

### Why This Specific Architecture

#### Why Next.js 14 (not plain React, not Remix, not Vue)

**Rejected: Plain React (CRA/Vite)**
- No server-side rendering. Dashboard loads slow on mobile (Uzbek users often on 3G/4G).
- No API routes — need separate Express server (what we have now = 2 processes to manage).
- No file-based routing — everything in one file (what we have now = 5,000 line monolith).

**Rejected: Remix (what Bolt uses)**
- Bolt chose Remix because StackBlitz built it. They literally own the framework.
- Remix is great but has smaller ecosystem than Next.js. Fewer tutorials, fewer components, fewer developers who know it.
- For Uzbek developer market, Next.js is the most recognizable React framework.

**Rejected: Vue/Nuxt**
- Shadcn/UI doesn't exist for Vue (there's a port but it's not as polished).
- AI models generate better React code than Vue — more training data.
- Our generated apps are React — dogfooding means builder should be React too.

**Chosen: Next.js 14 App Router**
- Server components = dashboard loads instantly (SSR).
- Client components = builder is fully interactive (CSR).
- API routes = no separate Express server. One deployment.
- File-based routing = `app/builder/page.tsx` instead of 5,000 lines in one file.
- Vercel deployment = git push → live. Zero nginx config.
- Largest React framework ecosystem. Most developers know it.

#### Why Zustand (not Redux, not Context, not Jotai)

**Rejected: Redux**
- 200 lines of boilerplate for one store. Overkill for our use case.
- Actions, reducers, middleware — complexity we don't need.

**Rejected: React Context**
- Re-renders entire tree when any value changes. Performance killer for editor + preview.
- No devtools, no persistence, no middleware.

**Rejected: Jotai/Recoil**
- Atomic state = good for forms, bad for complex objects (project files, wizard context).
- Less intuitive for a team to pick up.

**Chosen: Zustand**
- 2KB bundle. Zero boilerplate.
- `const useProject = create((set) => ({ files: {}, setFiles: (f) => set({ files: f }) }))` — done.
- Supports persistence (localStorage), devtools, middleware.
- Doesn't cause unnecessary re-renders (selector-based).
- 3 stores cover everything: `useProjectStore`, `useWizardStore`, `useAuthStore`.

#### Why Hybrid Update (Full Rewrite + Diff) — not just one

**Rejected: Full rewrite only (what Lovable does)**
- Works for first generation. Terrible for edits.
- "Change sidebar color" takes 60 seconds and regenerates 10 files.
- User's manual code edits get overwritten.
- Costs 10x more tokens per edit.

**Rejected: Diff only (what Bolt does)**
- Diffs can drift — after 5-6 edits, accumulated patches create inconsistencies.
- AI has to understand the ENTIRE codebase to generate a correct diff.
- If one diff is wrong, subsequent diffs compound the error.

**Chosen: Hybrid**
- First generation = full rewrite (like Lovable). Clean, consistent, no drift.
- Follow-up edits = diff mode (like Bolt). Fast, cheap, preserves user's changes.
- After 5+ diffs, offer "Clean rebuild" — full rewrite that incorporates all changes. Resets drift.
- Best of both worlds. No competitor does this.

#### Why Job Queue + Polling (not SSE, not WebSockets)

**Rejected: SSE (Server-Sent Events) — what we had before**
- Dies when browser tab closes. Long prompts (5+ min) always fail.
- Browser has 6-connection limit per domain. SSE holds one permanently.
- No way to resume a disconnected stream.

**Rejected: WebSockets**
- Overkill for one-way data (server → client).
- Requires sticky sessions for load balancing.
- More complex server code for no real benefit over polling.

**Chosen: Job queue + 2-second polling**
- Job starts → returns jobId in <100ms.
- Frontend polls every 2s → gets status, progress, partial files.
- Tab closes → job keeps running. Come back later → it's done.
- Simple to implement, debug, and scale.
- Works behind any proxy/CDN (no WebSocket upgrade needed).

#### Why Claude Sonnet 4.6 (not GPT-5, not Gemini, not open source)

**Rejected: GPT-5.3 Codex**
- Doesn't follow structured React+Shadcn instructions reliably.
- Often ignores "DO NOT generate these files" rules.
- Wraps code in markdown fences even when told not to.

**Rejected: Gemini 2.5 Pro**
- Good for analysis, poor for code generation consistency.
- Output format varies between calls — hard to parse reliably.

**Rejected: Open source (Llama, DeepSeek, Qwen)**
- Not good enough for React component generation at this quality level.
- Would need fine-tuning on Shadcn patterns — months of work.

**Chosen: Claude Sonnet 4.6**
- Best code generation model for structured React output.
- Follows system prompt instructions precisely.
- Consistent output format across calls.
- What Lovable and Bolt both use (they chose Claude too — for the same reasons).
- Cost: ~$0.03 per generation. Acceptable for the quality.

#### Why Per-App-Type Templates (the highest-leverage feature we haven't built)

This is the single most important thing missing. Here's why:

Without templates: AI receives "Build a CRM" → guesses what a CRM dashboard looks like → inconsistent results. Sometimes great, sometimes terrible.

With templates: AI receives "Build a CRM" + pre-built Dashboard layout (4 KPI cards, pipeline chart, activity feed, with exact Shadcn component code) → fills in the data → consistent quality every time.

This is what Lovable does internally. They have ~20 pre-built page layouts:
1. Dashboard (KPI cards + charts)
2. Data table (search + filter + CRUD)
3. Kanban board (drag-drop columns)
4. Form page (validation + submit)
5. Detail page (tabs + info cards)
6. Settings page (sections + toggles)
7. Auth pages (login + register)
8. Calendar view (events + slots)
9. Chat/messaging layout
10. Landing/marketing page

Each template is ~100 lines of JSX that the AI fills with app-specific data. The template handles layout, spacing, responsiveness, animations. AI only decides what content goes where.

This is our Phase 1 priority.

#### Why Uzbek Market Features Are Our Moat

Lovable will never build nasiya credit tracking. Bolt will never add Payme payment integration. No global competitor will optimize for UZS currency formatting or Telegram-first contact fields.

These are small features (10 lines of code each) but they make the output feel native to Uzbek businesses. A POS that formats prices as "150,000 UZS" instead of "$150.00" instantly feels like a product built for them.

The wizard's Uzbek context injection (already built) + per-app-type templates with Uzbek defaults = a product that global competitors cannot replicate without dedicating resources to a market they don't care about.

### Competitor Architecture Summary

| Aspect | Bolt.new | Lovable.dev | Kenzo (Target) |
|---|---|---|---|
| Frontend framework | Remix | React (custom) | Next.js 14 |
| AI model | Claude 3.5 Sonnet | Claude | Claude Sonnet 4.6 |
| Runtime | WebContainers (own tech) | Cloud sandboxes | WebContainers |
| Update method | Diff/patch | Full rewrite | Hybrid (both) |
| State management | Unknown (likely Zustand) | Unknown | Zustand |
| Deploy target | Netlify/Vercel/Cloudflare | GitHub → Vercel | Docker → kenzoagent.com |
| Database | User-provided | Supabase | Supabase |
| Auth | None built-in | Supabase Auth | Supabase Auth |
| Unique edge | Speed (diffs) | Design quality | Uzbek market + Wizard |

### File Structure (Target)

```
kenzo-builder/
├── app/
│   ├── page.tsx                     # Dashboard
│   ├── layout.tsx                   # Root layout + auth provider
│   ├── builder/
│   │   ├── page.tsx                 # Builder (main workspace)
│   │   └── components/
│   │       ├── ChatPanel.tsx        # AI chat interface
│   │       ├── PreviewPanel.tsx     # Live preview iframe
│   │       ├── EditorPanel.tsx      # Monaco code editor
│   │       ├── FileTree.tsx         # Project file navigator
│   │       ├── WizardFlow.tsx       # 3-stage wizard
│   │       ├── LeftSidebar.tsx      # Brand/Templates/Colors/Fonts/Projects
│   │       └── DeployModal.tsx      # Deploy dialog
│   ├── admin/
│   │   └── page.tsx                 # Admin dashboard
│   ├── settings/
│   │   └── page.tsx                 # User settings
│   └── api/
│       ├── generate-job/route.ts    # Async job creation
│       ├── job/[id]/route.ts        # Job polling
│       ├── wizard/
│       │   ├── start/route.ts       # Intent detection
│       │   ├── structure/route.ts   # App architecture
│       │   ├── brand/route.ts       # Brand strategy
│       │   └── identity/route.ts    # Brand identity
│       ├── deploy/
│       │   ├── react/route.ts       # React app deploy
│       │   └── static/route.ts      # Static site deploy
│       ├── brainstorm/route.ts      # Discovery chat
│       └── auth/
│           └── signup/route.ts      # Auto-confirm signup
├── components/
│   ├── ui/                          # Shadcn components (same as user template)
│   └── shared/                      # Shared components (header, nav, etc.)
├── stores/
│   ├── project.ts                   # Current project state
│   ├── wizard.ts                    # Wizard stages + context
│   └── auth.ts                      # User + session
├── lib/
│   ├── supabase/
│   │   ├── client.ts                # Browser client
│   │   └── server.ts                # Server client (API routes)
│   ├── ai/
│   │   ├── generate.ts              # AI generation logic
│   │   ├── diff.ts                  # Diff/patch engine
│   │   └── prompts/                 # System prompts per app type
│   ├── webcontainer.ts              # WebContainer bridge
│   └── templates/
│       ├── react-base/              # 37-file Shadcn template
│       └── page-templates/          # Per-app-type page layouts
├── public/
│   └── templates/                   # Served to WebContainer
└── middleware.ts                     # Auth middleware
```

This is the architecture. Don't build it now — ship features in the current builder, get users, then rebuild when revenue justifies it.
