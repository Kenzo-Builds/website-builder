# Agent Builder — Technical Architecture

> **Status:** Planning phase. Build after Level 1 (custom domains) + Level 2 (dynamic sites).
> **Target:** 2-3 weeks for MVP once started.
> **Goal:** Users create AI-powered Telegram bots (and later web chat agents) through a simple UI.

---

## Overview

```
┌──────────────────────────────────────────────────────┐
│                  YOUR PLATFORM                        │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │  Website     │  │   Agent     │  │  Business    │ │
│  │  Builder     │  │   Builder   │  │  Advisor     │ │
│  └─────────────┘  └─────────────┘  └──────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Shared: Auth, Billing, Dashboard, Supabase     │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## User Flow

### Creating an Agent
1. User clicks "Create Agent" on dashboard
2. Chat interface: "What should your agent do?"
3. User describes: "I want a customer support bot for my phone shop that answers questions about products and prices"
4. AI generates: system prompt + suggests skills (product lookup, pricing, FAQ)
5. User reviews and tweaks the prompt
6. User pastes Telegram bot token (from @BotFather)
7. Agent goes live instantly

### Managing Agents
- Dashboard shows all agents with status (online/offline)
- Click agent → see conversation logs, edit prompt, toggle skills
- Usage stats: messages handled, tokens used, response time
- Upgrade plan for more agents / more messages

---

## Technical Stack

### Backend: Single Node.js Process

```
agent-runtime/
├── server.js           # Express server + Telegram webhook receiver
├── agent-manager.js    # Loads/manages all active agents
├── llm.js              # LLM API calls (Claude, GPT, Gemini)
├── tool-executor.js    # Runs tools/skills when LLM requests them
├── tools/              # Built-in tools
│   ├── web-search.js
│   ├── send-email.js
│   ├── weather.js
│   ├── calculator.js
│   ├── translate.js
│   ├── rag-query.js    # Knowledge base search
│   └── custom-api.js   # User-defined API calls
├── integrations/
│   ├── telegram.js     # grammy library — one bot instance per agent
│   ├── web-chat.js     # WebSocket endpoint for embed widget
│   └── webhook.js      # Receive external webhooks
└── scheduler.js        # Cron-like tasks per agent
```

### Database: Supabase

```sql
-- Agents table
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  model TEXT DEFAULT 'anthropic/claude-sonnet-4.6',
  telegram_token TEXT,          -- encrypted
  telegram_chat_ids TEXT[],     -- allowed chats (optional)
  enabled_tools TEXT[],         -- ['web-search', 'weather', 'rag-query']
  knowledge_base_id UUID,      -- link to uploaded docs
  status TEXT DEFAULT 'offline', -- online, offline, error
  max_tokens_per_msg INT DEFAULT 2000,
  temperature FLOAT DEFAULT 0.7,
  language TEXT DEFAULT 'en',   -- uz, ru, en
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Conversations table (agent chat history)
CREATE TABLE agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  external_chat_id TEXT,       -- Telegram chat ID or web session
  messages JSONB DEFAULT '[]', -- [{role, content, timestamp}]
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Knowledge base (RAG)
CREATE TABLE knowledge_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536),      -- text-embedding-3-small
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Usage tracking
CREATE TABLE agent_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  messages_count INT DEFAULT 0,
  tokens_used INT DEFAULT 0,
  period TEXT,                  -- '2026-03' (monthly)
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Plan Limits

| Plan | Agents | Messages/mo | Knowledge Base | Tools |
|------|--------|-------------|----------------|-------|
| Free | 1 | 100 | 1 doc (10 pages) | Basic (3) |
| Starter $9.99 | 3 | 1,000 | 5 docs | All |
| Pro $19.99 | 10 | 10,000 | 20 docs | All + Custom API |
| Expert $69.99 | Unlimited | 100,000 | Unlimited | All + Priority |

---

## Lightweight Agent Framework

### Core Loop (per message)

