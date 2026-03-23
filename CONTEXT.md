# CONTEXT.md — Website Builder

## Product
AI-powered website, web app, and Telegram bot builder. Describe in plain language → AI builds it.

## Target Audience
- Small business owners who need a website fast
- Freelancers/agencies building for clients
- Entrepreneurs launching products
- Non-technical founders (like Khumoyun himself)
- Primary market: Uzbekistan, secondary: CIS region

## Core Problem
Building websites is expensive ($500-3000 for a developer) and slow (2-4 weeks). No-code tools (Wix, Webflow) are complex and not localized for Uzbek market. No AI builder exists in Uzbek/Russian.

## Solution
Type what you want → AI builds it in seconds. Export clean code or deploy directly. Works for:
- Static websites (business cards, landing pages)
- Web applications (dashboards, portals)
- Telegram bots
- E-commerce stores

## Key Differentiators vs Bolt.new / v0 / Aura
1. **Uzbek + Russian language** — describe in native language
2. **Agent mode** — AI autonomously builds multi-file projects, fixes errors, iterates
3. **Telegram bot builder** — unique, no competitor has this
4. **Payme/Click integration templates** — pre-built payment flows for Uzbek market
5. **Deploy to kenzoagent.com** — one-click deploy (initially)
6. **No prompt limits** — flat monthly fee, unlimited generations

## Tech Stack
- Frontend: Next.js + Tailwind CSS + Monaco Editor (code view)
- AI: KAT-Coder-Pro V1 (free tier coding), MiniMax M2.5 (paid tier)
- Agent: Custom multi-step agent (plan → code → fix → deploy loop)
- Sandbox: WebContainer (browser-based) or Docker (server-side)
- Deployment: Nginx + Certbot on kenzoagent.com
- Payments: Payme, Click
- Languages: Uzbek, Russian, English

## Pricing
- Free: 5 generations/day, basic sites only
- Standard ($9/mo): Unlimited generations, web apps, custom domains
- Premium ($19/mo): Agent mode, Telegram bot builder, priority deployment

## Agent Mode (Core Differentiator)
Unlike simple code generators, the agent:
1. Plans the project structure
2. Generates all files
3. Runs in sandbox, detects errors
4. Fixes errors automatically
5. Iterates until working
6. Deploys with one click

Like Cursor's agent but for building full products, not just editing code.

## Monetization
- SaaS subscription (Payme/Click)
- Template marketplace (sell/buy templates, 0% commission initially)
- Agency plan (white-label, build for clients)
