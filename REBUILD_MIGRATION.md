# Rebuild Migration Checklist
## Everything to port from vanilla builder → Next.js

### Backend (server.js → Next.js API routes)
- [ ] `/api/auth/signup` — auto-confirm Supabase signup
- [ ] `/api/usage` — monthly generation tracking
- [ ] `/api/generate-stream` — SSE generation (keep for static sites)
- [ ] `/api/generate-job` + `/api/job/:id` — async job queue + polling
- [ ] `/api/brainstorm` — discovery conversation
- [ ] `/api/wizard/start` — intent detection + language detection
- [ ] `/api/wizard/structure` — app type pages
- [ ] `/api/wizard/brand-strategy` — brand suggestions (Haiku)
- [ ] `/api/wizard/brand-identity` — colors/fonts/styles
- [ ] `/api/wizard/validate` — architecture check
- [ ] `/api/wizard/save-context` + `/api/wizard/load-context`
- [ ] `/api/deploy` — static site deploy
- [ ] `/api/deploy-react` — React Vite build + Docker deploy
- [ ] `/api/deploy-fullstack` — legacy Docker deploy
- [ ] `/api/undeploy` — undeploy (static + Docker)
- [ ] `/api/delete-project` — full cleanup
- [ ] `/api/check-subdomain` — availability check
- [ ] `/api/create-schema` + `/api/run-migration` — Supabase schema management
- [ ] `/api/schema-info` + `/api/list-tables`
- [ ] `/api/build/:buildId` — serve build preview
- [ ] `/api/transcribe` — voice transcription (OpenAI)
- [ ] `/api/react-template` — serve base template files
- [ ] `/api/admin/stats` + `/api/admin/users` + `/api/admin/containers`
- [ ] `/api/delete-account` + `/api/restore-account`
- [ ] Rate limiting (120 req/min)
- [ ] Plan limits (guest: 3, free: 5, starter: 50, pro: 200, expert: unlimited)
- [ ] Admin bypass
- [ ] Build cleanup (24h TTL, 100 cap)
- [ ] Double-fire guard in callAIStream
- [ ] Server-side project save on disconnect

### Dashboard (app/index.html → app/page.tsx)
- [ ] Auth modal (login/signup)
- [ ] Mode tabs (Landing Page / Full Stack App)
- [ ] Wizard/Build directly dropdown
- [ ] Model selector
- [ ] Prompt input with voice, attachment, send
- [ ] Recent Projects tab
- [ ] Templates tab (16 templates)
- [ ] Deployed Apps tab
- [ ] Settings pages (profile, appearance, usage, admin)
- [ ] Admin view (stats, users, containers)

### Builder (app/build/index.html → app/builder/page.tsx)
- [ ] Chat panel (messages, typing dots, markdown formatting)
- [ ] Monaco editor (file tabs, syntax highlighting)
- [ ] File tree
- [ ] Preview panel (static iframe + WebContainer iframe)
- [ ] Wizard flow (3 stages: App Type → Brand Strategy → Brand Identity)
- [ ] Wizard progress bar
- [ ] Left sidebar (5 tabs: Brand, Templates, Typography, Colors, Projects)
  - [ ] Hover = floating panel
  - [ ] Click = docked panel (replaces chat)
  - [ ] Live CSS injection into preview
- [ ] Mode gear (Landing Page / Full Stack App)
- [ ] Voice input + language toggle
- [ ] Image attachment
- [ ] Deploy modal (subdomain input, check, confirm)
- [ ] Redeploy / Undeploy buttons
- [ ] WebContainer bridge (boot, mount, npm install, npm start/dev)
- [ ] React template loading + merge
- [ ] Job queue polling with file-by-file streaming
- [ ] generateFullStack() → job queue
- [ ] generate() → SSE stream (static sites)
- [ ] brainstorm() → conversation planner
- [ ] buildFromPlan() → generate from brainstorm
- [ ] clearChat() with wizard state reset
- [ ] Project save (guest localStorage + Supabase)
- [ ] Project load from URL params / sessionStorage
- [ ] Build status messages (static vs React)
- [ ] Matrix rain background
- [ ] Carousel slides
- [ ] Guest limit modal
- [ ] Error boundary (React apps)

### Data Files
- [ ] `backend/data/architectures.json` — 10 app types
- [ ] `backend/templates/react-base/` — 37 Shadcn component files
- [ ] `backend/prompts/WIZARD_SYSTEM_PROMPT.md`
- [ ] `REACT_SYSTEM_PROMPT` (currently inline in builder HTML)
- [ ] `FULLSTACK_SYSTEM_PROMPT` (currently inline in builder HTML)
- [ ] System prompts: SYSTEM_PROMPT, MODIFY_PROMPT, DISCOVERY_PROMPT_LANDING, DISCOVERY_PROMPT_FULLSTACK

### Config / Infra
- [ ] `backend/config.json` — API keys
- [ ] `backend/supabase-config.json` — Supabase credentials
- [ ] `start.sh` — startup script
- [ ] Crontab auto-restart
- [ ] Nginx config with API proxy
- [ ] Docker deploy API integration
- [ ] Environment variables (BUILDS_DIR, DEPLOYED_BUILDS_DIR, DOCKER_APPS_DIR, PORTS_FILE)

### Supabase Tables
- [ ] profiles (id, email, full_name, plan, is_admin, deleted_at)
- [ ] projects (id, user_id, name, prompt, html, model, build_id, files, context, deployed_url, app_schema, db_user, db_password)
- [ ] generations (id, user_id, project_id, model, prompt)
- [ ] subscriptions
- [ ] deployments
- [ ] RPC functions: create_app_schema, run_app_migration, drop_app_schema, list_app_tables
