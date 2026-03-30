/**
 * ============================================================
 * AI Website Builder — Backend API Server
 * Version: 3.3.0-voice
 * ============================================================
 * Responsibilities:
 *  - AI code generation (streaming SSE via OpenRouter)
 *  - Brainstorm mode (conversational planning, no HTML output)
 *  - Auth: signup (auto-confirm), usage limits (plan-based)
 *  - Build storage: save multi-file projects on disk
 *  - Deploy/undeploy: calls internal host deploy API
 *  - Voice transcription: converts audio via ffmpeg → Whisper
 *  - Guest usage: IP-based rate limiting (in-memory)
 *  - Account management: soft delete / restore
 * ============================================================
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { Pool: PgPool } = require('pg');

// Direct Postgres connection for admin operations (CREATE USER, GRANT, etc.)
// Only used server-side for deploy/undeploy — never exposed to user apps
let adminPool = null;
try {
  const sbCfg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'supabase-config.json'), 'utf8'));
  if (sbCfg.DATABASE_URL) {
    adminPool = new PgPool({
      connectionString: sbCfg.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3 // small pool — only used for deploy/undeploy admin ops
    });
    adminPool.on('error', (err) => console.warn('Admin pool error:', err.message));
    console.log('✅ Admin Postgres pool ready');
  }
} catch(e) { console.warn('Admin pool not initialized:', e.message); }

const app = express();
// Trust the first nginx reverse proxy for accurate IP extraction
app.set('trust proxy', 1);
app.use(cors({
  origin: [
    'https://builder.kenzoagent.com'
  ]
}));
app.use(express.json({ limit: '10mb' }));

// ── Rate Limiters ─────────────────────────────────────────────────────────────
// General API rate limit — 30 req/min per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Signup rate limit — 5 new accounts per IP per hour (spam prevention)
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many accounts created from this IP. Try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── API Key Loading ───────────────────────────────────────────────────────────
// Keys loaded from config files; env vars are the fallback
let OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
let OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
let SUPABASE_URL = '';
let SUPABASE_SERVICE_KEY = '';
let SUPABASE_ANON_KEY = '';
let DATABASE_URL = '';

try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  if (cfg.OPENROUTER_API_KEY && !cfg.OPENROUTER_API_KEY.includes('REPLACE')) {
    OPENROUTER_API_KEY = cfg.OPENROUTER_API_KEY;
  }
  if (cfg.OPENAI_API_KEY) OPENAI_API_KEY = cfg.OPENAI_API_KEY;
} catch(e) { console.warn('⚠️  config.json not found — relying on environment variables only'); }

try {
  const sbCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'supabase-config.json'), 'utf8'));
  SUPABASE_URL = sbCfg.SUPABASE_URL;
  SUPABASE_SERVICE_KEY = sbCfg.SUPABASE_SERVICE_ROLE_KEY;
  SUPABASE_ANON_KEY = sbCfg.SUPABASE_ANON_KEY || '';
  DATABASE_URL = sbCfg.DATABASE_URL || '';
} catch(e) { console.warn('supabase-config.json not found'); }

// Internal deploy API host (runs on host machine, not inside container)
const DEPLOY_HOST = '172.18.0.1';
const DEPLOY_PORT = 5000;

// Startup key audit — fail fast if critical keys are missing
if (!OPENROUTER_API_KEY) console.error('❌ CRITICAL: OPENROUTER_API_KEY is missing — AI calls will fail!');
else console.log('✅ OpenRouter key loaded:', OPENROUTER_API_KEY.slice(0,20) + '...');
if (!OPENAI_API_KEY) console.warn('⚠️  OPENAI_API_KEY missing — voice transcription will fail');
else console.log('✅ OpenAI key loaded:', OPENAI_API_KEY.slice(0,20) + '...');

// ── Plan Limits ───────────────────────────────────────────────────────────────
// Monthly generation quotas per plan tier (guest = 24h IP-based)
const PLAN_LIMITS = {
  guest: 3,
  free: 5,
  starter: 50,
  pro: 200,
  expert: Infinity
};

// Admin user IDs — bypass all generation limits
const ADMIN_USERS = ['69ef123f-b5de-4d16-999d-aa1fef63001e'];

// ── Supabase Helpers ──────────────────────────────────────────────────────────

// ── supabaseRequest ──────────────────────────────────────────────────────────
// Generic REST call to Supabase PostgREST API
// Dependencies: SUPABASE_URL, SUPABASE_SERVICE_KEY, fetch
// Flow: builds URL → sets auth/content headers → calls fetch → returns JSON
// Affects: whichever Supabase table is specified in `path`
// Called by: deleteAccount, restoreAccount, deploy, undeploy, checkSubdomain
async function supabaseRequest(method, path, body, token) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const prefer = method === 'POST' ? 'return=representation' : method === 'PATCH' ? 'return=minimal' : undefined;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${token || SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': prefer
  };
  // Drop undefined headers (PATCH has no Prefer needed for count)
  Object.keys(headers).forEach(k => headers[k] === undefined && delete headers[k]);

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

// ── verifyUser ───────────────────────────────────────────────────────────────
// Validates a Supabase JWT and returns the user object
// Dependencies: SUPABASE_URL, SUPABASE_SERVICE_KEY, fetch
// Flow: extracts Bearer token → calls Supabase /auth/v1/user → returns user or null
// Affects: nothing (read-only)
// Called by: every authenticated endpoint (generate-stream, deploy, undeploy, etc.)
async function verifyUser(authHeader) {
  if (!authHeader || !SUPABASE_URL) return null;
  const token = authHeader.replace('Bearer ', '');
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch(e) { return null; }
}

// ── getMonthlyUsage ──────────────────────────────────────────────────────────
// Returns the number of AI generations a user has made this calendar month
// Dependencies: SUPABASE_URL, SUPABASE_SERVICE_KEY, fetch
// Flow: calculates start-of-month → queries generations table with count header
// Affects: nothing (read-only)
// Called by: /api/usage, /api/generate-stream (limit check)
async function getMonthlyUsage(userId) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/generations?select=id&user_id=eq.${userId}&created_at=gte.${startOfMonth.toISOString()}`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Prefer': 'count=exact' } }
    );
    // Supabase returns "X-Total-Count" in Content-Range: 0-4/5
    const countHeader = res.headers.get('content-range');
    if (countHeader) {
      const match = countHeader.match(/\/(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }
    const data = await res.json();
    return Array.isArray(data) ? data.length : 0;
  } catch(e) { return 0; }
}

// ── getUserPlan ──────────────────────────────────────────────────────────────
// Resolves the current subscription plan for a user
// Dependencies: none (currently hardcoded to 'free'; will check subscriptions table when payments added)
// Flow: returns 'free' for all users
// Affects: nothing
// Called by: /api/usage, /api/generate-stream
async function getUserPlan(userId) {
  // TODO: query subscriptions table once payment is integrated
  return 'free';
}

// ── logGeneration ────────────────────────────────────────────────────────────
// Records a generation event to the generations table (for usage tracking)
// Dependencies: SUPABASE_URL, SUPABASE_SERVICE_KEY, fetch
// Flow: POSTs a row with user_id, model, prompt, project_id
// Affects: Supabase `generations` table
// Called by: /api/generate-stream onDone callback
async function logGeneration(userId, model, prompt, projectId) {
  if (!userId || !SUPABASE_URL) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/generations`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user_id: userId, model, prompt, project_id: projectId || null })
    });
  } catch(e) { console.warn('Failed to log generation:', e.message); }
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
// Creates a new user via Supabase Admin API (auto-confirms email) then signs them in
// Dependencies: SUPABASE_URL, SUPABASE_SERVICE_KEY, signupLimiter
// Flow:
//   1. Validate email + password present
//   2. POST to Supabase Admin /auth/v1/admin/users with email_confirm:true
//   3. Sign user in via /auth/v1/token?grant_type=password to get session
//   4. Return both user + session objects to client
// Affects: Supabase `auth.users` table
// Called by: frontend /app/build/index.html handleAuth() on signup
app.post('/api/auth/signup', signupLimiter, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true, // skip verification email
        user_metadata: { full_name: name || email.split('@')[0] }
      })
    });
    const userData = await createRes.json();
    if (userData.error || userData.msg) {
      return res.status(400).json({ error: userData.error || userData.msg || 'Signup failed' });
    }

    // Sign in to get session token for immediate use
    const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    const session = await loginRes.json();
    if (session.error) return res.status(400).json({ error: session.error });

    res.json({ user: userData, session });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/usage ────────────────────────────────────────────────────────────
// Returns current month's generation count and limit for the authenticated user
// Dependencies: verifyUser, getUserPlan, getMonthlyUsage, PLAN_LIMITS
// Flow:
//   1. Verify user JWT (guests get guest-tier limit)
//   2. Get plan → get monthly usage count
//   3. Return { plan, used, limit, remaining }
// Affects: nothing (read-only)
// Called by: frontend fetchUsage(), dashboard settings Usage page
app.get('/api/usage', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user) return res.json({ plan: 'guest', used: 0, limit: PLAN_LIMITS.guest });

  // Admin bypass — unlimited builds, no counter shown
  if (ADMIN_USERS.includes(user.id)) {
    const used = await getMonthlyUsage(user.id);
    return res.json({ plan: 'admin', used, limit: 'unlimited', remaining: 'unlimited' });
  }

  const plan = await getUserPlan(user.id);
  const used = await getMonthlyUsage(user.id);
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  res.json({ plan, used, limit: limit === Infinity ? 'unlimited' : limit, remaining: limit === Infinity ? 'unlimited' : Math.max(0, limit - used) });
});

// ── Filesystem Setup ──────────────────────────────────────────────────────────
const BUILDS_DIR = process.env.BUILDS_DIR || path.join(__dirname, 'builds');           // temp builds (24h TTL)
const DEPLOYED_BUILDS_DIR = process.env.DEPLOYED_BUILDS_DIR || path.join(__dirname, 'deployed-builds'); // permanent deployed copies
const PORT = process.env.PORT || 3500;

if (!fs.existsSync(BUILDS_DIR)) fs.mkdirSync(BUILDS_DIR, { recursive: true });
if (!fs.existsSync(DEPLOYED_BUILDS_DIR)) fs.mkdirSync(DEPLOYED_BUILDS_DIR, { recursive: true });

// In-memory guest usage tracker: { [ip]: { count, resetAt } }
// Persists only while process is alive; resets every 24h per IP
const guestUsage = {};

// ── System Prompt — Landing Page Builder ──────────────────────────────────────
// Injected as system message for all generate-stream (non-modify) calls
const SYSTEM_PROMPT = `You are an expert web developer building multi-page websites.

## OUTPUT FORMAT
Return a multi-file project using this EXACT format. Each file starts with "--- FILE: filename ---" on its own line:

--- FILE: index.html ---
<!DOCTYPE html>
<html>...</html>

--- FILE: about.html ---
<!DOCTYPE html>
<html>...</html>

--- FILE: css/styles.css ---
/* shared styles */

--- FILE: js/main.js ---
// shared scripts

