# AI Builder — Brand Guide

*Last updated: 2026-03-26*

---

## Brand Personality

- **Simple** — design does the talking, no clutter
- **Classic** — timeless, not trendy
- **Futuristic** — cutting-edge but approachable
- **Confident** — "If you can imagine it, you can build it."
- **Human** — warm dark tones, not cold tech

---

## Color Palette

### Primary

| Role | Hex | Usage |
|---|---|---|
| Background | `#09090B` | Page backgrounds, main surfaces |
| Surface | `#0F0F12` | Cards, elevated elements |
| Accent | `#00E5FF` | Borders, glows, hover states, active indicators — **trim only, never fills** |
| Text Primary | `#FAFAFA` | Headings, important text |
| Text Secondary | `#A1A1AA` | Body text, descriptions |
| Text Muted | `#71717A` | Subtle labels, hints |
| Text Faint | `#52525B` | Placeholders, timestamps |
| Border | `rgba(255,255,255,0.07)` | Card borders, dividers |

### Accent Rules

- Cyan `#00E5FF` is **trim only** — borders, glows, hover effects, text links
- **Never** use cyan as button fill or card background
- Buttons are **transparent with cyan border** or **plain text**
- White fills are avoided — buttons are borderless or outlined
- On hover: subtle cyan glow + lift, not color change

---

## Typography

### Fonts

| Font | Usage | Weights |
|---|---|---|
| **Montserrat** | Hero headline, section titles | 200 (Light), 300 |
| **Inter** | Everything else — body, nav, buttons, labels, forms | 400, 500, 600, 700, 800 |

### Heading Style

- Montserrat Light (200) for large headings
- Tight letter-spacing: `-1px` to `-1.5px`
- **Shimmer effect** on key word (cyan gradient animation)
- Max size: `clamp(42px, 6.5vw, 84px)` for hero

### Body Style

- Inter 400 for body, 500 for nav links, 600-700 for labels
- Line height: 1.6-1.75
- Color hierarchy: `#FAFAFA` → `#A1A1AA` → `#71717A` → `#52525B`

---

## Components

### Cards (Glassmorphism)

```css
background: rgba(255,255,255,0.03);
backdrop-filter: blur(20px);
border: 1px solid rgba(255,255,255,0.07);
border-radius: 20px;
```

- On hover: `border-color: rgba(0,229,255,0.3)` + subtle `box-shadow` cyan glow + `translateY(-4px)`
- No background color change on hover
- Padding: 24-32px

### Buttons

**Primary CTA:**
```css
background: transparent;
border: 1px solid rgba(0,229,255,0.35);
color: #00E5FF;
border-radius: 10px;
```
Hover: `background: rgba(0,229,255,0.06)` + border brightens

**Secondary/Ghost:**
```css
background: transparent;
border: 1px solid rgba(255,255,255,0.1);
color: #71717A;
```

**Nav links:** Plain text, no borders, no backgrounds. Color change on hover only.

### Modals

```css
background: #111113;
border: 1px solid rgba(255,255,255,0.1);
border-radius: 24px;
backdrop-filter: blur(8px);
```

### Inputs

```css
background: rgba(255,255,255,0.03);
border: 1px solid rgba(255,255,255,0.08);
border-radius: 12px;
```
Focus: `border-color: rgba(0,229,255,0.4)` + `box-shadow: 0 0 0 3px rgba(0,229,255,0.08)`

---

## Background & Effects

### Background Layer

- Base: `#09090B` (near-black)
- Fine dot grid: `radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)` at 24px spacing
- 2 floating cyan blobs: `#00E5FF` at 5-6% opacity, `blur(120px)`, slow float animation (20s)
- Subtle scanline overlay

### Animations

| Effect | CSS | Duration |
|---|---|---|
| Card float | `translateY(0) → translateY(-8px)` | 6s ease-in-out infinite alternate |
| Spotlight breathe | `scale(1) → scale(1.2)` | 8s ease-in-out infinite |
| Glow dots | `scale(1) → scale(1.4)`, opacity pulse | 3s ease-in-out infinite |
| Shimmer text | `background-position: 200% → -200%` | 4s linear infinite |
| Live dot pulse | opacity 1 → 0.3 | 2s infinite |
| Reveal on scroll | `opacity 0, translateY(24px) → visible` | 0.6s ease |
| Hover lift | `translateY(-4px)` | 0.25s ease |

---

## Icons

- **Lucide Icons** — thin stroke (1.75px), consistent sizing
- CDN: `https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js`
- Sidebar: 18px, Settings: 16px, Popup: 16px, Mobile: 18px

---

## Navigation

- **Logo:** Text only — "AI Builder" in Montserrat Light, uppercase, wide letter-spacing (3px)
- **Nav links:** Plain text, no borders. Center-aligned (CSS grid 1fr/auto/1fr)
- **Language:** Hover dropdown, no borders on trigger. Items turn cyan on hover.
- **Nav starts transparent**, gains blur background after 20px scroll

---

## i18n

- 3 languages: UZ (primary), RU, EN
- UZ is default (`localStorage 'builder_lang' || 'uz'`)
- All text uses `data-i18n` attributes
- T object contains all translation keys
- `setLang()` updates all elements + sets `data-lang` on `<html>`

---

## Design Principles

1. **Design does the talking** — minimal text, let visuals communicate
2. **Cyan as trim** — accent color on edges and details, never as primary fill
3. **Glassmorphism everywhere** — transparent cards with blur and thin borders
4. **Subtle motion** — floating, breathing, pulsing — alive but never distracting
5. **Dark warmth** — `#09090B` is warmer than pure black, feels intentional
6. **Typography hierarchy** — Montserrat Light for headlines, Inter for everything else
7. **No visual noise** — every element earns its place
8. **Mobile-first** — responsive breakpoints at 480px, 768px, 900px, 1100px
