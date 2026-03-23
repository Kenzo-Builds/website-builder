# CONTEXT.md — Website Builder

## Product
AI-powered website, web app, and Telegram bot builder. Describe in plain language → AI builds it instantly.

## Target Audience
- Small business owners who need a website fast
- Entrepreneurs launching products
- Non-technical founders
- Uzbek users who don't speak English or Russian (native language support)
- Primary market: Uzbekistan, secondary: CIS region

## Core Problem
Building websites is expensive ($500-3000 for a developer) and slow (2-4 weeks). No-code tools (Wix, Webflow) are complex and not localized for Uzbek market. No AI builder exists in Uzbek/Russian.

## Solution
Type what you want in any language → AI builds it in seconds. Export clean code or deploy directly.

## Key Differentiators vs Bolt.new / v0 / Aura
1. **Uzbek + Russian language** — describe in native language, AI understands
2. **Agent mode** — AI autonomously builds multi-file projects, fixes errors, iterates
3. **Telegram bot builder** — unique, no competitor has this
4. **Payme/Click integration templates** — pre-built payment flows for Uzbek market
5. **One-click deploy** — live on kenzoagent.com subdomain instantly
6. **Usage-based pricing** — same quality for all plans, only limits differ

## AI Model Stack (FINAL — decided 2026-03-23)

### Primary Model
- **Claude Sonnet 4.6** (`anthropic/claude-sonnet-4-6`) — best design + code quality, used for all requests

### Escalation Stack (silent, user never sees this)
- **Gemini 2.5 Pro** (`google/gemini-2.5-pro`) — design-specific failures, complex CSS/layouts
- **Claude Opus 4.6** (`anthropic/claude-opus-4-6`) — absolute last resort for complex failures, Expert plan only

### Routing Logic
```
All requests → Sonnet (primary)
  ↓ if output quality fails
Gemini 2.5 Pro (design escalation)
  ↓ if still fails + Expert plan user
Claude Opus (nuclear option)
```

### Quality Validator
Check output HTML has: <!DOCTYPE>, <body>, actual content, min 500 chars
If validation fails → escalate silently

## Pricing Tiers (FINAL — decided 2026-03-23)

| Plan | Price | Requests | Escalation |
|------|-------|----------|------------|
| Free | $0 | 15 total (lifetime) | Sonnet only |
| Starter | $5/mo | 50/mo | Sonnet only |
| Pro | $15/mo | 200/mo | Sonnet + Gemini 2.5 Pro |
| Expert | $30/mo | Unlimited | Full stack incl. Opus |

- Same quality for all plans — only usage limits differ
- Users never see which model is used
- Expert plan gets silent Opus escalation to ensure nothing ever breaks

## Cost Economics (1,000 subscribers)
- API cost: ~$485/month (all Sonnet)
- Revenue: $11,500/month
- Profit margin: **96%**

## Tech Stack (Current MVP)
- Frontend: HTML + Tailwind CSS + Monaco Editor
- Backend: Node.js Express (port 3500, PM2)
- AI: OpenRouter API (Sonnet → Gemini 2.5 Pro → Opus)
- Deployment: Nginx + Certbot, kenzoagent.com subdomains
- Deploy API: http://172.18.0.1:5000/deploy
- Builds stored: /root/.openclaw/workspace/projects/website-builder/backend/builds/
- Live URL: https://builder.kenzoagent.com

## Agent Mode (Core Differentiator — Phase 2)
Unlike simple code generators, the agent:
1. Plans the project structure
2. Generates all files
3. Validates output quality
4. Escalates model if quality insufficient
5. Deploys with one click

## Monetization
- SaaS subscription (Payme, Click)
- Template marketplace (Phase 2)
- Agency/white-label plan (Phase 3)

## Competitor
- Aura.build: 65K users, charges per prompt (10-560/mo), no Uzbek support
- Bolt.new, v0, Lovable: English only, no Uzbek/CIS market presence