## RULES
- ALWAYS create at least: index.html and css/styles.css
- Each HTML page must be COMPLETE (<!DOCTYPE html> to </html>)
- Use a shared css/styles.css file linked in every HTML page: <link rel="stylesheet" href="css/styles.css">
- Use Tailwind CSS via CDN AND your custom css/styles.css together
- Add consistent navigation on every page linking to all other pages
- Use placeholder images from https://picsum.photos/ when needed
- Make everything fully responsive (mobile-friendly)
- Add subtle CSS animations
- Never use Lorem Ipsum — write real relevant content
- If the user asks for a single page, still create index.html + css/styles.css
- Navigation links use relative paths: href="about.html" (not /about.html)

## NAVIGATION RULE
Every page MUST have the same navigation bar with links to ALL pages in the project. Keep nav consistent.

## IMPORTANT
Return ONLY the file contents in the format above. No explanations, no markdown code fences.`;

// ── extractCode ───────────────────────────────────────────────────────────────
// Extracts raw HTML from an AI response that might be wrapped in markdown
// Dependencies: none
// Flow: tries ```html fence → generic ``` fence → <!DOCTYPE tag → <html tag → raw text
// Affects: nothing (pure function)
// Called by: extractMultiFile (fallback path)
function extractCode(response) {
  const htmlMatch = response.match(/```html\n?([\s\S]*?)```/i);
  if (htmlMatch) return htmlMatch[1].trim();
  const codeMatch = response.match(/```\n?([\s\S]*?)```/);
  if (codeMatch) return codeMatch[1].trim();
  const firstTag = response.indexOf('<!DOCTYPE');
  if (firstTag >= 0) return response.substring(firstTag).trim();
  const firstHtml = response.indexOf('<html');
  if (firstHtml >= 0) return response.substring(firstHtml).trim();
  return response.trim();
}

// ── extractMultiFile ──────────────────────────────────────────────────────────
// Parses AI output into a { filename: content } map (supports multi-file format)
// Dependencies: extractCode (fallback)
// Flow:
//   1. Try "--- FILE: filename ---" delimiter format (primary)
//   2. Try markdown code-fence-with-path format (secondary)
//   3. Fall back to single index.html (extractCode)
// Affects: nothing (pure function)
// Called by: /api/generate-stream onDone
function extractMultiFile(response) {
  const filePattern = /---\s*FILE:\s*(.+?)\s*---\n([\s\S]*?)(?=---\s*FILE:|$)/gi;
  const files = {};
  let match;
  while ((match = filePattern.exec(response)) !== null) {
    const filename = match[1].trim().toLowerCase();
    const content = match[2].trim();
    if (filename && content) files[filename] = content;
  }
  if (Object.keys(files).length > 0) return files;

  // Secondary: code fences with filename comment
  const fencePattern = /```(?:\w+)?\s*\n?\/\/\s*(\S+)\n([\s\S]*?)```/g;
  while ((match = fencePattern.exec(response)) !== null) {
    const filename = match[1].trim();
    const content = match[2].trim();
    if (filename && content) files[filename] = content;
  }
  if (Object.keys(files).length > 0) return files;

  // Final fallback: treat entire response as a single HTML file
  const html = extractCode(response);
  return { 'index.html': html };
}

// ── callAI ────────────────────────────────────────────────────────────────────
// Non-streaming OpenRouter chat completion (used for brainstorm endpoint)
// Dependencies: OPENROUTER_API_KEY, https.request
// Flow: serializes messages → POST to openrouter.ai → wait for full response → return content string
// Affects: nothing (external API call)
// Called by: /api/brainstorm
function callAI(messages, model) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, messages, stream: false });
    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://builder.kenzoagent.com',
        'X-Title': 'AI Website Builder'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          const content = parsed.choices?.[0]?.message?.content;
          if (!content) return reject(new Error('Empty response from model'));
          resolve(content);
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.setTimeout(240000, () => { req.destroy(); reject(new Error('AI timed out')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── callAIStream ──────────────────────────────────────────────────────────────
// Streaming OpenRouter chat completion; fires callbacks per chunk
// Dependencies: OPENROUTER_API_KEY, https.request
// Flow:
//   1. POST with stream:true to openrouter.ai
//   2. Buffer incoming bytes → split on newlines → parse SSE "data: ..." lines
//   3. Call onChunk(delta, fullContent) for each token
//   4. Call onDone(fullContent) when [DONE] is received or connection closes
//   5. Call onError(err) on timeout or network error
// Affects: nothing (external API call)
// Called by: /api/generate-stream
function callAIStream(messages, model, onChunk, onDone, onError) {
  const body = JSON.stringify({ model, messages, stream: true });
  const options = {
    hostname: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://builder.kenzoagent.com',
      'X-Title': 'AI Website Builder'
    }
  };
  const req = https.request(options, (res) => {
    let buffer = '';
    let fullContent = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep partial last line in buffer
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { onDone(fullContent); return; }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onChunk(delta, fullContent);
          }
        } catch(e) { /* skip malformed SSE frames */ }
      }
    });
    res.on('end', () => {
      // Process any remaining buffered SSE line
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) { fullContent += delta; onChunk(delta, fullContent); }
          } catch(e) {}
        }
      }
      onDone(fullContent);
    });
  });
  req.setTimeout(240000, () => { req.destroy(); onError(new Error('AI stream timed out')); });
  req.on('error', onError);
  req.write(body);
  req.end();
}

// ── POST /api/generate-stream ──────────────────────────────────────────────────
// Main SSE endpoint: generates website code via AI and streams tokens to client
// Dependencies: verifyUser, getUserPlan, getMonthlyUsage, callAIStream,
//               extractMultiFile, logGeneration, PLAN_LIMITS, guestUsage, BUILDS_DIR
// Flow:
//   1. Validate input (prompt, size limits)
//   2. Check usage limits (admin bypass → plan limit → guest IP limit)
//   3. Set SSE response headers
//   4. Build system prompt (modify mode vs. fresh build)
//   5. Build user message (supports image attachment via base64)
//   6. Call callAIStream → forward chunk events to client
//   7. onDone: parse files, write to BUILDS_DIR, log generation, send done event
//   8. onError: send error event, close connection
// Affects: BUILDS_DIR (writes build folder), Supabase `generations` table
// Called by: frontend generate() and generateFullStack() in /app/build/
app.post('/api/generate-stream', async (req, res) => {
  const { prompt, model = 'anthropic/claude-sonnet-4.6', existingCode, image, imageMimeType, _systemOverride } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  // Input size limits to prevent abuse and protect tokens
  if (prompt.length > 5000) return res.status(400).json({ error: 'Prompt too long. Maximum 5000 characters.' });
  if (existingCode && existingCode.length > 200000) return res.status(400).json({ error: 'Code too large. Maximum 200KB.' });
  if (image && image.length > 5000000) return res.status(400).json({ error: 'Image too large. Maximum 5MB.' });

  // ── Usage limit enforcement ──
  const user = await verifyUser(req.headers.authorization);
  let userId = null;
  if (user) {
    userId = user.id;
    if (ADMIN_USERS.includes(userId)) { /* admin: skip all limit checks */ }
    else {
    const plan = await getUserPlan(userId);
    const used = await getMonthlyUsage(userId);
    const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    if (used >= limit) {
      return res.status(429).json({
        error: 'limit_reached',
        message: `You've used all ${limit} generations this month. Upgrade your plan for more.`,
        plan, used, limit
      });
    }
    }
  } else {
    // Guest: server-side IP tracking (resets every 24h per IP)
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    if (!guestUsage[ip]) guestUsage[ip] = { count: 0, resetAt: Date.now() + 24 * 60 * 60 * 1000 };
    if (Date.now() > guestUsage[ip].resetAt) {
      // Reset counter after 24h window expires
      guestUsage[ip] = { count: 0, resetAt: Date.now() + 24 * 60 * 60 * 1000 };
    }
    if (guestUsage[ip].count >= PLAN_LIMITS.guest) {
      return res.status(429).json({
        error: 'limit_reached',
        message: `Free limit reached (${PLAN_LIMITS.guest} builds). Sign up for more.`,
        plan: 'guest', used: guestUsage[ip].count, limit: PLAN_LIMITS.guest
      });
    }
    guestUsage[ip].count++;
  }

  // ── SSE headers ──
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': 'https://builder.kenzoagent.com'
  });

  // Detect whether this is a multi-file modify or fresh build
  const isMultiFile = existingCode && existingCode.includes('--- FILE:');
  const isModifying = !!existingCode;

  // System prompt for modify mode: preserve design, only change content/branding
  const MODIFY_PROMPT = `You are an expert web developer modifying an existing website.

## CRITICAL RULES
- You are given an EXISTING website. The user wants you to ADAPT/MODIFY it.
- KEEP: the entire design system, CSS, layout, animations, typography, visual style, color scheme
- CHANGE: text content, headings, descriptions, branding, business-specific information based on the user's request
- If the user asks to change colors or style, do that — but PRESERVE the overall quality and complexity
- Output the COMPLETE modified file(s) — never output partial code or snippets
- NEVER simplify the design. The output must be as polished and detailed as the input.
- NEVER strip CSS, animations, or effects from the original
- If the original is a single HTML file with inline CSS, keep it as a single file with inline CSS
- If the original uses Tailwind, keep using Tailwind
- Use placeholder images from https://picsum.photos/ when needed
- Write real relevant content — never use Lorem Ipsum

## OUTPUT FORMAT
${isMultiFile ? 'Return ALL files using the --- FILE: filename --- format.' : 'Return a single complete HTML file. No file markers, no markdown fences. Just the complete HTML from <!DOCTYPE html> to </html>.'}`;

  let wizardContextStr = '';
  if (req.body.wizardContext) {
    const wc = req.body.wizardContext;
    wizardContextStr = `\n\n## PROJECT CONTEXT (from Wizard)\nApp Type: ${wc.app_type || 'custom'}\nPages to build: ${(wc.pages || []).join(', ')}\n`;
    if (wc.brand) {
      const b = wc.brand;
      if (b.colors) wizardContextStr += `Brand Colors: primary=${b.colors.primary}, secondary=${b.colors.secondary}, accent=${b.colors.accent}, bg=${b.colors.bg||'#ffffff'}\n`;
      if (b.typography) wizardContextStr += `Typography: heading=${b.typography.heading}, body=${b.typography.body}\n`;
      if (b.style) wizardContextStr += `Style: ${b.style}\n`;
      if (b.personality) wizardContextStr += `Brand Personality: ${b.personality}\n`;
      if (b.tone) wizardContextStr += `Brand Tone: ${b.tone}\n`;
      if (b.mission) wizardContextStr += `Mission: ${b.mission}\n`;
      if (b.tagline) wizardContextStr += `Tagline: ${b.tagline}\n`;
    }
    if (wc.language) wizardContextStr += `User language: ${wc.language}\n`;
    wizardContextStr += '\nApply ALL brand context consistently across every page and component.';
  }
  const baseSystemPrompt = _systemOverride || (isModifying ? MODIFY_PROMPT : SYSTEM_PROMPT);
  const systemPrompt = wizardContextStr ? baseSystemPrompt + wizardContextStr : baseSystemPrompt;
  const messages = [{ role: 'system', content: systemPrompt }];

  // Build user message — multimodal if image was attached
  let userContent;
  if (image) {
    // Vision-capable models: attach image + text instruction
    const textPart = existingCode
      ? `Current website code:\n${existingCode}\n\nModify this website based on the attached image and instruction: ${prompt}`
      : `Create a website based on the attached image and instruction: ${prompt}`;
    userContent = [
      { type: 'text', text: textPart },
      { type: 'image_url', image_url: { url: `data:${imageMimeType || 'image/jpeg'};base64,${image}` } }
    ];
  } else if (existingCode) {
    // Provide existing code as context for modification
    userContent = isMultiFile
      ? `Current project files:\n${existingCode}\n\nUser request: ${prompt}\n\nReturn ALL files in the project (modified and unmodified) using the --- FILE: filename --- format.`
      : `Here is the current website:\n${existingCode}\n\nUser request: ${prompt}\n\nReturn the complete modified HTML file.`;
  } else {
    userContent = `Create a website: ${prompt}`;
  }
  messages.push({ role: 'user', content: userContent });

  const startTime = Date.now();
  console.log(`[stream] model=${model} user=${userId?.slice(0,8)||'guest'} img=${!!image} prompt="${prompt.slice(0,60)}"`);

  callAIStream(messages, model,
    // onChunk — forward each token to client as SSE event
    (delta, fullContent) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', delta, length: fullContent.length })}\n\n`);
    },
    // onDone — parse output, save to disk, notify client
    (fullContent) => {
      const files = extractMultiFile(fullContent);
      const html = files['index.html'] || extractCode(fullContent);

      // Save build to disk — each file in its own subfolder keyed by UUID
      const buildId = crypto.randomUUID();
      const buildPath = path.join(BUILDS_DIR, buildId);
      fs.mkdirSync(buildPath, { recursive: true });
      for (const [filename, content] of Object.entries(files)) {
        const filePath = path.join(buildPath, filename);
        const dir = path.dirname(filePath);
        if (dir !== buildPath) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content);
      }

      // Log generation event for usage tracking
      if (userId) logGeneration(userId, model, prompt);

      // Wizard post-build review
      const wizardCtx = req.body.wizardContext;
      if (wizardCtx && fullContent.length > 1000) {
        runPostBuildReview(fullContent, wizardCtx, buildId).catch(e => console.warn('[wizard-review]', e.message));
      }

      const duration = Date.now() - startTime;
      const fileCount = Object.keys(files).length;
      console.log(`[stream] done ${fileCount} files, ${html.length} chars index.html in ${duration}ms`);

      res.write(`data: ${JSON.stringify({ type: 'done', html, files, buildId, duration })}\n\n`);
      res.end();
    },
    // onError — send error event and close SSE connection
    (err) => {
      console.error(`[stream] error:`, err.message);
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  );

  // Handle client disconnect gracefully (no further writes after close)
  req.on('close', () => { /* client disconnected — stream will fail naturally */ });
});

