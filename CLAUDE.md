# CLAUDE.md — AI Builder V1 (Reference Only)

**Status:** Production. DO NOT MODIFY. This is the reference codebase for V2.
**Live URL:** https://builder.kenzoagent.com
**V2 active repo:** `../Website-builder-v2/`

---

## What This Is

V1 of the AI app builder. Express.js backend + vanilla JS frontend. Runs on Node.js with WebContainers for preview.

**Do not build features here. Read it, port to V2.**

---

## Key Files To Read (in order)

| File | Why it matters |
|---|---|
| `BUILDER_STRATEGY.md` | Full product strategy, competitive analysis vs Lovable/Bolt |
| `PLATFORM_ARCHITECTURE_FULL.md` | Three-pillar architecture (WebContainers + Supabase + Docker) |
| `backend/prompts/` | All AI system prompts — port these to V2 |
| `backend/templates/react-base/` | 31-file Shadcn component library (already ported to V2) |
| `backend/data/architectures.json` | 10 app types with Uzbek context (NOT yet ported to V2) |
| `backend/server.js` | V1 generation logic — reference for V2 API routes |
| `REBUILD_MIGRATION.md` | Original migration plan |

---

## Backend Prompts (Port These to V2)

Located in `backend/prompts/`:
- `REACT_SYSTEM_PROMPT` — main generation prompt (V2 has its own version)
- `REACT_MODIFY_PROMPT` — **diff/patch edit mode** (NOT YET in V2 — Phase 2 priority)
- `WIZARD_SYSTEM_PROMPT` — wizard flow prompt (NOT YET in V2)
- `DISCOVERY_PROMPT` — brainstorm conversation (NOT YET in V2)
- `FULLSTACK_SYSTEM_PROMPT` — fullstack with backend (NOT YET in V2)

---

## V1 Stack (for reference)

- **Backend:** Node.js + Express
- **Frontend:** Vanilla JS (no framework)
- **AI:** Claude Sonnet via OpenRouter
- **Preview:** WebContainers
- **Auth:** Supabase
- **Deploy:** Docker containers per app, nginx routing
- **DB:** Supabase (same instance V2 uses)

---

## What V2 Improves

| Feature | V1 | V2 |
|---|---|---|
| Frontend framework | Vanilla JS | Next.js 15 + React |
| Code editor | Custom textarea | Monaco Editor |
| State management | DOM manipulation | Zustand |
| Auth | Server-side sessions | Supabase SSR |
| Job queue | SSE stream | Polling (survives disconnect) |
| TypeScript | ❌ | ✅ |
| Component quality | 40% | 80% (Shadcn template) |
