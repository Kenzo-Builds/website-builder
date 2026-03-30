# WIZARD — Complete Implementation Plan
## AI Builder Platform — Structured Onboarding + Smart Agent Framework

**Last updated:** 2026-03-30
**Status:** FINAL PLAN — Ready to build

---

## Naming & Branding

- **Name:** Wizard (not "Brainstorm")
- **Dashboard toggle:** 🧠 Wizard / ⚡ Build directly (replaces Brainstorm/Build directly)
- **Chat avatar:** Show "Wizard" name instead of "AI" in chat messages
- **Builder gear dropdown:** "Wizard Mode" replaces "Brainstorm"

---

## WHAT TRIGGERS THE WIZARD

- Dashboard: user selects "Wizard" mode → types prompt → goes to builder → Wizard starts
- "Build directly" mode → skips Wizard, generates immediately (unchanged)

---

## THE 3-STAGE WIZARD FLOW

### Stage 1: App Structure

**Step 1.1 — Intent Detection**
- Wizard reads user's prompt (in any language: Uzbek, Russian, English)
- If prompt clearly maps to an app type → show that type pre-selected
- If vague → Wizard asks: "What problem are you trying to solve for your business?"
- Fallback: show clickable app-type buttons

**Step 1.2 — App Type Selection**
Clickable cards in chat panel:
- CRM
- POS System
- Inventory Management
- Invoice / Billing
- Employee / HR
- Appointment Booking
- Restaurant Management
- Expense Tracker
- Task Manager
- Project Management
- Product Catalog
- Sales Dashboard
- Support Ticket System
- Hotel / Room Booking
- Delivery Tracking
- Other (free text input → AI generates custom architecture)

**Step 1.3 — Page Selection**
- Wizard generates all recommended pages with PRE-TICKED checkboxes
- User reviews, unticks unwanted pages
- Blank text box at bottom: "Any additional pages?"
- User approves → Stage 2

### Stage 2: Brand Strategy *(skippable)*

- Skip button + message: "You may not need this for a simple system — but some elements can improve your app"
- Elements presented one by one:
  1. Mission & Vision — AI suggestion in greyed box + blank override input
  2. Brand Values — AI suggests 3-4 values as clickable chips + blank input
  3. Brand Personality — AI suggests 3 personality options as buttons + blank input
  4. Brand Tone & Voice — AI suggests 3 tone options (formal/friendly/minimal) + blank input
  5. Key Messaging Pillars — AI suggestion + blank input
- User can select AI suggestions OR type their own for any element
- "Approve & Continue" button at bottom

### Stage 3: Brand Identity *(skippable)*

- Based on Stage 2 choices
- Skip button + message: same as Stage 2
- Elements:
  1. Color Palette — 5 preset combos (primary/secondary/accent shown as color blocks) + custom hex input
  2. Typography — 3 font pairing options (heading + body previewed) + browse more
  3. Style — 3 options: Clean & Minimal / Bold & Modern / Professional & Corporate
  4. Tagline & Slogan — AI generates 3 options + blank input
- User selects or types their own
- "Build it →" button

### Then: AI builds using ALL collected data as the structured brief

---

## PROGRESS INDICATOR

Step dots at top of chat: ① App Type → ② Structure → ③ Brand Strategy → ④ Identity → ⑤ Building

---

## 8 INTELLIGENCE LAYERS

### Layer 1: Multilingual Understanding (cost: $0)
- System prompt: "User may type in Uzbek, Russian, or English. Understand all three. Respond in the user's language. Translate internally to English for architecture decisions."
- Implementation: prompt instruction only

### Layer 2: Intent Detection + Course Correction (cost: $0)
- Runs continuously throughout all stages via system prompt
- Detects:
  - Vague input → asks targeted question
  - Contradiction (wants simple but selects 15 pages) → flags it
  - Wrong app type (describes POS but selects CRM) → suggests correction
  - User lost/confused → enters discovery: "Tell me about your business. What takes the most time?"
- Implementation: system prompt instructions

### Layer 3: Context-Aware Suggestions (cost: $0)
- Wizard knows: app type + target market (Uzbekistan) + user's language
- Suggests what works locally, not generically
- CRM → includes Telegram field, nasiya tracking, SMS reminders
- POS → cash reconciliation, UZS formatting, multi-branch
- Restaurant → Telegram ordering, Tashkent delivery zones
- Implementation: hardcoded knowledge blocks per app type in system prompt