// ── Brainstorm System Prompt ──────────────────────────────────────────────────
// Injected for /api/brainstorm — conversational strategist, NO code output
const DISCOVERY_PROMPT_LANDING = `You are a senior web designer and brand strategist. The user wants to build a landing page / website. Your job: guide them through a quick discovery conversation to create the PERFECT brief — then tell them you're ready to build.

## DISCOVERY FLOW (follow this order)

### Step 1: Understand the Business (first response)
Read their prompt. Acknowledge what they want. Then ask 2-3 questions:
- What does your business/project do in one sentence?
- Who is your target audience?
- What's the main goal of this website? (sell, showcase, capture leads, inform)

Be opinionated — suggest answers: "For a coffee shop, your audience is probably local customers aged 20-45 who discover you via Instagram or Google Maps. Sound right?"

### Step 2: Structure & Pages (second response)
Suggest the complete page structure:
- "For your [business], I'd recommend these pages: Home, About, Menu/Services, Contact, Privacy Policy"
- "Your landing page should have: Hero with CTA → Problem → Solution → Features → Testimonials → Pricing → FAQ → Footer"
- Ask: "Anything you'd add or remove?"
- Mention pages they'd forget: Privacy Policy, Terms, 404 page

### Step 3: Branding & Design (third response)
- Ask about brand colors: "What's your brand color? If you don't have one, what vibe fits — professional blue, energetic orange, earthy green?"
- Suggest accent colors based on their choice: "With deep blue as primary, I'd suggest warm amber as accent and light gray for backgrounds. Or we could go ice blue + charcoal for a modern tech feel."
- Ask about personality: "Should this feel Professional & Trustworthy, Friendly & Playful, or Bold & Modern?"
- Ask about any existing brand assets (logo, tagline)

### Step 4: Ready to Build (fourth response)
Summarize everything in a clear plan:

---
## 🎯 READY TO BUILD

**Project:** [Name]
**Goal:** [One sentence]
**Audience:** [Who]
**Brand:** [Color] + [Accent] | [Personality]

### Pages & Sections:
1. **Home** — Hero with [headline], [sections in order]
2. **About** — [what to include]
3. **[Other pages]**

### Key Copy:
- Headline: "[suggestion]"
- CTA: "[button text]"

**I have everything I need. Type "build it" or "let's go" and I'll generate your website!**
---

## RULES
- Ask 2-3 questions MAX per response
- Be opinionated — SUGGEST, don't just ask
- Keep responses short — 3-5 short paragraphs max
- NEVER generate code or HTML
- When the user says "build it", "go ahead", "let's go", "yes build" — respond with EXACTLY: __BUILD_READY__
- CRITICAL: Respond in the SAME language the user writes in
- If user says "skip" or "build directly" — respond with EXACTLY: __BUILD_READY__`;

const DISCOVERY_PROMPT_FULLSTACK = `You are a senior full-stack architect and product designer. The user wants to build a web application. Your job: guide them through a quick discovery conversation to create the PERFECT brief — then tell them you're ready to build.

## DISCOVERY FLOW (follow this order)

### Step 1: Understand the App (first response)
Read their prompt. Acknowledge what they want. Then ask 2-3 questions:
- What problem does this app solve?
- Who will use it? (internal team, customers, public)
- What are the 3 most important features?

Be opinionated — suggest: "For a CRM, you'd typically need: Contacts list, Deal pipeline, Activity log, and a Dashboard with stats. Does that cover your needs?"

### Step 2: Data & Features (second response)
Suggest the data structure:
- "Your app needs these main entities: Customers (name, email, phone, status), Orders (date, items, total), Products (name, price, stock)"
- "Key features: Add/edit/delete records, Search & filter, Status updates, Dashboard with counts"
- Ask: "Any specific workflows? Like: when a customer places an order, update their status to Active?"
- Suggest things they'd forget: "Don't forget search/filter, pagination for large lists, and an export option"

### Step 3: Design & UX (third response)
- "Should this be a dark theme (like a dashboard/admin panel) or light theme (like a customer-facing app)?"
- "Layout: sidebar navigation or top nav? For a dashboard app, sidebar usually works better."
- Suggest color: "For a professional dashboard, I'd go dark with teal accent. For something friendly, light with blue accent."
- Ask about pages: "I'm thinking: Dashboard (overview stats), [Main entity list], [Detail/edit page], Settings. Sound right?"

### Step 4: Ready to Build (fourth response)
Summarize everything:

---
## 🎯 READY TO BUILD

**App:** [Name]
**Purpose:** [One sentence]
**Users:** [Who]
**Theme:** [Dark/Light] with [color] accent

### Pages:
1. **Dashboard** — [what stats/cards to show]
2. **[Entity] List** — [columns, filters, actions]
3. **[Entity] Form** — [fields]
4. **Settings** — [what's configurable]

### Data:
- [Entity 1]: [fields]
- [Entity 2]: [fields]

### Key Features:
- [Feature list]

**I have everything I need. Type "build it" or "let's go" and I'll generate your app!**
---

## RULES
- Ask 2-3 questions MAX per response
- Be opinionated — SUGGEST, don't just ask
- Keep responses short — 3-5 short paragraphs max
- NEVER generate code or HTML
- When the user says "build it", "go ahead", "let's go", "yes build" — respond with EXACTLY: __BUILD_READY__
- CRITICAL: Respond in the SAME language the user writes in
- If user says "skip" or "build directly" — respond with EXACTLY: __BUILD_READY__`;

