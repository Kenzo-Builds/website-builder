const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Load key from config.json (never hardcode or share in chat)
let OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
let SUPABASE_URL = '';
let SUPABASE_SERVICE_KEY = '';
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
  if (cfg.OPENROUTER_API_KEY && !cfg.OPENROUTER_API_KEY.includes('REPLACE')) {
    OPENROUTER_API_KEY = cfg.OPENROUTER_API_KEY;
  }
} catch(e) { /* config.json optional */ }
try {
  const sbCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'supabase-config.json'), 'utf8'));
  SUPABASE_URL = sbCfg.SUPABASE_URL;
  SUPABASE_SERVICE_KEY = sbCfg.SUPABASE_SERVICE_ROLE_KEY;
} catch(e) { console.warn('supabase-config.json not found'); }

const DEPLOY_API = 'http://172.18.0.1:5000';

// ── Plan Limits (generations per month) ─────────────────────────────────────
const PLAN_LIMITS = {
  guest: 3,
  free: 5,
  starter: 50,
  pro: 200,
  expert: Infinity
};

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
app.post('/api/auth/signup', async (req, res) => {
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

const SYSTEM_PROMPT = `You are an expert web developer. Generate complete, beautiful, modern HTML pages.
RULES:
- Always return COMPLETE HTML (<!DOCTYPE html> to </html>)
- Use Tailwind CSS via CDN for styling
- Make it visually stunning
- Include all content inline (no external files needed)
- Use placeholder images from https://picsum.photos/ when needed
- Make it fully responsive (mobile-friendly)
- Add subtle animations with CSS
- Never use Lorem Ipsum — write real relevant content
Return ONLY the HTML code, no explanations, no markdown — just raw HTML starting with <!DOCTYPE html>.`;

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
  const { prompt, model = 'google/gemini-2.5-flash', existingCode } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  // Check usage limits
  const user = await verifyUser(req.headers.authorization);
  let userId = null;
  if (user) {
    userId = user.id;
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

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (existingCode) {
    messages.push({ role: 'user', content: `Current HTML:\n${existingCode}\n\nModify: ${prompt}` });
  } else {
    messages.push({ role: 'user', content: `Create a website: ${prompt}` });
  }

  const startTime = Date.now();
  console.log(`[stream] model=${model} user=${userId?.slice(0,8)||'guest'} prompt="${prompt.slice(0,60)}"`);

  callAIStream(messages, model,
    // onChunk
    (delta, fullContent) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', delta, length: fullContent.length })}\n\n`);
    },
    // onDone
    (fullContent) => {
      const html = extractCode(fullContent);

      // Save build
      const buildId = crypto.randomUUID();
      const buildPath = path.join(BUILDS_DIR, buildId);
      fs.mkdirSync(buildPath);
      fs.writeFileSync(path.join(buildPath, 'index.html'), html);

      // Log generation
      if (userId) logGeneration(userId, model, prompt);

      const duration = Date.now() - startTime;
      console.log(`[stream] done ${html.length} chars in ${duration}ms`);

      res.write(`data: ${JSON.stringify({ type: 'done', html, buildId, duration })}\n\n`);
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
  const { messages: chatHistory = [], model = 'xiaomi/mimo-v2-pro' } = req.body;
  if (!chatHistory.length) return res.status(400).json({ error: 'Messages required' });

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

// ── Start generation job ────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { prompt, model = 'google/gemini-2.5-flash', existingCode } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  // Check usage limits
  const user = await verifyUser(req.headers.authorization);
  let userId = null;
  if (user) {
    userId = user.id;
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
  // Guest users: no server-side enforcement (handled client-side via localStorage)

  const jobId = crypto.randomUUID();
  jobs[jobId] = { status: 'pending', progress: 'Starting...', startedAt: Date.now(), userId, model, prompt };

  // Return jobId immediately
  res.json({ jobId });

  // Run generation in background
  (async () => {
    try {
      jobs[jobId].progress = 'Connecting to AI...';
      const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
      if (existingCode) {
        messages.push({ role: 'user', content: `Current HTML:\n${existingCode}\n\nModify: ${prompt}` });
      } else {
        messages.push({ role: 'user', content: `Create a website: ${prompt}` });
      }

      jobs[jobId].progress = `Generating with ${model}...`;
      console.log(`[job:${jobId.slice(0,8)}] model=${model} user=${userId?.slice(0,8)||'guest'} prompt="${prompt.slice(0,60)}"`);

      const content = await callAI(messages, model);
      const html = extractCode(content);

      // Save build
      const buildId = crypto.randomUUID();
      const buildPath = path.join(BUILDS_DIR, buildId);
      fs.mkdirSync(buildPath);
      fs.writeFileSync(path.join(buildPath, 'index.html'), html);

      // Log generation to Supabase
      if (userId) await logGeneration(userId, model, prompt);

      jobs[jobId] = { status: 'done', html, buildId, duration: Date.now() - jobs[jobId].startedAt };
      console.log(`[job:${jobId.slice(0,8)}] done ${html.length} chars in ${jobs[jobId].duration}ms`);

    } catch (err) {
      console.error(`[job:${jobId.slice(0,8)}] error:`, err.message);
      jobs[jobId] = { status: 'error', error: err.message };
    }
  })();
});

// ── Poll job status ─────────────────────────────────────────────────────────
app.get('/api/job/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (job.status === 'done') {
    // Clean up job after delivering
    const result = { ...job };
    delete jobs[req.params.jobId];
    return res.json(result);
  }

  res.json({ status: job.status, progress: job.progress || 'Working...' });
});

// ── Deploy ──────────────────────────────────────────────────────────────────
app.post('/api/deploy', async (req, res) => {
  const { buildId, subdomain } = req.body;
  if (!buildId || !subdomain) return res.status(400).json({ error: 'buildId and subdomain required' });
  const buildPath = path.join(BUILDS_DIR, buildId);
  if (!fs.existsSync(buildPath)) return res.status(404).json({ error: 'Build not found' });

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

app.listen(PORT, () => console.log(`🚀 Website Builder API v3.2.0-usage-tracking on port ${PORT}`));