### Layer 4: Template Intelligence (cost: ~$0.003)
- Only fires for "Other" app type
- Sends user's description to LLM → outputs closest architecture JSON
- LLM decides pages, schema, features for non-standard apps
- Standard app types use hardcoded architectures (no LLM cost)

### Layer 5: Post-Build Self-Review (cost: ~$0.01)
- After main generation completes, one Sonnet call reviews the output:
  - Navigation consistent across all pages?
  - All API routes have matching frontend fetch calls?
  - Schema.sql matches tables referenced in code?
  - All CRUD operations complete (create, read, update, delete)?
  - Styles consistent (same color scheme, fonts on every page)?
  - Mobile responsive?
- If issues found → generates fix instructions → patches applied automatically
- User never sees the review — just gets better code

### Layer 6: Architecture Validator (cost: ~$0.002)
- Before building (after wizard collects all info)
- Validates:
  - Schema has proper relationships (foreign keys, no orphan tables)
  - Missing pages that app type normally needs?
  - Data model sufficient for selected features?
- If issues → Wizard suggests fixes before building
- Implementation: one Haiku call with checklist

### Layer 7: Smart Defaults from Industry Knowledge (cost: $0)
- Per app type, hardcoded knowledge blocks:
  - CRM (Uzbekistan): Telegram contact field, nasiya/credit, SMS, Payme/Click
  - POS (Uzbekistan): cash reconciliation, UZS, multi-branch
  - Restaurant (Uzbekistan): Telegram bot ordering, delivery zones
  - Invoice: auto-calculate totals, tax fields, PDF export
  - Booking: time slot conflicts, SMS reminders
- Implementation: JSON knowledge files, loaded per app type

### Layer 8: Past Project Learning (cost: $0)
- For returning users: checks previous projects in Supabase
- "Want me to use the same brand colors and style as your CRM?"
- Implementation: one Supabase query on wizard start

---

## PROJECT CONTEXT MEMORY

### Storage
- `projects.context` column (JSON) in Supabase
- Created during wizard, updated on any edit

### Structure
```json
{
  "app_type": "CRM",
  "pages": ["Dashboard", "Contacts", "Deals", "Tasks"],
  "brand": {
    "mission": "Help small businesses manage clients better",
    "values": ["simplicity", "reliability"],
    "personality": "professional but approachable",
    "tone": "direct, clear, no jargon",
    "messaging_pillars": ["Organize your clients", "Never miss a follow-up"],
    "colors": { "primary": "#3B82F6", "secondary": "#1E40AF", "accent": "#FBBF24" },
    "typography": { "heading": "Inter", "body": "Inter" },
    "style": "clean_minimal",
    "tagline": "Your clients, organized."
  },
  "language": "uz",
  "industry_context": "phone_store_uzbekistan"
}
```

### Injection
- On every project open → context loaded from Supabase
- Injected into system prompt for all AI calls on that project
- All edits (sidebar or chat) update this JSON

### Editing via sidebar
- Colors tab → updates `brand.colors`
- Texts tab → updates `brand.typography`
- Both reflect as live preview on current page only

### Editing via chat
- User types: "Change brand personality to X"
- AI reads context → understands what to change
- AI confirms: "Update brand personality to X — confirm?"
- User confirms → context updated

---

## CANVA-STYLE LEFT SIDEBAR

### Behavior
- Collapsed by default (narrow icon strip, ~48px)
- Hover: floating panel opens (~280px), closes when cursor leaves
- Click: panel opens and replaces chat panel. Chat returns when sidebar closes.
- Slides OVER preview, doesn't push it

### 5 Tabs

**1. Brand**
- Shows current brand strategy + identity from project context
- Each element editable
- Changes update context + live preview

**2. Templates**
- All template categories
- Select one → Wizard injects full architecture + brand from template
- User can then customize

**3. Texts**
- Current brand typography shown at top
- Font/typeface options below (heading, subheading, body)
- Select → live preview on CURRENT PAGE ONLY (testing)

**4. Colors**
- Current brand colors at top (primary/secondary/accent)
- Color picker + preset combos below
- Select → live preview on CURRENT PAGE ONLY (testing)

**5. Projects**
- All user's projects listed
- Click to open → auto-saves current project first
- Resumes from where user left off

---

## HARDCODED APP ARCHITECTURES (Top 10)