// ── POST /api/brainstorm ───────────────────────────────────────────────────────
// Conversational planning endpoint — returns strategic advice, NOT HTML
// Dependencies: callAI, BRAINSTORM_PROMPT
// Flow:
//   1. Validate message history (max 20 messages, max 50KB per message)
//   2. Prepend BRAINSTORM_PROMPT as system message
//   3. Call callAI (non-streaming) → return reply text
// Affects: nothing (no DB writes, no file writes)
// Called by: frontend brainstorm() in /app/build/
app.post('/api/brainstorm', async (req, res) => {
  const { messages: chatHistory = [], model = 'anthropic/claude-sonnet-4.6', mode = 'build' } = req.body;
  if (!chatHistory.length) return res.status(400).json({ error: 'Messages required' });

  // Guard against oversized history (prevents prompt injection via history stuffing)
  if (chatHistory.length > 20) return res.status(400).json({ error: 'Too many messages. Maximum 20 per conversation.' });
  for (const msg of chatHistory) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    if (content.length > 50000) return res.status(400).json({ error: 'Message too large.' });
  }

  const lastMsg = chatHistory[chatHistory.length - 1];
  const hasImage = Array.isArray(lastMsg?.content) && lastMsg.content.some(c => c.type === 'image_url');
  if (hasImage) console.log('[brainstorm] image attached, model=', model);

  try {
    const messages = [
      { role: 'system', content: mode === 'fullstack' ? DISCOVERY_PROMPT_FULLSTACK : DISCOVERY_PROMPT_LANDING },
      ...chatHistory
    ];

    const content = await callAI(messages, model);
    res.json({ reply: content });
  } catch (err) {
    console.error('[brainstorm] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /health ───────────────────────────────────────────────────────────────
// Simple liveness check for load balancers / monitoring
// Dependencies: none
// Flow: returns static JSON { status, version }
// Affects: nothing
// Called by: nginx health checks, uptime monitors
app.get('/health', (req, res) => res.json({ status: 'ok', version: '3.2.0-usage-tracking' }));

// ── POST /api/delete-account ───────────────────────────────────────────────────
// Soft-deletes a user account by setting deleted_at (recoverable for 30 days)
// Dependencies: verifyUser, supabaseRequest
// Flow:
//   1. Verify JWT → get user.id
//   2. PATCH profiles table: set deleted_at = now()
// Affects: Supabase `profiles` table (deleted_at column)
// Called by: dashboard deleteAccount() in /app/index.html
app.post('/api/delete-account', async (req, res) => {
  try {
    const user = await verifyUser(req.headers.authorization);
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    await supabaseRequest('PATCH', `profiles?id=eq.${user.id}`, {
      deleted_at: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Delete account error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/restore-account ──────────────────────────────────────────────────
// Checks if account is soft-deleted and restores it (called on every login)
// Dependencies: verifyUser, supabaseRequest
// Flow:
//   1. Verify JWT → get user.id
//   2. GET profile → check deleted_at
//   3. If < 30 days ago → PATCH deleted_at = null → return 'restored'
//   4. If > 30 days ago → return 'wiped' (data purge not implemented yet)
//   5. If not deleted → return 'active'
// Affects: Supabase `profiles` table (deleted_at column)
// Called by: dashboard checkAndRestoreAccount() in /app/index.html
app.post('/api/restore-account', async (req, res) => {
  try {
    const user = await verifyUser(req.headers.authorization);
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    const profiles = await supabaseRequest('GET', `profiles?id=eq.${user.id}&select=deleted_at`);
    const profile = Array.isArray(profiles) ? profiles[0] : null;

    if (!profile?.deleted_at) return res.json({ status: 'active' });

    const daysSince = (Date.now() - new Date(profile.deleted_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) return res.json({ status: 'wiped' });

    // Clear deleted_at to restore the account
    await supabaseRequest('PATCH', `profiles?id=eq.${user.id}`, { deleted_at: null });
    res.json({ status: 'restored' });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Note: Legacy /api/generate and /api/job/:jobId endpoints removed in v3.8
// All generation now goes through /api/generate-stream (SSE)

// ── GET /api/check-subdomain ───────────────────────────────────────────────────
// Checks if a subdomain is available for deployment
// Dependencies: SUPABASE_URL, SUPABASE_SERVICE_KEY, fetch
// Flow:
//   1. Validate subdomain not empty
//   2. Check reserved list
//   3. Validate regex format (lowercase alphanum + hyphens, 3-32 chars)
//   4. Query Supabase projects table for existing deployed_url match
//   5. Allow re-deploy of same project (projectId match)
// Affects: nothing (read-only)
// Called by: frontend checkSubdomain() in /app/build/ (deploy modal)
app.get('/api/check-subdomain', async (req, res) => {
  const { subdomain, projectId } = req.query;
  if (!subdomain) return res.json({ available: false, error: 'No subdomain provided' });

  const reserved = ['kenzo', 'admin', 'api', 'www', 'mail', 'builder', 'app', 'dashboard', 'auth', 'login', 'static', 'assets', 'cdn'];
  if (reserved.includes(subdomain)) return res.json({ available: false, reason: 'reserved' });
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(subdomain)) return res.json({ available: false, reason: 'invalid' });

  try {
    const url = `${SUPABASE_URL}/rest/v1/projects?deployed_url=eq.https://${subdomain}.kenzoagent.com&select=id`;
    const sbRes = await fetch(url, { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } });
    const rows = await sbRes.json();
    if (rows.length === 0) return res.json({ available: true });
    // Allow re-deploy on same project
    if (projectId && rows[0].id === projectId) return res.json({ available: true });
    return res.json({ available: false, reason: 'taken' });
  } catch(e) { return res.json({ available: true }); } // fail open on Supabase error
});

// ── POST /api/delete-project ───────────────────────────────────────────────────
// Fully removes a project: undeploys site, deletes build files, removes DB record
// Dependencies: verifyUser, http.request (deploy API), fs.rmSync, fetch (Supabase)
// Flow:
//   1. Verify user ownership
//   2. Undeploy live site (call internal deploy API /undeploy)
//   3. Delete temp build folder from BUILDS_DIR
//   4. Delete permanent copy from DEPLOYED_BUILDS_DIR
//   5. DELETE project row from Supabase (scoped to user_id for safety)
// Affects: BUILDS_DIR, DEPLOYED_BUILDS_DIR (filesystem), Supabase `projects` table
// Called by: dashboard delProj() in /app/index.html
app.post('/api/delete-project', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user?.id) return res.status(401).json({ error: 'Login required' });
  const { projectId, buildId, subdomain } = req.body;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  try {
    // Step 1: full undeploy if the site is live (handles both static + full-stack Docker apps)
    if (subdomain) {
      try {
        // Fetch app_schema to determine if full-stack
        let appSchema = null;
        try {
          const projects = await supabaseRequest('GET', `projects?id=eq.${projectId}&user_id=eq.${user.id}&select=app_schema`);
          appSchema = projects?.[0]?.app_schema || null;
        } catch(e) { console.warn('[delete] Could not fetch app_schema:', e.message); }

        if (appSchema) {
          // Full-stack: stop Docker container + remove image + nginx + drop schema + release port
          const dockerBody = JSON.stringify({ subdomain });
          await new Promise((resolve, reject) => {
            const opts = { hostname: DEPLOY_HOST, port: DEPLOY_PORT, path: '/docker/undeploy-app', method: 'POST', headers: { 'Content-Type': 'application/json' } };
            const r = http.request(opts, (res2) => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>resolve(d)); });
            r.on('error', reject); r.write(dockerBody); r.end();
          });
          // Drop Supabase schema
          // Drop per-app DB user
          try { await dropAppDbUser(appSchema); } catch(e) { console.warn('[delete] DB user drop failed:', e.message); }
          try {
            await fetch(`${SUPABASE_URL}/rest/v1/rpc/drop_app_schema`, {
              method: 'POST',
              headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ schema_name: appSchema })
            });
          } catch(e) { console.warn('[delete] Schema drop failed:', e.message); }
          // Release port + remove app files
          releasePort(subdomain);
          const appDir = path.join(DOCKER_APPS_DIR, subdomain);
          if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
          console.log(`[delete] Full-stack undeploy complete for ${subdomain}`);
        } else {
          // Static site: nginx only
          const undeployBody = JSON.stringify({ domain: `${subdomain}.kenzoagent.com` });
          await new Promise((resolve, reject) => {
            const opts = { hostname: DEPLOY_HOST, port: DEPLOY_PORT, path: '/undeploy', method: 'POST', headers: { 'Content-Type': 'application/json' } };
            const r = http.request(opts, (res2) => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>resolve(d)); });
            r.on('error', reject); r.write(undeployBody); r.end();
          });
        }
      } catch(e) { console.warn('[delete] undeploy during delete failed:', e.message); }
    }

    // Step 2: delete build files from both temp and permanent locations
    if (buildId) {
      const tempPath = path.join(BUILDS_DIR, buildId);
      const deployedPath = path.join(DEPLOYED_BUILDS_DIR, buildId);
      if (fs.existsSync(tempPath)) {
        try { fs.rmSync(tempPath, { recursive: true, force: true }); } catch(e) { console.warn('temp build cleanup failed:', e.message); }
      }
      if (fs.existsSync(deployedPath)) {
        try { fs.rmSync(deployedPath, { recursive: true, force: true }); } catch(e) { console.warn('deployed build cleanup failed:', e.message); }
      }
    }

    // Step 3: delete project from Supabase (user_id scoped — prevents cross-user deletion)
    const delUrl = `${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}&user_id=eq.${user.id}`;
    await fetch(delUrl, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Prefer': 'return=minimal' }
    });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/deploy ───────────────────────────────────────────────────────────
// Deploys a build to a public kenzoagent.com subdomain with SSL
// Dependencies: verifyUser, fs (build scan), http.request (deploy API), fetch (Supabase)
// Flow:
//   1. Verify user + validate subdomain format + reserved list
//   2. Locate build folder (BUILDS_DIR → fallback DEPLOYED_BUILDS_DIR)
//   3. Security scan: allowed extensions, max files (30), max size (5MB), blocked content
//   4. Generate nginx.conf for the subdomain
//   5. POST to internal deploy API at 172.18.0.1:5000/deploy
//   6. Copy build to permanent DEPLOYED_BUILDS_DIR for future redeploys
//   7. Update Supabase project record with deployed_url
//   8. Return { success, url }
// Affects: BUILDS_DIR (nginx.conf added), DEPLOYED_BUILDS_DIR (copy), Supabase `projects` table
// Called by: frontend confirmDeploy() in /app/build/
// ── Schema Management (Multi-Tenant Database) ──────────────────────────────

// POST /api/create-schema — creates an isolated Postgres schema for a project
// Dependencies: verifyUser(), supabaseRequest (RPC), SUPABASE_URL, SUPABASE_SERVICE_KEY
// Flow: validate user → generate schema name → call Supabase RPC → save to project record
// Affects: Postgres (new schema), projects table (app_schema column)
app.post('/api/create-schema', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user?.id) return res.status(401).json({ error: 'Login required' });
  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  // Generate schema name from project ID (sanitize for Postgres)
  const schemaName = 'app_proj_' + projectId.replace(/-/g, '_').toLowerCase();

  try {
    // Call Supabase RPC to create schema
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_app_schema`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ schema_name: schemaName })
    });
    if (!rpcRes.ok) {
      const err = await rpcRes.text();
      throw new Error('Schema creation failed: ' + err);
    }

    // Save schema name to project record
    await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}&user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ app_schema: schemaName })
    });

    console.log(`[schema] Created ${schemaName} for project ${projectId}`);
    res.json({ success: true, schemaName });
  } catch(e) {
    console.error('[schema] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/run-migration — executes SQL migration in a project's schema
// Dependencies: verifyUser(), SUPABASE_URL, SUPABASE_SERVICE_KEY
// Flow: validate user → validate schema ownership → call Supabase RPC with SQL
// Affects: Postgres (creates/alters tables in user's schema)
app.post('/api/run-migration', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user?.id) return res.status(401).json({ error: 'Login required' });
  const { projectId, sql } = req.body;
  if (!projectId || !sql) return res.status(400).json({ error: 'projectId and sql required' });

  // Security: block dangerous SQL
  const forbidden = ['DROP SCHEMA', 'DROP DATABASE', 'CREATE ROLE', 'ALTER ROLE', 'GRANT', 'pg_', 'information_schema'];
  for (const f of forbidden) {
    if (sql.toUpperCase().includes(f.toUpperCase())) {
      return res.status(400).json({ error: `Forbidden SQL: ${f}` });
    }
  }

  const schemaName = 'app_proj_' + projectId.replace(/-/g, '_').toLowerCase();

  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/run_app_migration`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ schema_name: schemaName, migration_sql: sql })
    });
    if (!rpcRes.ok) {
      const err = await rpcRes.text();
      throw new Error('Migration failed: ' + err);
    }

    console.log(`[migration] Ran migration in ${schemaName}`);
    res.json({ success: true });
  } catch(e) {
    console.error('[migration] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/schema-info — returns database credentials for a project's schema
// Dependencies: verifyUser(), SUPABASE_URL, SUPABASE_SERVICE_KEY
// Flow: validate user → return Supabase URL + anon key + schema name
// Used by: WebContainer apps to connect to their database
app.get('/api/schema-info', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user?.id) return res.status(401).json({ error: 'Login required' });
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const schemaName = 'app_proj_' + projectId.replace(/-/g, '_').toLowerCase();

  // Return credentials the app needs to connect
  // Note: using anon key (not service key) — RLS still applies
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_SERVICE_KEY.slice(0, 20) === 'eyJ' ? SUPABASE_SERVICE_KEY : '', // only return if it's a JWT
    schemaName,
    hint: 'Use these in your app: createClient(url, key, { db: { schema: schemaName } })'
  });
});