```javascript
async function handleMessage(agent, userMessage, chatId) {
  // 1. Load conversation history
  const history = await loadHistory(agent.id, chatId);
  
  // 2. Build messages array
  const messages = [
    { role: 'system', content: agent.system_prompt },
    ...history,
    { role: 'user', content: userMessage }
  ];
  
  // 3. Call LLM with tool definitions
  const tools = getToolDefs(agent.enabled_tools);
  const response = await callLLM(agent.model, messages, tools);
  
  // 4. Tool loop — execute tools if requested
  let finalResponse = response;
  let iterations = 0;
  const MAX_ITERATIONS = 5;
  
  while (finalResponse.tool_calls && iterations < MAX_ITERATIONS) {
    const toolResults = [];
    for (const call of finalResponse.tool_calls) {
      const result = await executeTool(call.name, call.arguments, agent);
      toolResults.push({ tool_call_id: call.id, result });
    }
    // Feed results back to LLM
    messages.push({ role: 'assistant', content: finalResponse.content, tool_calls: finalResponse.tool_calls });
    messages.push(...toolResults.map(r => ({ role: 'tool', ...r })));
    finalResponse = await callLLM(agent.model, messages, tools);
    iterations++;
  }
  
  // 5. Save to history
  await saveHistory(agent.id, chatId, userMessage, finalResponse.content);
  
  // 6. Track usage
  await trackUsage(agent.id, agent.user_id, finalResponse.tokens_used);
  
  // 7. Return response
  return finalResponse.content;
}
```

### Agent Manager (handles all agents in one process)

```javascript
class AgentManager {
  constructor() {
    this.agents = new Map();     // agentId → agent config
    this.bots = new Map();       // agentId → grammy Bot instance
  }
  
  async loadAll() {
    // Load all enabled agents from Supabase
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('status', 'online');
    
    for (const agent of data) {
      await this.startAgent(agent);
    }
    console.log(`Loaded ${data.length} agents`);
  }
  
  async startAgent(agent) {
    this.agents.set(agent.id, agent);
    
    // Start Telegram bot if token exists
    if (agent.telegram_token) {
      const bot = new Bot(agent.telegram_token);
      
      bot.on('message:text', async (ctx) => {
        const chatId = ctx.chat.id.toString();
        const reply = await handleMessage(agent, ctx.message.text, chatId);
        await ctx.reply(reply);
      });
      
      bot.start();
      this.bots.set(agent.id, bot);
    }
  }
  
  async stopAgent(agentId) {
    const bot = this.bots.get(agentId);
    if (bot) { await bot.stop(); this.bots.delete(agentId); }
    this.agents.delete(agentId);
  }
  
  async reloadAgent(agentId) {
    await this.stopAgent(agentId);
    const { data } = await supabase.from('agents').select('*').eq('id', agentId).single();
    if (data && data.status === 'online') await this.startAgent(data);
  }
}
```

### Built-in Tools

```javascript
// tools/web-search.js
module.exports = {
  name: 'web_search',
  description: 'Search the web for current information',
  parameters: {
    query: { type: 'string', description: 'Search query' }
  },
  async execute({ query }) {
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`, {
      headers: { 'X-Subscription-Token': BRAVE_KEY }
    });
    const data = await res.json();
    return data.web.results.slice(0, 3).map(r => `${r.title}: ${r.description}`).join('\n');
  }
};

// tools/rag-query.js
module.exports = {
  name: 'knowledge_search',
  description: 'Search the agent knowledge base for relevant information',
  parameters: {
    query: { type: 'string', description: 'What to search for' }
  },
  async execute({ query }, agent) {
    if (!agent.knowledge_base_id) return 'No knowledge base configured';
    const embedding = await getEmbedding(query);
    const { data } = await supabase.rpc('match_chunks', {
      query_embedding: embedding,
      kb_id: agent.knowledge_base_id,
      match_count: 5
    });
    return data.map(d => d.content).join('\n---\n');
  }
};

