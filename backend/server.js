const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors({
  origin: [
    'https://builder.kenzoagent.com',
    'http://localhost:3000',
    'http://localhost:3500'
  ]
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 30,                    // 30 requests per minute per IP
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,                     // 5 signups per hour per IP
  message: { error: 'Too many accounts created from this IP. Try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Load key from config.json (never hardcode or share in chat)
let OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
let OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
let SUPABASE_URL = '';
let SUPABASE_SERVICE_KEY = '';
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
} catch(e) { console.warn('supabase-config.json not found'); }

const DEPLOY_API = 'http://172.18.0.1:5000';

// Startup key audit
if (!OPENROUTER_API_KEY) console.error('❌ CRITICAL: OPENROUTER_API_KEY is missing — AI calls will fail!');
else console.log('✅ OpenRouter key loaded:', OPENROUTER_API_KEY.slice(0,20) + '...');
if (!OPENAI_API_KEY) console.warn('⚠️  OPENAI_API_KEY missing — voice transcription will fail');
else console.log('✅ OpenAI key loaded:', OPENAI_API_KEY.slice(0,20) + '...');

// ── Plan Limits (generations per month) ─────────────────────────────────────
const PLAN_LIMITS = {
  guest: 3,
  free: 5,
  starter: 50,
  pro: 200,
  expert: Infinity
};

// Admin accounts — unlimited access
const ADMIN_USERS = ['69ef123f-b5de-4d16-999d-aa1fef63001e'];

// ── Supabase helpers ────────────────────────────────────────────────────────
async function supabaseRequest(method, path, body, token) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${token || SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : undefined
  };
  Object.keys(headers).forEach(k => headers[k] === undefined && delete headers[k]);

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

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

async function getMonthlyUsage(userId) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/generations?select=id&user_id=eq.${userId}&created_at=gte.${startOfMonth.toISOString()}`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Prefer': 'count=exact' } }
    );
    const countHeader = res.headers.get('content-range');
    if (countHeader) {
      const match = countHeader.match(/\/(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }
    const data = await res.json();
    return Array.isArray(data) ? data.length : 0;
  } catch(e) { return 0; }
}

async function getUserPlan(userId) {
  // For now, all users are on free plan. When payment is added, check subscriptions table.
  return 'free';
}

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

// ── Auto-confirm signup endpoint ─────────────────────────────────────────────
app.post('/api/auth/signup', signupLimiter, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    // Use Supabase Admin API to create user with auto-confirm
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
        email_confirm: true,
        user_metadata: { full_name: name || email.split('@')[0] }
      })
    });
    const userData = await createRes.json();
    if (userData.error || userData.msg) {
      return res.status(400).json({ error: userData.error || userData.msg || 'Signup failed' });
    }

    // Now sign them in to get a session token
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

// ── Usage check endpoint ────────────────────────────────────────────────────
app.get('/api/usage', async (req, res) => {
  const user = await verifyUser(req.headers.authorization);
  if (!user) return res.json({ plan: 'guest', used: 0, limit: PLAN_LIMITS.guest });

  const plan = await getUserPlan(user.id);
  const used = await getMonthlyUsage(user.id);
  const limit = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  res.json({ plan, used, limit: limit === Infinity ? 'unlimited' : limit, remaining: limit === Infinity ? 'unlimited' : Math.max(0, limit - used) });
});
const BUILDS_DIR = path.join(__dirname, 'builds');
const PORT = process.env.PORT || 3500;

if (!fs.existsSync(BUILDS_DIR)) fs.mkdirSync(BUILDS_DIR, { recursive: true });

// In-memory job store
const jobs = {};
const guestUsage = {}; // IP -> { count, resetAt }

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

function extractMultiFile(response) {
  // Try multi-file format: --- FILE: filename ---
  const filePattern = /---\s*FILE:\s*(.+?)\s*---\n([\s\S]*?)(?=---\s*FILE:|$)/gi;
  const files = {};
  let match;
  while ((match = filePattern.exec(response)) !== null) {
    const filename = match[1].trim().toLowerCase();
    const content = match[2].trim();
    if (filename && content) files[filename] = content;
  }
  // If we found files, return them
  if (Object.keys(files).length > 0) return files;
  // Fallback: try to extract from markdown code fences
  const fencePattern = /```(?:\w+)?\s*\n?\/\/\s*(\S+)\n([\s\S]*?)```/g;
  while ((match = fencePattern.exec(response)) !== null) {
    const filename = match[1].trim();
    const content = match[2].trim();
    if (filename && content) files[filename] = content;
  }
  if (Object.keys(files).length > 0) return files;
  // Final fallback: single file
  const html = extractCode(response);
  return { 'index.html': html };
}

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

// ── Streaming AI call ───────────────────────────────────────────────────────
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
      buffer = lines.pop() || '';
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
        } catch(e) { /* skip parse errors in stream */ }
      }
    });
    res.on('end', () => {
      // Process remaining buffer
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

// ── Streaming generate endpoint (SSE) ───────────────────────────────────────
app.post('/api/generate-stream', async (req, res) => {
  const { prompt, model = 'anthropic/claude-sonnet-4.6', existingCode, image, imageMimeType } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  // Input size limits
  if (prompt.length > 5000) return res.status(400).json({ error: 'Prompt too long. Maximum 5000 characters.' });
  if (existingCode && existingCode.length > 200000) return res.status(400).json({ error: 'Code too large. Maximum 200KB.' });
  if (image && image.length > 5000000) return res.status(400).json({ error: 'Image too large. Maximum 5MB.' });

  // Check usage limits
  const user = await verifyUser(req.headers.authorization);
  let userId = null;
  if (user) {
    userId = user.id;
    if (ADMIN_USERS.includes(userId)) { /* admin bypass */ }
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
    } // close else for admin bypass
  } else {
    // Guest: server-side IP-based limit
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    if (!guestUsage[ip]) guestUsage[ip] = { count: 0, resetAt: Date.now() + 24 * 60 * 60 * 1000 };
    if (Date.now() > guestUsage[ip].resetAt) {
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

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

  // Build user message — support image attachment
  const isMultiFile = existingCode && existingCode.includes('--- FILE:');
  let userContent;
  if (image) {
    const textPart = existingCode
      ? `Current project files:\n${existingCode}\n\nModify based on the attached image and instruction: ${prompt}`
      : `Create a website based on the attached image and instruction: ${prompt}`;
    userContent = [
      { type: 'text', text: textPart },
      { type: 'image_url', image_url: { url: `data:${imageMimeType || 'image/jpeg'};base64,${image}` } }
    ];
  } else if (existingCode) {
    userContent = isMultiFile
      ? `Current project files:\n${existingCode}\n\nModify: ${prompt}\n\nReturn ALL files in the project (modified and unmodified) using the --- FILE: filename --- format.`
      : `Current HTML:\n${existingCode}\n\nModify: ${prompt}`;
  } else {
    userContent = `Create a website: ${prompt}`;
  }
  messages.push({ role: 'user', content: userContent });

  const startTime = Date.now();
  console.log(`[stream] model=${model} user=${userId?.slice(0,8)||'guest'} img=${!!image} prompt="${prompt.slice(0,60)}"`);

  callAIStream(messages, model,
    // onChunk
    (delta, fullContent) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', delta, length: fullContent.length })}\n\n`);
    },
    // onDone
    (fullContent) => {
      const files = extractMultiFile(fullContent);
      const html = files['index.html'] || extractCode(fullContent);

      // Save build (all files)
      const buildId = crypto.randomUUID();
      const buildPath = path.join(BUILDS_DIR, buildId);
      fs.mkdirSync(buildPath, { recursive: true });
      for (const [filename, content] of Object.entries(files)) {
        const filePath = path.join(buildPath, filename);
        const dir = path.dirname(filePath);
        if (dir !== buildPath) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content);
      }

      // Log generation
      if (userId) logGeneration(userId, model, prompt);

      const duration = Date.now() - startTime;
      const fileCount = Object.keys(files).length;
      console.log(`[stream] done ${fileCount} files, ${html.length} chars index.html in ${duration}ms`);

      res.write(`data: ${JSON.stringify({ type: 'done', html, files, buildId, duration })}\n\n`);
      res.end();
    },
    // onError
    (err) => {
      console.error(`[stream] error:`, err.message);
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  );

  // Handle client disconnect
  req.on('close', () => { /* client disconnected */ });
});