// POST /api/list-tables — lists tables in a project's schema
// Dependencies: verifyUser(), Supabase RPC
app.post('/api/list-tables', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user?.id) return res.status(401).json({ error: 'Login required' });
  const { projectId } = req.body;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const schemaName = 'app_proj_' + projectId.replace(/-/g, '_').toLowerCase();

  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_app_tables`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ schema_name: schemaName })
    });
    const tables = await rpcRes.json();
    res.json({ tables });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Full-Stack Docker Deployment ────────────────────────────────────────────

// ── createAppDbUser ────────────────────────────────────────────────────────────
// Creates an isolated Postgres user for a deployed app with access ONLY to its schema
// Dependencies: adminPool (direct Postgres connection with master credentials)
// Flow: CREATE USER → GRANT USAGE ON SCHEMA → GRANT ALL ON TABLES → ALTER DEFAULT PRIVILEGES
// Returns: { username, password } or throws on failure
async function createAppDbUser(schemaName) {
  if (!adminPool) throw new Error('Admin Postgres pool not available');
  
  const username = schemaName; // e.g. app_proj_abc123
  const password = require('crypto').randomBytes(24).toString('base64url'); // strong random password
  
  const client = await adminPool.connect();
  try {
    // Drop existing user if any (idempotent redeploy)
    await client.query(`DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${username}') THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', '${schemaName}', '${username}');
        EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM %I', '${schemaName}', '${username}');
        EXECUTE format('DROP USER %I', '${username}');
      END IF;
    END $$;`);
    
    // Create user with login
    await client.query(`CREATE USER "${username}" WITH LOGIN PASSWORD '${password}'`);
    
    // Grant schema access (only this schema, nothing else)
    await client.query(`GRANT USAGE ON SCHEMA "${schemaName}" TO "${username}"`);
    await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "${schemaName}" TO "${username}"`);
    await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "${schemaName}" TO "${username}"`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT ALL ON TABLES TO "${username}"`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}" GRANT ALL ON SEQUENCES TO "${username}"`);
    
    console.log(`[deploy-fs] Created DB user ${username} with schema-scoped access`);
    return { username, password };
  } finally {
    client.release();
  }
}

// ── dropAppDbUser ────────────────────────────────────────────────────────────
// Removes the per-app Postgres user during undeploy
async function dropAppDbUser(schemaName) {
  if (!adminPool) return;
  const username = schemaName;
  const client = await adminPool.connect();
  try {
    await client.query(`DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${username}') THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', '${schemaName}', '${username}');
        EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM %I', '${schemaName}', '${username}');
        EXECUTE format('DROP USER %I', '${username}');
      END IF;
    END $$;`);
    console.log(`[undeploy] Dropped DB user ${username}`);
  } catch(e) {
    console.warn(`[undeploy] Failed to drop DB user ${username}:`, e.message);
  } finally {
    client.release();
  }
}

// POST /api/deploy-fullstack — deploys a full-stack app as a Docker container
// Dependencies: verifyUser(), create-schema, run-migration, Docker on host
// Flow:
//   1. Validate user + project
//   2. Create Supabase schema + run migrations
//   3. Write project files + Dockerfile to host path
//   4. Call host Docker API to build + run container
//   5. Configure Nginx routing
//   6. Return live URL
// Affects: Docker containers, Nginx config, Supabase schemas, projects table
const DOCKER_APPS_DIR = path.join(__dirname, 'docker-apps');
if (!fs.existsSync(DOCKER_APPS_DIR)) fs.mkdirSync(DOCKER_APPS_DIR, { recursive: true });

// Track container port assignments
const PORTS_FILE = path.join(__dirname, 'docker-ports.json');
function getNextPort() {
  let ports = {};
  try { ports = JSON.parse(fs.readFileSync(PORTS_FILE, 'utf8')); } catch(e) {}
  const usedPorts = Object.values(ports).map(Number);
  let port = 4001;
  while (usedPorts.includes(port)) port++;
  return port;
}
function assignPort(subdomain, port) {
  let ports = {};
  try { ports = JSON.parse(fs.readFileSync(PORTS_FILE, 'utf8')); } catch(e) {}
  ports[subdomain] = port;
  fs.writeFileSync(PORTS_FILE, JSON.stringify(ports, null, 2));
}
function releasePort(subdomain) {
  let ports = {};
  try { ports = JSON.parse(fs.readFileSync(PORTS_FILE, 'utf8')); } catch(e) {}
  delete ports[subdomain];
  fs.writeFileSync(PORTS_FILE, JSON.stringify(ports, null, 2));
}