// tools/weather.js
module.exports = {
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: {
    city: { type: 'string', description: 'City name' }
  },
  async execute({ city }) {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    const data = await res.json();
    const c = data.current_condition[0];
    return `${city}: ${c.temp_C}°C, ${c.weatherDesc[0].value}, humidity ${c.humidity}%`;
  }
};
```

---

## Telegram Integration (grammy)

```javascript
// integrations/telegram.js
const { Bot } = require('grammy');

function createTelegramBot(agent, messageHandler) {
  const bot = new Bot(agent.telegram_token);
  
  // Text messages
  bot.on('message:text', async (ctx) => {
    const reply = await messageHandler(agent, ctx.message.text, ctx.chat.id.toString());
    await ctx.reply(reply, { parse_mode: 'Markdown' });
  });
  
  // Voice messages (transcribe + handle)
  bot.on('message:voice', async (ctx) => {
    const file = await ctx.getFile();
    const url = `https://api.telegram.org/file/bot${agent.telegram_token}/${file.file_path}`;
    const transcript = await transcribeAudio(url);
    const reply = await messageHandler(agent, transcript, ctx.chat.id.toString());
    await ctx.reply(reply, { parse_mode: 'Markdown' });
  });
  
  // Photo with caption
  bot.on('message:photo', async (ctx) => {
    const caption = ctx.message.caption || 'User sent a photo';
    const reply = await messageHandler(agent, caption, ctx.chat.id.toString());
    await ctx.reply(reply);
  });
  
  bot.catch((err) => {
    console.error(`Bot error [${agent.id}]:`, err.message);
  });
  
  return bot;
}
```

---

## Web Chat Embed Widget

```html
<!-- User adds this to their website -->
<script src="https://builder.kenzoagent.com/chat-widget.js" data-agent="AGENT_ID"></script>
```

Widget opens a floating chat bubble → connects via WebSocket → routes to same `handleMessage` function.

---

## Knowledge Base (RAG)

### Upload Flow
1. User uploads PDF/TXT/DOCX
2. Backend extracts text
3. Split into 500-word chunks
4. Generate embeddings (text-embedding-3-small)
5. Store in `knowledge_chunks` table with pgvector

### Query Flow
1. User asks agent a question
2. LLM decides to call `knowledge_search` tool
3. Tool embeds the query → similarity search in pgvector
4. Top 5 chunks returned to LLM
5. LLM answers using the chunks as context

---

## Infrastructure

### MVP (handles ~50 agents)
- **Same Hetzner VPS** — run agent-runtime alongside website builder
- PM2 process: `pm2 start agent-runtime/server.js --name agent-runtime`
- Port 3600 (behind nginx)
- Supabase for everything (auth, data, vectors)

### Scale (50-500 agents)
- **Second Hetzner VPS** ($15/mo) — dedicated to agent runtime
- Redis for conversation cache (faster than Supabase for hot data)
- Queue system (BullMQ) for handling message spikes

### Scale (500+ agents)
- Multiple agent-runtime processes (PM2 cluster mode)
- Load balancer
- Dedicated database
- Message queue for async tool execution

---

## Revenue Model

| Plan | Website Builder | Agent Builder | Combined |
|------|----------------|---------------|----------|
| Free | 10 sites/mo | 1 agent, 100 msgs | $0 |
| Starter | 100 sites/mo | 3 agents, 1K msgs | $9.99/mo |
| Pro | 300 sites/mo | 10 agents, 10K msgs | $19.99/mo |
| Expert | 1000 sites/mo | Unlimited agents | $69.99/mo |

---

## Implementation Order

1. **Week 1:** Database schema, agent CRUD API, basic Telegram integration
2. **Week 2:** Tool loop, built-in tools (web search, weather, RAG), agent dashboard UI
3. **Week 3:** Knowledge base upload, web chat widget, usage tracking, plan limits
4. **Week 4:** Polish, testing, deploy

---

## Key Dependencies
- `grammy` — Telegram bot framework (~200KB)
- `openai` — LLM API client
- pgvector extension on Supabase (already available)
- No Docker, no containers, no heavy frameworks

---

*This document is the complete blueprint. When ready to build, start with server.js + agent-manager.js + telegram.js. Everything else layers on top.*