// ── Brainstorm System Prompt ────────────────────────────────────────────────
const BRAINSTORM_PROMPT = `You are a senior product designer and web strategist. Your job is to help the user plan their website BEFORE any code is written.

## YOUR THINKING FRAMEWORK

### Phase 1: Discovery (Ask these first)
- WHO is this website for? (target audience, demographics, behavior)
- WHAT is the primary goal? (sell, inform, capture leads, showcase, launch?)
- WHY would someone visit? (pain point, desire, curiosity)
- WHERE will traffic come from? (social, search, ads, direct?)

### Phase 2: Strategy (After understanding basics)
Apply these frameworks:
- **Jobs To Be Done**: What job is the visitor hiring this website to do?
- **Value Proposition Canvas**: What pain does it relieve? What gain does it create?
- **AIDA**: How will the page Attract Attention → Build Interest → Create Desire → Drive Action?

### Phase 3: Structure (When goals are clear)
Recommend:
- **Page sections** in order (Hero, Problem, Solution, Features, Social Proof, Pricing, CTA, Footer)
- **Content strategy** for each section (what to say, not how it looks)
- **Key copy elements**: headline, subheadline, CTA text
- **Technical decisions**: single page vs multi-page, forms needed, integrations

### Phase 4: MVP Definition
- Strip to the ESSENTIAL sections only
- Define what "done" looks like for v1
- List what to add later (Phase 2 features)

## YOUR BEHAVIOR RULES

1. **Ask 2-3 focused questions at a time**, never more. Don't overwhelm.
2. **Be opinionated** — don't just ask, SUGGEST. "For a coffee shop, I'd recommend X because Y. What do you think?"
3. **Push back on bad ideas** gently but firmly. "That could work, but [better approach] because [reason]."
4. **Keep it conversational** — no bullet-point walls. Write like a smart colleague.
5. **Track progress mentally** — when you have enough info, say so clearly.
6. **When ready, output the final plan** in this exact format:

---
## 🎯 WEBSITE PLAN

**Project:** [Name]
**Goal:** [One sentence]
**Audience:** [Who]

### Sections:
1. **Hero** — [what it says, what CTA]
2. **Problem** — [what pain point]
3. **Solution** — [how product/service solves it]
... etc

### Key Copy:
- Headline: "[suggested headline]"
- Subheadline: "[suggested subheadline]"
- CTA: "[button text]"

### Tech Notes:
- [any relevant technical decisions]

**Ready to build? Click "Build it" to generate this website.**
---

7. **NEVER generate HTML or code.** You are a strategist, not a coder.
8. **CRITICAL: Respond in the SAME language the user writes in.** If the user writes in English, you MUST reply in English. If Uzbek, reply in Uzbek. If Russian, reply in Russian. NEVER switch languages unless the user switches first.
9. **Be concise.** Short paragraphs. No fluff.`;