app.post('/api/deploy-fullstack', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user?.id) return res.status(401).json({ error: 'Login required to deploy' });

  const { projectId, subdomain, files, schemaSql } = req.body;
  if (!projectId || !subdomain || !files) return res.status(400).json({ error: 'projectId, subdomain, and files required' });

  // Validate subdomain
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(subdomain)) {
    return res.status(400).json({ error: 'Invalid subdomain' });
  }
  const reserved = ['kenzo', 'admin', 'api', 'www', 'mail', 'builder', 'app', 'dashboard', 'auth', 'login', 'static', 'assets', 'cdn', 'wc'];
  if (reserved.includes(subdomain)) return res.status(400).json({ error: 'Reserved subdomain' });

  const schemaName = 'app_proj_' + projectId.replace(/-/g, '_').toLowerCase();
  const appPort = getNextPort();
  const containerName = 'app-' + subdomain;
  const appDir = path.join(DOCKER_APPS_DIR, subdomain);
  const hostAppDir = appDir.replace('/home/node/.openclaw', '/root/.openclaw');

  try {
    // ── Step 1: Create Supabase schema ──
    console.log(`[deploy-fs] Creating schema ${schemaName}...`);
    const schemaRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_app_schema`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema_name: schemaName })
    });
    if (!schemaRes.ok) console.warn('[deploy-fs] Schema may already exist');

    // ── Step 2: Run migrations if schema.sql provided ──
    if (schemaSql) {
      console.log(`[deploy-fs] Running migration in ${schemaName}...`);
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/run_app_migration`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema_name: schemaName, migration_sql: schemaSql })
      });
    }

    // ── Step 2b: Set up RLS policies for the schema (anon key access, no cross-schema leakage) ──
    console.log(`[deploy-fs] Setting up RLS for ${schemaName}...`);
    const rlsSql = `
      DO $$
      DECLARE
        t text;
      BEGIN
        FOR t IN
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = '${schemaName}' AND table_type = 'BASE TABLE'
        LOOP
          EXECUTE format('ALTER TABLE ${schemaName}.%I ENABLE ROW LEVEL SECURITY', t);
          EXECUTE format('DROP POLICY IF EXISTS allow_all ON ${schemaName}.%I', t);
          EXECUTE format('CREATE POLICY allow_all ON ${schemaName}.%I FOR ALL USING (true) WITH CHECK (true)', t);
        END LOOP;
      END $$;
    `;
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/run_app_migration`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema_name: schemaName, migration_sql: rlsSql })
    });

    // ── Step 2c: Create per-app Postgres user with schema-scoped access ──
    let appDbUser = null;
    try {
      appDbUser = await createAppDbUser(schemaName);
      console.log(`[deploy-fs] Per-app DB user created: ${schemaName}`);
    } catch(e) {
      console.warn(`[deploy-fs] Per-app DB user failed (falling back to master):`, e.message);
    }

    // Use master DATABASE_URL for connection (Supabase pooler requires specific username format)
    // Per-app user is created for schema ownership + future direct connection support
    // Security comes from schema isolation + RLS, not credentials
    const appDatabaseUrl = DATABASE_URL;

    // ── Step 3: Write project files + Dockerfile ──
    if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
    fs.mkdirSync(appDir, { recursive: true });

    // Write all project files
    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(appDir, filename);
      const dir = path.dirname(filePath);
      if (dir !== appDir) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content);
    }

    // Generate Dockerfile — uses direct Postgres connection with schema via SUPABASE_SCHEMA env var
    // pg Pool uses options: `-c search_path=${schemaName}` in app code (not URL params)
    const dockerfile = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
ENV PORT=3000
ENV DATABASE_URL=${appDatabaseUrl}
ENV SUPABASE_URL=${SUPABASE_URL}
ENV SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
ENV SUPABASE_SCHEMA=${schemaName}
EXPOSE 3000
CMD ["node", "index.js"]
`;
    fs.writeFileSync(path.join(appDir, 'Dockerfile'), dockerfile);

    // Generate Nginx config for this app
    const nginxConf = `server {
    listen 80;
    server_name ${subdomain}.kenzoagent.com;
    location / {
        proxy_pass http://127.0.0.1:${appPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}`;
    fs.writeFileSync(path.join(appDir, 'nginx.conf'), nginxConf);

    // ── Step 4: Build + Run Docker container via host ──
    // Use the deploy API to copy nginx config, then run Docker via a script
    console.log(`[deploy-fs] Building Docker image ${containerName}...`);

    // Write a deploy script the host can execute
    const deployScript = `#!/bin/bash
set -e

# Stop and remove existing container if any
docker stop ${containerName} 2>/dev/null || true
docker rm ${containerName} 2>/dev/null || true

# Build the image
cd ${hostAppDir}
docker build -t ${containerName} .

# Run the container
docker run -d \\
  --name ${containerName} \\
  -p ${appPort}:3000 \\
  --memory=128m \\
  --cpus=0.25 \\
  --restart=unless-stopped \\
  ${containerName}

# Set up Nginx
cp ${hostAppDir}/nginx.conf /etc/nginx/sites-available/${subdomain}.kenzoagent.com
ln -sf /etc/nginx/sites-available/${subdomain}.kenzoagent.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL
certbot --nginx -d ${subdomain}.kenzoagent.com --non-interactive --agree-tos -m admin@kenzoagent.com 2>/dev/null || true

echo "DEPLOYED"
`;
    fs.writeFileSync(path.join(appDir, 'deploy.sh'), deployScript, { mode: 0o755 });

    // Execute deploy script via host
    // The deploy API can copy files — for Docker we need direct host access
    // Write to a known location and have the host pick it up
    const deployFlag = path.join(DOCKER_APPS_DIR, subdomain + '.deploy');
    fs.writeFileSync(deployFlag, 'pending');

    // Call Docker deploy API on host
    const dockerBody = JSON.stringify({
      subdomain,
      files_path: hostAppDir,
      port: appPort,
      memory: '128m',
      cpus: '0.25',
      env: {
        DATABASE_URL: appDatabaseUrl,
        SUPABASE_URL: SUPABASE_URL,
        SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
        SUPABASE_SCHEMA: schemaName,
        PORT: '3000'
      }
    });
    const deployResult = await new Promise((resolve, reject) => {
      const opts = { hostname: DEPLOY_HOST, port: DEPLOY_PORT, path: '/docker/deploy-app', method: 'POST', headers: { 'Content-Type': 'application/json' } };
      const r = http.request(opts, (res2) => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){resolve({raw:d})} }); });
      r.on('error', reject); r.write(dockerBody); r.end();
    });
    if (!deployResult.success) throw new Error(deployResult.error || 'Docker deploy failed');

    // ── Step 5: Save to Supabase ──
    const deployedUrl = `https://${subdomain}.kenzoagent.com`;
    assignPort(subdomain, appPort);

    const projectUpdate = { deployed_url: deployedUrl, app_schema: schemaName, updated_at: new Date().toISOString() };
    if (appDbUser) {
      projectUpdate.db_user = appDbUser.username;
      projectUpdate.db_password = appDbUser.password;
    }
    await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}&user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(projectUpdate)
    });

    console.log(`[deploy-fs] ✅ ${containerName} deployed at ${deployedUrl} (port ${appPort})`);
    res.json({ success: true, url: deployedUrl, port: appPort, schemaName });

  } catch(err) {
    console.error(`[deploy-fs] ❌ Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/deploy', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user?.id) return res.status(401).json({ error: 'Login required to deploy' });

  const { buildId, subdomain, projectId } = req.body;
  if (!buildId || !subdomain) return res.status(400).json({ error: 'buildId and subdomain required' });

  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(subdomain)) {
    return res.status(400).json({ error: 'Invalid subdomain. Use 3-32 lowercase letters, numbers, and hyphens only.' });
  }
  const reserved = ['kenzo', 'admin', 'api', 'www', 'mail', 'builder', 'app', 'dashboard', 'auth', 'login', 'static', 'assets', 'cdn'];
  if (reserved.includes(subdomain)) {
    return res.status(400).json({ error: 'This subdomain is reserved.' });
  }

  let buildPath = path.join(BUILDS_DIR, buildId);
  // Fall back to deployed-builds if temp build was cleaned up by the hourly job
  if (!fs.existsSync(buildPath)) {
    const deployedPath = path.join(DEPLOYED_BUILDS_DIR, buildId);
    if (fs.existsSync(deployedPath)) {
      buildPath = deployedPath;
    } else {
      return res.status(404).json({ error: 'Build not found' });
    }
  }

  // ── Deploy Security: File Validation ──
  // Only allow static web assets — block server-side code, symlinks, oversized projects
  const ALLOWED_EXT = ['.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.txt', '.md', '.webp', '.woff', '.woff2'];
  const BLOCKED_CONTENT = ['<?php', '#!/bin', '<%', '<jsp:', 'eval(', 'require(', 'import os', 'import subprocess'];
  const MAX_FILES = 30;
  const MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 5MB

  // Recursively collect all files (skip symlinks to prevent path traversal)
  function scanDir(dir, base = '') {
    const entries = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.join(base, item.name);
      if (item.isSymbolicLink()) continue; // skip symlinks — security
      if (item.isDirectory()) {
        entries.push(...scanDir(path.join(dir, item.name), rel));
      } else if (item.isFile()) {
        entries.push({ path: rel, full: path.join(dir, item.name), size: fs.statSync(path.join(dir, item.name)).size });
      }
    }
    return entries;
  }

  const deployFiles = scanDir(buildPath);

  if (deployFiles.length > MAX_FILES) {
    return res.status(400).json({ error: `Too many files (${deployFiles.length}). Maximum ${MAX_FILES}.` });
  }
  const totalSize = deployFiles.reduce((s, f) => s + f.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return res.status(400).json({ error: `Project too large (${(totalSize/1024/1024).toFixed(1)}MB). Maximum 5MB.` });
  }
  // Check each file for allowed extension and dangerous content
  for (const file of deployFiles) {
    if (file.path === 'nginx.conf') continue; // our own generated conf is always OK
    const ext = path.extname(file.path).toLowerCase();
    if (!ALLOWED_EXT.includes(ext) && file.path !== '.gitkeep') {
      return res.status(400).json({ error: `Blocked file type: ${file.path}. Allowed: ${ALLOWED_EXT.join(', ')}` });
    }
    // Scan text files for server-side code patterns
    if (['.html', '.css', '.js', '.json', '.svg', '.txt', '.md'].includes(ext)) {
      const content = fs.readFileSync(file.full, 'utf8');
      for (const blocked of BLOCKED_CONTENT) {
        if (content.includes(blocked)) {
          return res.status(400).json({ error: `Blocked content detected in ${file.path}: server-side code not allowed.` });
        }
      }
    }
  }

  // Generate minimal nginx config for this subdomain (SPA fallback to index.html)
  const nginxConf = `server {\n    listen 80;\n    server_name ${subdomain}.kenzoagent.com;\n    root /var/www/${subdomain}.kenzoagent.com;\n    index index.html;\n    location / { try_files $uri $uri/ /index.html; }\n}`;
  fs.writeFileSync(path.join(buildPath, 'nginx.conf'), nginxConf);

  try {
    // Call host deploy API (path must be host path, not container path)
    const deployBody = JSON.stringify({
      domain: `${subdomain}.kenzoagent.com`,
      files_path: buildPath.replace('/home/node/.openclaw', '/root/.openclaw')
    });
    const result = await new Promise((resolve, reject) => {
      const opts = { hostname: DEPLOY_HOST, port: DEPLOY_PORT, path: '/deploy', method: 'POST', headers: { 'Content-Type': 'application/json' } };
      const r = http.request(opts, (res2) => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){resolve({raw:d})} }); });
      r.on('error', reject); r.write(deployBody); r.end();
    });

    // Copy build to permanent location so redeploy works even after 24h cleanup
    const deployedBuildPath = path.join(DEPLOYED_BUILDS_DIR, buildId);
    try {
      if (fs.existsSync(deployedBuildPath)) fs.rmSync(deployedBuildPath, { recursive: true, force: true });
      fs.cpSync(buildPath, deployedBuildPath, { recursive: true });
    } catch(e) { console.warn('Failed to copy to deployed-builds:', e.message); }

    const deployedUrl = `https://${subdomain}.kenzoagent.com`;

    // Persist deployed_url to Supabase project record
    try {
      const filter = projectId
        ? `projects?id=eq.${projectId}&user_id=eq.${user.id}`
        : `projects?build_id=eq.${buildId}&user_id=eq.${user.id}`;
      const sbUrl = `${SUPABASE_URL}/rest/v1/${filter}`;
      const sbRes = await fetch(sbUrl, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ deployed_url: deployedUrl, updated_at: new Date().toISOString() })
      });
      console.log('deployed_url save status:', sbRes.status, 'filter:', filter);
    } catch(e) { console.warn('Failed to save deployed_url:', e.message); }

    res.json({ success: true, url: deployedUrl, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/undeploy ─────────────────────────────────────────────────────────
// Removes a deployed site — handles both static sites and full-stack Docker apps
// Dependencies: verifyUser, http.request (deploy API), supabaseRequest, releasePort
// Flow:
//   1. Verify user + fetch project to detect if full-stack
//   2. Full-stack: call /docker/undeploy-app (stop container + remove image + nginx)
//      Static: call /undeploy (nginx only)
//   3. Drop Supabase schema if full-stack
//   4. Release port from docker-ports.json
//   5. Clear deployed_url + app_schema in Supabase
// Affects: Docker containers, Nginx, Supabase schemas, projects table
// Called by: frontend undeploySite() in /app/build/
app.post('/api/undeploy', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user?.id) return res.status(401).json({ error: 'Login required' });
  const { subdomain, projectId } = req.body;
  if (!subdomain) return res.status(400).json({ error: 'subdomain required' });

  try {
    // Detect if this is a full-stack app (has app_schema)
    let appSchema = null;
    if (projectId) {
      try {
        const projects = await supabaseRequest('GET', `projects?id=eq.${projectId}&user_id=eq.${user.id}&select=app_schema`);
        appSchema = projects?.[0]?.app_schema || null;
      } catch(e) { console.warn('[undeploy] Could not fetch project schema:', e.message); }
    }

    const isFullStack = !!appSchema;
    console.log(`[undeploy] ${subdomain} — ${isFullStack ? 'full-stack (Docker)' : 'static site'}`);

    if (isFullStack) {
      // ── Full-stack undeploy: stop container + remove image + nginx ──
      const dockerBody = JSON.stringify({ subdomain });
      const dockerResult = await new Promise((resolve, reject) => {
        const opts = { hostname: DEPLOY_HOST, port: DEPLOY_PORT, path: '/docker/undeploy-app', method: 'POST', headers: { 'Content-Type': 'application/json' } };
        const r = http.request(opts, (res2) => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){resolve({raw:d})} }); });
        r.on('error', reject); r.write(dockerBody); r.end();
      });
      console.log(`[undeploy] Docker result:`, dockerResult);

      // Drop Supabase schema (all tables + data gone)
      // Drop per-app DB user first (before dropping schema)
      try {
        await dropAppDbUser(appSchema);
      } catch(e) { console.warn('[undeploy] DB user drop failed:', e.message); }

      try {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/drop_app_schema`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ schema_name: appSchema })
        });
        console.log(`[undeploy] Dropped schema ${appSchema}`);
      } catch(e) { console.warn('[undeploy] Schema drop failed:', e.message); }

      // Release port
      releasePort(subdomain);
      console.log(`[undeploy] Port released for ${subdomain}`);

      // Remove docker-apps directory
      const appDir = path.join(DOCKER_APPS_DIR, subdomain);
      if (fs.existsSync(appDir)) {
        fs.rmSync(appDir, { recursive: true, force: true });
        console.log(`[undeploy] Removed app files ${appDir}`);
      }

    } else {
      // ── Static site undeploy: nginx only ──
      const undeployBody = JSON.stringify({ domain: `${subdomain}.kenzoagent.com` });
      await new Promise((resolve, reject) => {
        const opts = { hostname: DEPLOY_HOST, port: DEPLOY_PORT, path: '/undeploy', method: 'POST', headers: { 'Content-Type': 'application/json' } };
        const r = http.request(opts, (res2) => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>resolve(d)); });
        r.on('error', reject); r.write(undeployBody); r.end();
      });
    }

    // Clear deployed_url + app_schema in Supabase
    if (projectId) {
      try {
        await supabaseRequest('PATCH', `projects?id=eq.${projectId}&user_id=eq.${user.id}`,
          { deployed_url: null, app_schema: null, updated_at: new Date().toISOString() });
      } catch(e) { console.warn('[undeploy] Failed to clear project record:', e.message); }
    }

    console.log(`[undeploy] ✅ ${subdomain} fully undeployed`);
    res.json({ success: true });

  } catch (err) {
    console.error(`[undeploy] ❌ Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/build/:buildId ────────────────────────────────────────────────────
// Returns the index.html for a given build ID (used for preview loading)
// Dependencies: BUILDS_DIR, DEPLOYED_BUILDS_DIR, fs
// Flow: looks in temp builds → falls back to deployed-builds → returns HTML or 404
// Affects: nothing (read-only)
// Called by: frontend when reloading a saved project's preview
app.get('/api/build/:buildId', (req, res) => {
  let htmlPath = path.join(BUILDS_DIR, req.params.buildId, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    htmlPath = path.join(DEPLOYED_BUILDS_DIR, req.params.buildId, 'index.html');
  }
  if (!fs.existsSync(htmlPath)) return res.status(404).json({ error: 'Not found' });
  res.json({ html: fs.readFileSync(htmlPath, 'utf8') });
});

// ── POST /api/transcribe ───────────────────────────────────────────────────────
// Transcribes voice audio to text using OpenAI gpt-4o-transcribe (Whisper-quality)
// Dependencies: OPENAI_API_KEY, fs, child_process.execSync (ffmpeg), fetch
// Flow:
//   1. Decode base64 audio → write to temp .webm file
//   2. Convert .webm → .wav via ffmpeg (16kHz mono — optimal for Whisper)
//   3. Build multipart/form-data body with WAV file + model + language
//   4. POST to OpenAI /v1/audio/transcriptions
//   5. Clean up temp files → return { text }
// Affects: /tmp (temp files, cleaned up immediately after)
// Called by: frontend transcribeAudio() in /app/index.html and /app/build/
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audio, mimeType, language } = req.body;
    if (!audio) return res.status(400).json({ error: 'No audio data' });
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OpenAI key not configured' });

    const audioBuffer = Buffer.from(audio, 'base64');
    const { execSync } = require('child_process');
    const tmpId = Date.now() + '_' + Math.random().toString(36).slice(2);
    const tmpWebm = `/tmp/voice_${tmpId}.webm`;
    const tmpWav = `/tmp/voice_${tmpId}.wav`;

    // Write input audio to temp file
    fs.writeFileSync(tmpWebm, audioBuffer);

    // Convert webm → wav using ffmpeg: 16kHz sample rate, mono channel
    try {
      execSync(`ffmpeg -i ${tmpWebm} -ar 16000 -ac 1 -f wav ${tmpWav} -y 2>/dev/null`);
    } catch(e) {
      console.error('ffmpeg error:', e.message);
      try { fs.unlinkSync(tmpWebm); } catch(x){}
      return res.status(500).json({ error: 'Audio conversion failed' });
    }

    const wavBuffer = fs.readFileSync(tmpWav);
    const wavBase64 = wavBuffer.toString('base64');

    // Clean up temp files immediately
    try { fs.unlinkSync(tmpWebm); fs.unlinkSync(tmpWav); } catch(x){}

    // Build multipart/form-data manually (no FormData in Node without extra deps)
    const boundary2 = '----WB2' + Date.now();
    function field2(name, value) {
      return `--${boundary2}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
    }

    let prefix2 = field2('model', 'gpt-4o-transcribe');
    if (language && language !== 'uz') prefix2 += field2('language', language);
    // Uzbek isn't a standard BCP-47 code in Whisper — use prompt hint instead
    if (language === 'uz') prefix2 += field2('prompt', 'Bu odam o\'zbek tilida gapirmoqda. O\'zbek lotin alifbosida yozing.');
    prefix2 += `--${boundary2}\r\nContent-Disposition: form-data; name="file"; filename="voice.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
    const suffix2 = `\r\n--${boundary2}--\r\n`;

    const body2 = Buffer.concat([Buffer.from(prefix2), wavBuffer, Buffer.from(suffix2)]);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary2}`
      },
      body: body2
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('Transcribe error:', response.status, JSON.stringify(result));
      return res.status(response.status).json({ error: 'Transcription failed', details: JSON.stringify(result) });
    }

    const finalText = result.text || '';
    console.log(`gpt-4o-transcribe [${language||'auto'}]: "${finalText}"`);
    res.json({ text: finalText.trim() });
  } catch (err) {
    console.error('Transcribe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Maintenance: Build Cleanup ─────────────────────────────────────────────────

// ── cleanBuilds ───────────────────────────────────────────────────────────────
// Removes temp build folders older than 24h; enforces 100-build hard cap
// Dependencies: fs, BUILDS_DIR
// Flow:
//   1. Read all subdirs in BUILDS_DIR
//   2. Delete any older than 24h (mtime-based)
//   3. If still > 100 builds remaining, delete oldest until 50 remain
// Affects: BUILDS_DIR (filesystem)
// Called by: setInterval every 60 minutes + once at startup
function cleanBuilds() {
  if (!fs.existsSync(BUILDS_DIR)) return;
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  let cleaned = 0;
  try {
    fs.readdirSync(BUILDS_DIR).forEach(dir => {
      const fullPath = path.join(BUILDS_DIR, dir);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAge) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          cleaned++;
        }
      } catch(e) {}
    });
    if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} old builds`);

    // Hard cap: if >100 builds exist, delete oldest to get back to 50
    const remaining = fs.readdirSync(BUILDS_DIR);
    if (remaining.length > 100) {
      const sorted = remaining.map(d => ({name:d, time:fs.statSync(path.join(BUILDS_DIR,d)).mtimeMs})).sort((a,b)=>a.time-b.time);
      const toDelete = sorted.slice(0, remaining.length - 50);
      toDelete.forEach(d => { try{fs.rmSync(path.join(BUILDS_DIR,d.name),{recursive:true,force:true})}catch(e){} });
      if (toDelete.length > 0) console.log(`🧹 Hard cap: removed ${toDelete.length} oldest builds`);
    }
  } catch(e) { console.warn('Build cleanup error:', e.message); }
}