| App Type | Default Pages | Default Schema | Key Features |
|---|---|---|---|
| CRM | Dashboard, Contacts, Deals, Tasks | contacts, deals, tasks | Pipeline, follow-ups, Telegram field |
| POS | Sales Terminal, Products, Receipts, Reports | products, sales, sale_items | Barcode scan, cash reconcile, UZS |
| Inventory | Dashboard, Products, Stock, Suppliers | products, stock_movements, suppliers | Low stock alerts, reorder |
| Invoice/Billing | Invoices, Clients, Products, Reports | invoices, invoice_items, clients | Auto-calc, PDF export |
| Booking | Calendar, Services, Clients, Staff | appointments, services, staff, clients | Time slots, conflict check |
| Restaurant | Menu, Orders, Tables, Kitchen View | menu_items, orders, order_items, tables | Order status, kitchen display |
| Task Manager | Dashboard, Tasks, Projects | tasks, projects, labels | Kanban, due dates, priority |
| Expense Tracker | Dashboard, Expenses, Categories, Reports | expenses, categories | Monthly summary, filters |
| HR/Employee | Employees, Attendance, Leave, Payroll | employees, attendance, leave_requests | Leave tracking, reports |
| Sales Dashboard | Overview, Leads, Pipeline, Activities | leads, opportunities, activities | Forecast, conversion rate |

---

## BUILD ORDER (implementation sequence)

### Phase 1: Backend Foundation (Session 1)
1. Add `context` JSON column to `projects` table in Supabase
2. Create `architectures.json` — all 10 app type architectures
3. Create `WIZARD_PROMPT.md` — system prompt with all 8 intelligence layers
4. Add `/api/wizard/start` endpoint — returns app type cards
5. Add `/api/wizard/structure` endpoint — returns pages for selected type
6. Add `/api/wizard/brand-strategy` endpoint — generates brand suggestions
7. Add `/api/wizard/brand-identity` endpoint — generates identity from strategy
8. Add `/api/wizard/validate` endpoint — architecture validator (Layer 6)
9. Add post-build review to `/api/generate-stream` — Layer 5 self-review
10. Save/load project context on all operations

### Phase 2: Frontend — Wizard Flow (Session 2)
1. Rename "Brainstorm" → "Wizard" everywhere (dashboard + builder)
2. Rename AI avatar to "Wizard" in chat messages
3. Build chat component renderers:
   - Card grid (app type selection)
   - Checkbox list (page selection)
   - Button options (brand personality, tone, style)
   - Color picker blocks (brand colors)
   - Font preview blocks (typography)
   - Text suggestion + override input
4. Wire wizard stages: state machine in JS
5. Progress indicator dots at top
6. "Skip" buttons on Stage 2 + 3 with contextual message
7. "Build it →" final button

### Phase 3: Frontend — Left Sidebar (Session 3)
1. Build collapsed sidebar strip (icons only, 48px)
2. Build hover behavior (floating panel, 280px)
3. Build click behavior (replaces chat panel)
4. Brand tab — display + edit context
5. Templates tab — load + inject
6. Texts tab — font picker + live preview
7. Colors tab — color picker + live preview
8. Projects tab — list + switch + auto-save

### Phase 4: Polish + Testing (Session 4)
1. Test all 10 app types end-to-end
2. Test Uzbek language input
3. Test wizard → build → deploy → data persists
4. Test sidebar edits → context update → regenerate
5. Test project switching
6. Fix edge cases
7. Post-build review loop testing

---

## COST SUMMARY

| Per wizard run | Cost |
|---|---|
| Layers 1-3, 7-8 (prompts + hardcoded) | $0.000 |
| Layer 4 (template intelligence, "Other" only) | $0.003 |
| Layer 5 (post-build Sonnet review) | $0.010 |
| Layer 6 (architecture validator) | $0.002 |
| **Total per wizard run** | **~$0.015** |

At 1,000 wizard runs/month: ~$15 total cost. Negligible.

---

## WHAT THIS FRAMEWORK CAN BUILD

**Strong (80% of users):** 5-15 page CRUD apps with 3-8 database tables
- CRM, POS, Inventory, Booking, Dashboard, Task Manager, Expense Tracker

**Possible with limitations:**
- File uploads, real-time features, email sending, complex calculations

**Cannot build:**
- Mobile apps, payment processing, complex auth (roles/teams), third-party API integrations

**Ceiling expansion roadmap:**
- 3 months: payment templates, file upload, Telegram bot modules
- 6 months: React frontend option, role-based auth
- 12 months: Multi-round AI iteration (build → test → fix → deliver v2)
