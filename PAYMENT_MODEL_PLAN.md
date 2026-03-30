# Payment Model Planning
## AI Builder Platform — Pricing, Tiers, Revenue Strategy

**Session date:** 2026-03-29
**Status:** Planning phase — needs full discussion session before implementation

---

## Who We're Charging

**Target user: Builders (B2B2B model)**
- Non-technical people, creative, idea-driven
- They build apps FOR clients (small businesses)
- They charge their clients $50-200/mo for the app
- We charge the builder for using the platform
- Builder = our customer. Their client's business = end user of deployed app

**NOT charging:** End users of deployed apps (the business owners using the CRM/POS etc.)

---

## Current Thinking — Tier Structure

### Subscription Tiers
| Tier | Price | Deployed Apps | Generations/mo | Notes |
|---|---|---|---|---|
| Free | $0 | 0 | 5 | Testing only, no deploy |
| Starter | $19/mo | 3 | 20 | Solo freelancer starting out |
| Pro | $49/mo | 10 | 100 | Active builder with clients |
| Expert | $99/mo | 30 | unlimited | Power user, agency-level |

### Per-App Monthly Fee (on top of subscription)
- $4-5 per deployed app per month
- Charged to the builder, not the end user
- Scales with builder's success — more clients = more revenue for us

### Revenue Example
- Power user with 20 deployed apps:
  - Expert plan: $99/mo
  - App fees: 20 × $5 = $100/mo
  - Total: ~$199/mo from one power user
- 100 power users = ~$20K MRR

---

## Open Questions (to discuss in planning session)

### 1. Token/Generation Costs
- Each generation uses AI tokens (OpenRouter API cost)
- Claude Sonnet: ~$3-15 per 1M tokens
- Average full-stack app generation: ~5,000-15,000 tokens
- Cost per generation: ~$0.05-0.15
- At 100 generations/mo (Pro plan): ~$5-15 cost to us
- Pro plan charges $49 → margin is healthy even at high usage

**Question:** Do we need overage pricing or just hard limits?

### 2. Heavy Expert Users
- Expert plan = unlimited generations
- Risk: one user burns 1,000 generations/mo = ~$50-150 cost to us
- At $99/mo subscription, this could be a loss
- **Options:**
  - Cap "unlimited" at 500/mo with overage at $0.20/generation
  - Add AI credits system — buy credits, spend per generation
  - Keep unlimited but throttle after 300 (slow queue priority)

### 3. Per-App Fee Collection
- How to collect: Payme / Click (Uzbekistan) + Stripe (international)
- When to charge: monthly on deploy anniversary OR 1st of each month
- What if builder doesn't pay: suspend app (shows "payment required" page)
- Grace period: 3-5 days before suspension

### 4. Free Tier Strategy
- 5 generations, no deployment = enough to see the platform works
- Convert to paid when they want to deploy
- No credit card required for free tier

### 5. Annual Pricing
- 2 months free on annual (standard SaaS practice)
- Starter: $190/yr ($15.8/mo)
- Pro: $470/yr ($39/mo)
- Expert: $950/yr ($79/mo)

---

## Revenue Streams (current + future)

### Stream 1: Subscriptions (primary)
Recurring monthly/annual from builders. Most predictable revenue.

### Stream 2: Per-App Fees (scales with usage)
$4-5/app/mo. Grows automatically as builders add clients.

### Stream 3: AI Credits (future)
When AI injection is added to deployed apps — builders buy credits, spend per AI request from their app. Platform marks up API cost 3-5x.

### Stream 4: Marketplace (future)
Commission on projects matched through marketplace. 10-15% of project value.

### Stream 5: White Label (future — Expert tier add-on)
Builder removes "Built with AI Builder" branding. Custom domain support. +$29/mo add-on.

---

## Uzbekistan Market Considerations

- Primary payment: Payme, Click
- Price sensitivity: $19/mo might feel expensive early on — consider $9/mo intro tier
- Alternative: free + per-app only (no subscription) — simpler for first 100 users
- UZS pricing: show prices in UZS as well as USD

**Possible launch pricing (simplified for Uzbekistan):**
- Free: 5 generations, no deploy
- Basic: 50,000 UZS/mo (~$4) — 1 app, 20 generations
- Pro: 150,000 UZS/mo (~$12) — 5 apps, 100 generations
- Expert: 350,000 UZS/mo (~$28) — unlimited apps, unlimited generations
- Per-app fee: 25,000 UZS/mo (~$2) per deployed app

*Note: These are lower than the global pricing — consider separate pricing pages for UZ vs international*

---

## Implementation Order

1. **Plan first** (this session) — finalize tier names, prices, limits
2. **Add plan enforcement** to server.js (already partially done — PLAN_LIMITS exists)
3. **Build payment UI** in builder dashboard (plan selection, billing page)
4. **Integrate Payme** (Uzbekistan)
5. **Integrate Stripe** (international)
6. **Per-app billing** (more complex — requires subscription management)

---

## What's Already Built

- `PLAN_LIMITS` in server.js: `{ free: 5, starter: 20, pro: 100, expert: Infinity }`
- Plan stored on `profiles.plan` in Supabase
- Usage tracked in `generations` table
- Admin can change plan manually from Admin View
- Monthly usage counter working

**What's missing:**
- Payment integration (Payme/Stripe)
- Billing page in dashboard
- Plan upgrade/downgrade flow
- Per-app fee tracking and billing
- Suspension logic for non-payment

---

## Notes & Decisions (to fill in during planning session)

- [ ] Finalize tier names
- [ ] Finalize prices (global vs Uzbekistan)
- [ ] Decide on overage strategy for Expert unlimited
- [ ] Decide on annual discount
- [ ] Decide on per-app fee amount ($4 or $5)
- [ ] Decide on Uzbekistan-specific pricing
- [ ] Marketplace commission rate
- [ ] White label pricing