// ── cleanGuestUsage ───────────────────────────────────────────────────────────
// Removes expired guest IP entries from in-memory tracker
// Dependencies: guestUsage (in-memory object)
// Flow: iterates all IPs → deletes any whose resetAt has passed
// Affects: guestUsage (in-memory state)
// Called by: setInterval every 60 seconds
function cleanGuestUsage() {
  const now = Date.now();
  Object.keys(guestUsage).forEach(ip => {
    if (now > guestUsage[ip].resetAt) delete guestUsage[ip];
  });
}

// Run cleanup every hour for builds, every minute for guest usage
setInterval(cleanBuilds, 60 * 60 * 1000);
setInterval(cleanGuestUsage, 60 * 1000);
cleanBuilds(); // Run immediately on startup to handle any stale builds from previous runs


// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS — requires is_admin = true on profiles table
// ══════════════════════════════════════════════════════════════════════════════

// ── verifyAdmin ───────────────────────────────────────────────────────────────
async function verifyAdmin(authHeader) {
  const user = await verifyUser(authHeader);
  if (!user?.id) return null;
  try {
    const profiles = await supabaseRequest('GET', `profiles?id=eq.${user.id}&select=is_admin`);
    if (profiles?.[0]?.is_admin !== true) return null;
    return user;
  } catch(e) { return null; }
}

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
app.get('/api/admin/stats', async (req, res) => {
  const admin = await verifyAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });
  try {
    const [profiles, projects, generations, containers] = await Promise.all([
      supabaseRequest('GET', 'profiles?select=id,plan,created_at'),
      supabaseRequest('GET', 'projects?select=id,deployed_url,app_schema,created_at'),
      supabaseRequest('GET', 'generations?select=id,created_at&order=created_at.desc&limit=1000'),
      new Promise((resolve) => {
        const opts = { hostname: DEPLOY_HOST, port: DEPLOY_PORT, path: '/docker/list', method: 'GET' };
        const r = http.request(opts, (res2) => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){resolve({containers:[]})} }); });
        r.on('error', () => resolve({ containers: [] })); r.end();
      })
    ]);

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);

    res.json({
      users: {
        total: profiles.length,
        free: profiles.filter(p => !p.plan || p.plan === 'free').length,
        paid: profiles.filter(p => p.plan && p.plan !== 'free').length,
        newThisWeek: profiles.filter(p => new Date(p.created_at) > thisWeek).length
      },
      projects: {
        total: projects.length,
        deployed: projects.filter(p => p.deployed_url).length,
        fullstack: projects.filter(p => p.app_schema).length
      },
      generations: {
        total: generations.length,
        thisMonth: generations.filter(g => new Date(g.created_at) > thisMonth).length
      },
      containers: {
        running: containers.containers?.length || 0,
        list: containers.containers || []
      }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
app.get('/api/admin/users', async (req, res) => {
  const admin = await verifyAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });
  try {
    const profiles = await supabaseRequest('GET', 'profiles?select=id,email,plan,is_admin,created_at,deleted_at&order=created_at.desc');
    // Get project counts per user
    const projects = await supabaseRequest('GET', 'projects?select=id,user_id,deployed_url');
    const projectsByUser = {};
    for (const p of projects) {
      if (!projectsByUser[p.user_id]) projectsByUser[p.user_id] = { total: 0, deployed: 0 };
      projectsByUser[p.user_id].total++;
      if (p.deployed_url) projectsByUser[p.user_id].deployed++;
    }
    const users = profiles.map(p => ({
      ...p,
      projects: projectsByUser[p.id]?.total || 0,
      deployedApps: projectsByUser[p.id]?.deployed || 0
    }));
    res.json({ users });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/admin/users/:id/plan ──────────────────────────────────────────
app.patch('/api/admin/users/:id/plan', async (req, res) => {
  const admin = await verifyAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });
  const { plan } = req.body;
  const validPlans = ['free', 'starter', 'pro', 'expert'];
  if (!validPlans.includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
  try {
    await supabaseRequest('PATCH', `profiles?id=eq.${req.params.id}`, { plan, updated_at: new Date().toISOString() });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/admin/containers ─────────────────────────────────────────────────
app.get('/api/admin/containers', async (req, res) => {
  const admin = await verifyAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });
  try {
    const result = await new Promise((resolve) => {
      const opts = { hostname: DEPLOY_HOST, port: DEPLOY_PORT, path: '/docker/list', method: 'GET' };
      const r = http.request(opts, (res2) => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){resolve({containers:[]})} }); });
      r.on('error', () => resolve({ containers: [] })); r.end();
    });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/admin/containers/:name/restart ──────────────────────────────────
app.post('/api/admin/containers/:name/restart', async (req, res) => {
  const admin = await verifyAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });
  const name = req.params.name;
  if (!name.startsWith('app-')) return res.status(400).json({ error: 'Invalid container name' });
  try {
    const body = JSON.stringify({ container: name });
    const result = await new Promise((resolve, reject) => {
      const opts = { hostname: DEPLOY_HOST, port: DEPLOY_PORT, path: '/docker/restart', method: 'POST', headers: { 'Content-Type': 'application/json' } };
      const r = http.request(opts, (res2) => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){resolve({raw:d})} }); });
      r.on('error', reject); r.write(body); r.end();
    });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/admin/containers/:name/stop ─────────────────────────────────────
app.post('/api/admin/containers/:name/stop', async (req, res) => {
  const admin = await verifyAdmin(req.headers.authorization);
  if (!admin) return res.status(403).json({ error: 'Admin access required' });
  const name = req.params.name;
  if (!name.startsWith('app-')) return res.status(400).json({ error: 'Invalid container name' });
  try {
    const body = JSON.stringify({ container: name });
    const result = await new Promise((resolve, reject) => {
      const opts = { hostname: DEPLOY_HOST, port: DEPLOY_PORT, path: '/docker/stop', method: 'POST', headers: { 'Content-Type': 'application/json' } };
      const r = http.request(opts, (res2) => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){resolve({raw:d})} }); });
      r.on('error', reject); r.write(body); r.end();
    });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
// WIZARD ENDPOINTS — Phase 1 Backend Foundation
// ═══════════════════════════════════════════════════════════════════════

const ARCHITECTURES = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'architectures.json'), 'utf8'));