// ── Brainstorm endpoint (conversational, no HTML generation) ───────────────
app.post('/api/brainstorm', async (req, res) => {
  const { messages: chatHistory = [], model = 'anthropic/claude-sonnet-4.6' } = req.body;
  if (!chatHistory.length) return res.status(400).json({ error: 'Messages required' });

  // Input size limits
  if (chatHistory.length > 20) return res.status(400).json({ error: 'Too many messages. Maximum 20 per conversation.' });
  for (const msg of chatHistory) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    if (content.length > 50000) return res.status(400).json({ error: 'Message too large.' });
  }

  // Debug: check if last message has image
  const lastMsg = chatHistory[chatHistory.length - 1];
  const hasImage = Array.isArray(lastMsg?.content) && lastMsg.content.some(c => c.type === 'image_url');
  if (hasImage) console.log('[brainstorm] image attached, model=', model);

  try {
    const messages = [
      { role: 'system', content: BRAINSTORM_PROMPT },
      ...chatHistory
    ];

    const content = await callAI(messages, model);
    res.json({ reply: content });
  } catch (err) {
    console.error('[brainstorm] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', version: '3.2.0-usage-tracking' }));

// ── Soft Delete Account ──────────────────────────────────────────────────────
app.post('/api/delete-account', async (req, res) => {
  try {
    const user = await verifyUser(req.headers.authorization);
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    // Soft delete: set deleted_at on profile
    await supabaseRequest('PATCH', `profiles?id=eq.${user.id}`, {
      deleted_at: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (e) {
    console.error('Delete account error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Check / Restore Account ──────────────────────────────────────────────────
app.post('/api/restore-account', async (req, res) => {
  try {
    const user = await verifyUser(req.headers.authorization);
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

    // Get profile deleted_at
    const profiles = await supabaseRequest('GET', `profiles?id=eq.${user.id}&select=deleted_at`);
    const profile = Array.isArray(profiles) ? profiles[0] : null;

    if (!profile?.deleted_at) return res.json({ status: 'active' });

    const daysSince = (Date.now() - new Date(profile.deleted_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) return res.json({ status: 'wiped' });

    // Restore — clear deleted_at
    await supabaseRequest('PATCH', `profiles?id=eq.${user.id}`, { deleted_at: null });
    res.json({ status: 'restored' });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy /api/generate and /api/job/:jobId endpoints removed (v3.8)
// All generation now uses /api/generate-stream (SSE)

// ── Deploy ──────────────────────────────────────────────────────────────────
app.post('/api/deploy', async (req, res) => {
  const { buildId, subdomain } = req.body;
  if (!buildId || !subdomain) return res.status(400).json({ error: 'buildId and subdomain required' });

  // Validate subdomain: lowercase alphanumeric + hyphens, 3-32 chars, no leading/trailing hyphen
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(subdomain)) {
    return res.status(400).json({ error: 'Invalid subdomain. Use 3-32 lowercase letters, numbers, and hyphens only.' });
  }
  // Block reserved subdomains
  const reserved = ['kenzo', 'admin', 'api', 'www', 'mail', 'builder', 'app', 'dashboard', 'auth', 'login', 'static', 'assets', 'cdn'];
  if (reserved.includes(subdomain)) {
    return res.status(400).json({ error: 'This subdomain is reserved.' });
  }
  const buildPath = path.join(BUILDS_DIR, buildId);
  if (!fs.existsSync(buildPath)) return res.status(404).json({ error: 'Build not found' });

  // ── Deploy Security: File Validation ──
  const ALLOWED_EXT = ['.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.txt', '.md', '.webp', '.woff', '.woff2'];
  const BLOCKED_CONTENT = ['<?php', '#!/bin', '<%', '<jsp:', 'eval(', 'require(', 'import os', 'import subprocess'];
  const MAX_FILES = 30;
  const MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 5MB

  function scanDir(dir, base = '') {
    const entries = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.join(base, item.name);
      if (item.isSymbolicLink()) continue; // skip symlinks
      if (item.isDirectory()) {
        entries.push(...scanDir(path.join(dir, item.name), rel));
      } else if (item.isFile()) {
        entries.push({ path: rel, full: path.join(dir, item.name), size: fs.statSync(path.join(dir, item.name)).size });
      }
    }
    return entries;
  }

  const deployFiles = scanDir(buildPath);
  // Check file count
  if (deployFiles.length > MAX_FILES) {
    return res.status(400).json({ error: `Too many files (${deployFiles.length}). Maximum ${MAX_FILES}.` });
  }
  // Check total size
  const totalSize = deployFiles.reduce((s, f) => s + f.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    return res.status(400).json({ error: `Project too large (${(totalSize/1024/1024).toFixed(1)}MB). Maximum 5MB.` });
  }
  // Check extensions and content
  for (const file of deployFiles) {
    if (file.path === 'nginx.conf') continue; // allow our generated conf
    const ext = path.extname(file.path).toLowerCase();
    if (!ALLOWED_EXT.includes(ext) && file.path !== '.gitkeep') {
      return res.status(400).json({ error: `Blocked file type: ${file.path}. Allowed: ${ALLOWED_EXT.join(', ')}` });
    }
    // Content scan text files only
    if (['.html', '.css', '.js', '.json', '.svg', '.txt', '.md'].includes(ext)) {
      const content = fs.readFileSync(file.full, 'utf8');
      for (const blocked of BLOCKED_CONTENT) {
        if (content.includes(blocked)) {
          return res.status(400).json({ error: `Blocked content detected in ${file.path}: server-side code not allowed.` });
        }
      }
    }
  }

  const nginxConf = `server {\n    listen 80;\n    server_name ${subdomain}.kenzoagent.com;\n    root /var/www/${subdomain}.kenzoagent.com;\n    index index.html;\n    location / { try_files $uri $uri/ /index.html; }\n}`;
  fs.writeFileSync(path.join(buildPath, 'nginx.conf'), nginxConf);

  try {
    const deployBody = JSON.stringify({
      domain: `${subdomain}.kenzoagent.com`,
      files_path: buildPath.replace('/home/node/.openclaw', '/root/.openclaw')
    });
    const result = await new Promise((resolve, reject) => {
      const opts = { hostname: '172.18.0.1', port: 5000, path: '/deploy', method: 'POST', headers: { 'Content-Type': 'application/json' } };
      const r = http.request(opts, (res2) => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){resolve({raw:d})} }); });
      r.on('error', reject); r.write(deployBody); r.end();
    });
    res.json({ success: true, url: `https://${subdomain}.kenzoagent.com`, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/build/:buildId', (req, res) => {
  const htmlPath = path.join(BUILDS_DIR, req.params.buildId, 'index.html');
  if (!fs.existsSync(htmlPath)) return res.status(404).json({ error: 'Not found' });
  res.json({ html: fs.readFileSync(htmlPath, 'utf8') });
});

// === WHISPER TRANSCRIPTION ===
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

    // Write webm to temp file
    fs.writeFileSync(tmpWebm, audioBuffer);

    // Convert webm → wav using ffmpeg
    try {
      execSync(`ffmpeg -i ${tmpWebm} -ar 16000 -ac 1 -f wav ${tmpWav} -y 2>/dev/null`);
    } catch(e) {
      console.error('ffmpeg error:', e.message);
      try { fs.unlinkSync(tmpWebm); } catch(x){}
      return res.status(500).json({ error: 'Audio conversion failed' });
    }

    // Read wav file as base64
    const wavBuffer = fs.readFileSync(tmpWav);
    const wavBase64 = wavBuffer.toString('base64');

    // Clean up temp files
    try { fs.unlinkSync(tmpWebm); fs.unlinkSync(tmpWav); } catch(x){}

    // Use gpt-4o-transcribe (Whisper endpoint, but GPT-4o quality)
    const boundary2 = '----WB2' + Date.now();
    function field2(name, value) {
      return `--${boundary2}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
    }

    let prefix2 = field2('model', 'gpt-4o-transcribe');
    if (language && language !== 'uz') prefix2 += field2('language', language);
    // For Uzbek: use prompt hint instead of language code
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

// ── Auto-cleanup: old builds (>24h) and stale jobs (>10min) ─────────────────
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
  } catch(e) { console.warn('Build cleanup error:', e.message); }
}

function cleanJobs() {
  const now = Date.now();
  let cleaned = 0;
  Object.keys(jobs).forEach(id => {
    if (jobs[id].createdAt && now - jobs[id].createdAt > 10 * 60 * 1000) {
      delete jobs[id];
      cleaned++;
    }
  });
  // Clean expired guest usage entries
  Object.keys(guestUsage).forEach(ip => {
    if (now > guestUsage[ip].resetAt) delete guestUsage[ip];
  });
  if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} stale jobs from memory`);
}

// Run cleanup every hour for builds, every minute for jobs
setInterval(cleanBuilds, 60 * 60 * 1000);
setInterval(cleanJobs, 60 * 1000);
cleanBuilds(); // Run once at startup

app.listen(PORT, () => console.log(`🚀 Website Builder API v3.3.0-voice on port ${PORT}`));
