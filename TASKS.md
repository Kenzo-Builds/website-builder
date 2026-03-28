# TASKS.md — Website Builder

## ✅ Done
- [x] MVP backend API (Node.js Express, port 3500, PM2)
- [x] MVP frontend (split-screen chat + Monaco editor + iframe preview)
- [x] Deployed at https://builder.kenzoagent.com
- [x] OpenRouter integration (key: sk-or-v1-b50647...)
- [x] Model research: confirmed Sonnet → Gemini 2.5 Pro → Opus stack
- [x] Pricing tiers decided: Free/$5/$15/$30
- [x] Cost analysis: 96% margin at 1,000 subscribers
- [x] GitHub repo: https://github.com/Kenzo-Builds/website-builder
- [x] Nginx proxy fix: /api/ block duplicate resolved

## 🔄 In Progress
- [ ] Fix model in backend: switch to Claude Sonnet as primary
- [ ] Build silent escalation system (Sonnet → Gemini 2.5 Pro → Opus)
- [ ] Build quality validator (HTML checker before escalation)

## 📋 Next Up
- [ ] Add user authentication (simple JWT or session-based)
- [ ] Add request counter per user (enforce plan limits)
- [ ] Add plan tiers to backend (Free=15, Starter=50, Pro=200, Expert=unlimited)
- [ ] Build Uzbek language support (test prompts in Uzbek)
- [ ] Add streaming responses (show HTML appearing live as it generates)
- [ ] Payme/Click payment integration
- [ ] Template library (pre-built starting points)
- [ ] Telegram bot builder feature
- [ ] Agent mode (multi-step: plan → code → validate → fix → deploy)

## 💡 Future
- [ ] WebContainer sandbox (run code in browser like Bolt.new)
- [ ] Custom domain support
- [ ] Template marketplace
- [ ] White-label/agency plan
- [ ] Mobile app (Phase 3)

## 🧠 Model Routing — Research (2026-03-26)
Models to evaluate for multi-tier routing:

| Model | Tier | Best For |
|-------|------|----------|
| GPT-5.4 Nano | Ultra-cheap | Brainstorm replies, quick edits, chat |
| GPT-5.4 Mini | Budget code | Simple sites, modifications, fast iterations |
| Gemini 3.1 Flash Lite | Bulk processing | Transcript cleaning, text processing |
| Gemini 2.5 Flash | Fast generation | Quick prototypes, simple pages |
| Gemini 3 Flash Preview | Mid-tier code | Good quality sites, balanced cost |
| GPT-5.4 | Premium code | Complex sites, multi-page apps |
| Minimax M2.7 | TBD | Evaluate — Chinese model, unknown code quality |
| Xiaomi MiMo-V2-Pro | TBD | Evaluate — reasoning model, math/code focused |

**Routing strategy to discuss:** Nano for chat → Mini for simple builds → Flash for standard → GPT-5.4/Sonnet for premium