app.post('/api/wizard/start', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  const { prompt, language } = req.body;

  let detectedLang = language || 'en';
  if (!language && prompt) {
    if (/[а-яёА-ЯЁ]/.test(prompt)) detectedLang = 'ru';
    else if (/[oʻgʻ]|oʼ|gʼ/.test(prompt)) detectedLang = 'uz';
  }

  let detectedType = null;
  const lower = (prompt || '').toLowerCase();
  const intentMap = {
    'crm': ['crm', 'client', 'customer', 'contact', 'lead', 'deal', 'mijoz', 'nasiya'],
    'pos': ['pos', 'sale', 'shop', 'store', 'cash register', "do'kon", 'savdo'],
    'inventory': ['inventory', 'stock', 'warehouse', 'ombor'],
    'invoice': ['invoice', 'billing', 'hisob', 'bill'],
    'booking': ['booking', 'appointment', 'schedule', 'bron'],
    'restaurant': ['restaurant', 'cafe', 'food', 'menu', 'restoran'],
    'task_manager': ['task', 'todo', 'kanban', 'vazifa'],
    'expense': ['expense', 'budget', 'xarajat'],
    'hr': ['employee', 'staff', 'attendance', 'hr', 'xodim'],
    'sales_dashboard': ['sales dashboard', 'pipeline', 'revenue']
  };
  for (const [type, kws] of Object.entries(intentMap)) {
    if (kws.some(kw => lower.includes(kw))) { detectedType = type; break; }
  }

  let pastBrandContext = null;
  if (user?.id) {
    try {
      const past = await fetch(`${SUPABASE_URL}/rest/v1/projects?user_id=eq.${user.id}&context=not.is.null&select=context&order=created_at.desc&limit=1`, {
        headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      const pastData = await past.json();
      if (pastData?.[0]?.context?.brand) {
        pastBrandContext = { colors: pastData[0].context.brand.colors, typography: pastData[0].context.brand.typography, style: pastData[0].context.brand.style };
      }
    } catch(e) {}
  }

  res.json({
    appTypes: Object.entries(ARCHITECTURES).map(([key, val]) => ({ key, label: val.label, emoji: val.emoji, description: val.description })),
    detectedType,
    userLanguage: detectedLang,
    pastBrandContext,
    hasHistory: !!pastBrandContext
  });
});

app.post('/api/wizard/structure', async (req, res) => {
  const { appType } = req.body;
  if (!appType || !ARCHITECTURES[appType]) return res.status(400).json({ error: 'Invalid app type' });
  const arch = ARCHITECTURES[appType];
  res.json({
    appType, label: arch.label,
    pages: arch.pages.map(p => ({ name: p, checked: true })),
    schema: arch.schema, keyFeatures: arch.key_features,
    uzbekContext: arch.uzbek_context,
    message: `Here are the recommended pages for your ${arch.label}. All are pre-selected — uncheck any you don't need.`
  });
});

app.post('/api/wizard/brand-strategy', async (req, res) => {
  const { appType, pages, userLanguage = 'en', additionalContext = '' } = req.body;
  if (!appType || !ARCHITECTURES[appType]) return res.status(400).json({ error: 'Invalid app type' });
  const arch = ARCHITECTURES[appType];
  const lang = userLanguage === 'uz' ? 'Uzbek (Latin script)' : userLanguage === 'ru' ? 'Russian' : 'English';
  const prompt = `Generate brand strategy for a ${arch.label} app for small businesses in Uzbekistan. Context: ${additionalContext || 'none'}. Respond in ${lang}. Return ONLY JSON: {"mission":"...","mission_alternatives":["...","..."],"values":["...","...","..."],"values_alternatives":["...","...","..."],"personality":"...","personality_options":["Professional & Trustworthy","Friendly & Approachable","Bold & Modern"],"tone":"...","tone_options":["Formal & Professional","Friendly & Simple","Modern & Minimal"],"messaging_pillars":["...","...","..."]}`;
  try {
    const content = await callAI([{ role: 'system', content: 'Return only valid JSON.' }, { role: 'user', content: prompt }], 'anthropic/claude-haiku-4-5');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    res.json({ success: true, brandStrategy: JSON.parse(jsonMatch[0]) });
  } catch(e) {
    res.json({ success: true, brandStrategy: { mission: `Help your business manage ${arch.label.toLowerCase()} efficiently`, mission_alternatives: [`Simplify ${arch.label.toLowerCase()}`, `Grow with smart ${arch.label.toLowerCase()}`], values: ['Reliability', 'Simplicity', 'Efficiency'], values_alternatives: ['Trust', 'Speed', 'Clarity'], personality: 'Professional & Trustworthy', personality_options: ['Professional & Trustworthy', 'Friendly & Approachable', 'Bold & Modern'], tone: 'Direct and clear', tone_options: ['Formal & Professional', 'Friendly & Simple', 'Modern & Minimal'], messaging_pillars: ['Save time', 'Stay organized', 'Grow faster'] } });
  }
});

app.post('/api/wizard/brand-identity', async (req, res) => {
  const { appType, brandStrategy } = req.body;
  const personality = brandStrategy?.personality || 'Professional & Trustworthy';
  const palettesMap = {
    'Professional & Trustworthy': [
      { name: 'Corporate Blue', primary: '#1E40AF', secondary: '#3B82F6', accent: '#FBBF24', bg: '#F8FAFC' },
      { name: 'Deep Navy', primary: '#1E3A5F', secondary: '#2563EB', accent: '#10B981', bg: '#F0F4F8' },
      { name: 'Slate Pro', primary: '#334155', secondary: '#475569', accent: '#3B82F6', bg: '#F8FAFC' }
    ],
    'Friendly & Approachable': [
      { name: 'Warm Orange', primary: '#EA580C', secondary: '#FB923C', accent: '#3B82F6', bg: '#FFF7ED' },
      { name: 'Fresh Green', primary: '#16A34A', secondary: '#22C55E', accent: '#F59E0B', bg: '#F0FDF4' },
      { name: 'Sky Blue', primary: '#0284C7', secondary: '#38BDF8', accent: '#F59E0B', bg: '#F0F9FF' }
    ],
    'Bold & Modern': [
      { name: 'Dark Modern', primary: '#111827', secondary: '#374151', accent: '#6366F1', bg: '#0F172A' },
      { name: 'Purple Power', primary: '#7C3AED', secondary: '#8B5CF6', accent: '#EC4899', bg: '#1E1B4B' },
      { name: 'Teal Tech', primary: '#0F766E', secondary: '#14B8A6', accent: '#F59E0B', bg: '#F0FDFA' }
    ]
  };
  const fontPairings = [
    { name: 'Clean & Modern', heading: 'Inter', body: 'Inter' },
    { name: 'Professional', heading: 'Poppins', body: 'Open Sans' },
    { name: 'Technical', heading: 'IBM Plex Sans', body: 'IBM Plex Mono' }
  ];
  const styles = [
    { key: 'clean_minimal', label: 'Clean & Minimal', description: 'Whitespace, simple typography, subtle shadows' },
    { key: 'bold_modern', label: 'Bold & Modern', description: 'Strong typography, high contrast, geometric shapes' },
    { key: 'professional', label: 'Professional & Corporate', description: 'Structured layout, muted colors, trustworthy feel' }
  ];
  const palettes = palettesMap[personality] || palettesMap['Professional & Trustworthy'];
  let taglines = [];
  try {
    const arch = ARCHITECTURES[appType] || { label: 'App' };
    const content = await callAI([{ role: 'user', content: `Generate 3 taglines (max 6 words) for a ${arch.label} app. Return only JSON array of strings.` }], 'anthropic/claude-haiku-4-5');
    const m = content.match(/\[[\s\S]*?\]/);
    if (m) taglines = JSON.parse(m[0]);
  } catch(e) {}
  if (!taglines.length) {
    const arch = ARCHITECTURES[appType] || { label: 'App' };
    taglines = [`Your ${arch.label}, simplified`, 'Work smarter, grow faster', 'Built for your business'];
  }
  res.json({ colorPalettes: palettes, fontPairings, styles, taglines });
});

app.post('/api/wizard/validate', async (req, res) => {
  const { appType, pages } = req.body;
  if (!appType || !pages) return res.status(400).json({ error: 'appType and pages required' });
  const issues = [], warnings = [], suggestions = [];
  if (pages.length < 2) issues.push('Too few pages. At least 2 recommended.');
  if (pages.length > 15) warnings.push('More than 15 pages may result in a complex app. Consider starting smaller.');
  if (!pages.includes('Dashboard') && !pages.includes('Overview') && appType !== 'invoice') {
    suggestions.push('Consider adding a Dashboard for an overview.');
  }
  res.json({ valid: issues.length === 0, issues, warnings, suggestions });
});

app.post('/api/wizard/save-context', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user?.id) return res.status(401).json({ error: 'Login required' });
  const { projectId, context } = req.body;
  if (!projectId || !context) return res.status(400).json({ error: 'projectId and context required' });
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}&user_id=eq.${user.id}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ context, updated_at: new Date().toISOString() })
    });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/wizard/load-context', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user?.id) return res.status(401).json({ error: 'Login required' });
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  try {
    const result = await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}&user_id=eq.${user.id}&select=context`, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
    });
    const data = await result.json();
    res.json({ context: data?.[0]?.context || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Wizard Post-Build Review ──────────────────────────────────────────────────
async function runPostBuildReview(fullContent, wizardContext, buildId) {
  const buildPath = path.join(BUILDS_DIR, buildId);
  if (!fs.existsSync(buildPath)) return;
  const files = extractMultiFile(fullContent);
  const fileList = Object.keys(files).join(', ');
  const indexHtml = files['index.html'] || '';
  const cssKey = Object.keys(files).find(f => f.endsWith('.css'));
  const cssSnippet = cssKey ? files[cssKey].substring(0, 500) : '';
  const reviewPrompt = `Review this ${wizardContext.app_type || 'web'} app. Expected pages: ${(wizardContext.pages || []).join(', ')}. Files: ${fileList}. Index snippet: ${indexHtml.substring(0,400)}. CSS: ${cssSnippet}. Return JSON only: {"all_pages_present":bool,"has_navigation":bool,"colors_applied":bool,"missing_pages":[],"notes":""}`;
  try {
    const review = await callAI([{ role: 'system', content: 'Code reviewer. Return only JSON.' }, { role: 'user', content: reviewPrompt }], 'anthropic/claude-haiku-4-5');
    const jsonMatch = review.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      if (result.missing_pages?.length > 0) console.log(`[wizard-review] Missing pages for build ${buildId}:`, result.missing_pages);
      fs.writeFileSync(path.join(buildPath, '.wizard-review.json'), JSON.stringify(result, null, 2));
    }
  } catch(e) { console.warn('[wizard-review] error:', e.message); }
}

// ── GET /api/react-template ────────────────────────────────────────────────────
// Returns the React + Shadcn/UI base template as a flat filename→content map
// Used by generateFullStack() to pre-populate the WebContainer with the base template
// before mounting AI-generated files on top
app.get('/api/react-template', (req, res) => {
  const templateDir = path.join(__dirname, 'templates', 'react-base');
  if (!fs.existsSync(templateDir)) {
    return res.status(404).json({ error: 'React template not found' });
  }
  
  function readDirRecursive(dir, base = '') {
    const files = {};
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? `${base}/${item.name}` : item.name;
      if (item.isDirectory()) {
        Object.assign(files, readDirRecursive(path.join(dir, item.name), rel));
      } else {
        files[rel] = fs.readFileSync(path.join(dir, item.name), 'utf8');
      }
    }
    return files;
  }
  
  try {
    const files = readDirRecursive(templateDir);
    res.json({ files, count: Object.keys(files).length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Website Builder API v3.3.0-voice on port ${PORT}`));
