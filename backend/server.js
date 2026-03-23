const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ── Config ─────────────────────────────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
const DEPLOY_API = 'http://172.18.0.1:5000';
const BUILDS_DIR = path.join(__dirname, 'builds');
const PORT = process.env.PORT || 3500;

if (!fs.existsSync(BUILDS_DIR)) fs.mkdirSync(BUILDS_DIR, { recursive: true });

// ── AI call via OpenRouter ──────────────────────────────────────────────────
function callAI(messages, model = 'qwen/qwen3-coder:free', stream = false) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, messages, stream });
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
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed.choices[0].message.content);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Extract code from AI response ──────────────────────────────────────────
function extractCode(response) {
  // Try to extract from code block
  const htmlMatch = response.match(/```html\n?([\s\S]*?)```/i);
  if (htmlMatch) return htmlMatch[1].trim();
  const codeMatch = response.match(/```\n?([\s\S]*?)```/);
  if (codeMatch) return codeMatch[1].trim();
  // If response starts with <!DOCTYPE or <html, return as-is
  if (response.trim().startsWith('<!') || response.trim().startsWith('<html')) return response.trim();
  return response.trim();
}

// ── System prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert web developer. Generate complete, beautiful, modern HTML pages.

RULES:
- Always return COMPLETE HTML (<!DOCTYPE html> to </html>)
- Use Tailwind CSS via CDN for styling
- Make it visually stunning — dark or light theme as appropriate
- Include all content inline (no external files needed)
- Use placeholder images from https://picsum.photos/ when needed
- Make it fully responsive (mobile-friendly)
- Add subtle animations with CSS
- Never use Lorem Ipsum — write real relevant content
- The page must work perfectly when opened in a browser

Return ONLY the HTML code, wrapped in a \`\`\`html code block.`;

// ── Routes ─────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// Generate website
app.post('/api/generate', async (req, res) => {
  const { prompt, model = 'qwen/qwen3-coder:free', existingCode } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    if (existingCode) {
      messages.push({
        role: 'user',
        content: `Here is the current HTML code:\n\`\`\`html\n${existingCode}\n\`\`\`\n\nPlease modify it based on this request: ${prompt}`
      });
    } else {
      messages.push({ role: 'user', content: `Create a website: ${prompt}` });
    }

    console.log(`[generate] prompt="${prompt}" model=${model}`);
    const response = await callAI(messages, model);
    const html = extractCode(response);

    // Save build
    const buildId = crypto.randomUUID();
    const buildPath = path.join(BUILDS_DIR, buildId);
    fs.mkdirSync(buildPath);
    fs.writeFileSync(path.join(buildPath, 'index.html'), html);

    res.json({ success: true, html, buildId });
  } catch (err) {
    console.error('[generate error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Refine existing site
app.post('/api/refine', async (req, res) => {
  const { prompt, existingCode, model = 'qwen/qwen3-coder:free' } = req.body;
  if (!prompt || !existingCode) return res.status(400).json({ error: 'prompt and existingCode required' });
  req.body.existingCode = existingCode;
  // Reuse generate logic
  return app._router.handle({ ...req, url: '/api/generate', path: '/api/generate', body: { prompt, model, existingCode } }, res, () => {});
});

// Deploy to kenzoagent.com
app.post('/api/deploy', async (req, res) => {
  const { buildId, subdomain } = req.body;
  if (!buildId || !subdomain) return res.status(400).json({ error: 'buildId and subdomain required' });

  const buildPath = path.join(BUILDS_DIR, buildId);
  if (!fs.existsSync(buildPath)) return res.status(404).json({ error: 'Build not found' });

  // Write nginx.conf for the build
  const nginxConf = `server {
    listen 80;
    server_name ${subdomain}.kenzoagent.com;
    root /var/www/${subdomain}.kenzoagent.com;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}`;
  fs.writeFileSync(path.join(buildPath, 'nginx.conf'), nginxConf);

  try {
    // Call deploy API
    const deployBody = JSON.stringify({
      domain: `${subdomain}.kenzoagent.com`,
      files_path: buildPath.replace('/home/node/.openclaw', '/root/.openclaw')
    });

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: '172.18.0.1',
        port: 5000,
        path: '/deploy',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };
      const req2 = http.request(options, (r) => {
        let d = ''; r.on('data', c => d += c);
        r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve({ raw: d }); } });
      });
      req2.on('error', reject);
      req2.write(deployBody);
      req2.end();
    });

    res.json({ success: true, url: `https://${subdomain}.kenzoagent.com`, result });
  } catch (err) {
    console.error('[deploy error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get build HTML
app.get('/api/build/:buildId', (req, res) => {
  const htmlPath = path.join(BUILDS_DIR, req.params.buildId, 'index.html');
  if (!fs.existsSync(htmlPath)) return res.status(404).json({ error: 'Not found' });
  res.json({ html: fs.readFileSync(htmlPath, 'utf8') });
});

app.listen(PORT, () => console.log(`🚀 Website Builder API on port ${PORT}`));
