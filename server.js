// server.js - OpenAI to NVIDIA NIM API Proxy (Optimized for Janitor AI)
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// NVIDIA NIM API configuration
const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

// 🔥 REASONING DISPLAY TOGGLE - Shows/hides reasoning in output
const SHOW_REASONING = process.env.SHOW_REASONING === 'true' || false;

// 🔥 THINKING MODE TOGGLE - Enables thinking for specific models that support it
const ENABLE_THINKING_MODE = process.env.ENABLE_THINKING_MODE === 'true' || false;

// 🎯 MODEL MAPPING — verified against build.nvidia.com/models (August 2026)
// ⚠️ deepseek-v4-flash removed — deprecated, replaced by flash-0731 (not yet on NIM)
const MODEL_MAPPING = {
  // --- DeepSeek ---
  'deepseek-v4-pro':   'deepseek-ai/deepseek-v4-pro',         // Flagship, 1M ctx
  'gpt-4':             'deepseek-ai/deepseek-v4-pro',

  // --- NVIDIA Nemotron (confirmed live, top usage) ---
  'gpt-3.5-turbo':     'nvidia/nemotron-3-ultra-550b-a55b',   // 550B MoE, 52M calls/mo, 1M ctx
  'gpt-4o-mini':       'nvidia/nemotron-3.5-lightning-30b-a3b', // NEW Aug 11! Fastest 30B MoE
  'nemotron-ultra':    'nvidia/nemotron-3-ultra-550b-a55b',
  'nemotron-lightning':'nvidia/nemotron-3.5-lightning-30b-a3b',

  // --- GLM (Z.ai, confirmed live) ---
  'glm-pro':           'z-ai/glm-5.2',                        // 8M calls/mo, confirmed ✅

  // --- MiniMax (confirmed live) ---
  'minimax':           'minimaxai/minimax-m3',                 // 10M calls/mo, confirmed ✅
  'gpt-4o':            'minimaxai/minimax-m3',                 // Replaces deepseek-flash slot

  // --- Step (confirmed live) ---
  'step-flash':        'stepfun-ai/step-3.7-flash',           // 7M calls/mo, confirmed ✅
  'gpt-4-faster':      'stepfun-ai/step-3.7-flash',

  // --- Inkling (Thinking Machines, confirmed live) ---
  'inkling':           'thinkingmachines/inkling',             // Mamba-hybrid MoE, multimodal

  // --- Google DiffusionGemma (confirmed live) ---
  'gemma':             'google/diffusiongemma-26b-a4b-it',     // 4M calls/mo, parallel generation

  // --- Mistral (may still be active) ---
  'mistral-medium':    'mistralai/mistral-medium-3.5-128b',
  'mistral-small':     'mistralai/mistral-small-4-119b-2603',
  'gemini-pro':        'mistralai/mistral-medium-3.5-128b',

  // --- OpenAI OSS (via NIM) ---
  'claude-3-opus':     'openai/gpt-oss-120b',
  'claude-3-sonnet':   'openai/gpt-oss-20b',
};

// 🔄 FALLBACK CHAIN — ordered by confirmed usage & reliability (August 2026)
// deepseek-flash removed since it's deprecated
const FALLBACK_CHAIN = [
  'minimaxai/minimax-m3',              // 10M calls/mo — most reliable free model
  'z-ai/glm-5.2',                      // 8M calls/mo — confirmed working
  'nvidia/nemotron-3-ultra-550b-a55b', // 52M calls/mo — highest usage on NIM
  'stepfun-ai/step-3.7-flash',         // 7M calls/mo — fast fallback
  'nvidia/nemotron-3.5-lightning-30b-a3b', // Newest, fastest
  'thinkingmachines/inkling',          // Last resort
];

// 🛡️ ROLEPLAY GUARD - Injected into every request to prevent the model from speaking as the user
const RP_GUARD_INSTRUCTION = `You are ONLY the character described in the system prompt or conversation. Follow these rules strictly:
- You ONLY speak, act, and think as the character. You do NEVER write or generate any dialogue, actions, or thoughts for the user or any other character that the user is playing.
- Do NOT use labels like "User:", "Human:", "You:" or any prefix to simulate the user's side of the conversation.
- Do NOT continue the conversation by inventing what the user says or does next.
- Stop your response immediately after your character's turn ends.
- If you feel the scene needs a reaction from the user, end your response and wait.`;

// 🛡️ ROLEPLAY GUARD - Strips any text where the model broke character and started writing as the user
function stripUserBreakout(text) {
  const lines = text.split('\n');
  const cleaned = [];
  let dropping = false;

  const userLabels = [
    /^(User|Human|You|Me|Player)\s*[:：]/i,
    /^---+\s*$/,
    /^\*{0,3}\s*(User|Human|You|Me|Player)\s*\*{0,3}\s*[:：]/i
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (userLabels.some(pattern => pattern.test(trimmed))) {
      dropping = true;
      continue;
    }
    if (dropping) {
      if (trimmed === '') continue;
      if (trimmed.startsWith('*')) {
        dropping = false;
        cleaned.push(line);
      }
      continue;
    }
    cleaned.push(line);
  }

  const result = cleaned.join('\n');
  const lastUserLabel = result.search(/\n(?:User|Human|You|Me|Player)\s*[:：]/i);
  if (lastUserLabel !== -1) {
    return result.substring(0, lastUserLabel).trimEnd();
  }
  return result.trimEnd();
}

// 🎨 THINKING-CAPABLE MODELS
const THINKING_MODELS = [
  'deepseek-ai/deepseek-v4-pro',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'nvidia/nemotron-3.5-lightning-30b-a3b',
  'z-ai/glm-5.2',
  'minimaxai/minimax-m3',
  'stepfun-ai/step-3.7-flash',
  'thinkingmachines/inkling',
  'mistralai/mistral-medium-3.5-128b',
  'mistralai/mistral-small-4-119b-2603',
];

// 🔄 Helper: make a NIM request with automatic 429 + 503 fallback
async function makeNimRequest(nimRequest, stream) {
  const modelsToTry = [nimRequest.model, ...FALLBACK_CHAIN.filter(m => m !== nimRequest.model)];

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelAttempt = modelsToTry[i];
    try {
      const response = await axios.post(`${NIM_API_BASE}/chat/completions`, {
        ...nimRequest,
        model: modelAttempt
      }, {
        headers: {
          'Authorization': `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: stream ? 'stream' : 'json'
      });

      response._usedModel = modelAttempt;
      if (modelAttempt !== nimRequest.model) {
        console.log(`✅ Fell back to: ${modelAttempt}`);
      }
      return response;

    } catch (err) {
      const status = err.response?.status;
      const isLast = i === modelsToTry.length - 1;

      // Catch 429 (rate limit), 503 (resource full/overloaded), 410 (gone/deprecated)
      if (status === 429 || status === 503 || status === 410) {
        console.warn(`⚠️  ${status} on ${modelAttempt} — ${isLast ? 'all fallbacks exhausted' : `trying ${modelsToTry[i + 1]}`}`);
        if (isLast) throw err;
        continue;
      }

      throw err;
    }
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'OpenAI to NVIDIA NIM Proxy (Janitor AI Optimized)', 
    reasoning_display: SHOW_REASONING,
    thinking_mode: ENABLE_THINKING_MODE,
    nim_api_configured: !!NIM_API_KEY,
    available_models: Object.keys(MODEL_MAPPING).length,
    optimized_for: 'Janitor AI',
    last_updated: 'August 2026'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'OpenAI to NVIDIA NIM Proxy',
    version: '2.3',
    optimized_for: 'Janitor AI',
    status: 'running',
    endpoints: {
      health: '/health',
      models: '/v1/models',
      chat: '/v1/chat/completions'
    },
    featured_models: {
      best_quality:   'gpt-4 → deepseek-v4-pro (1M ctx)',
      best_free:      'minimax → minimax-m3 (10M calls/mo)',
      most_popular:   'gpt-3.5-turbo → nemotron-ultra-550b (52M calls/mo)',
      newest:         'gpt-4o-mini → nemotron-lightning-30b (Aug 2026)',
      confirmed_rp:   'glm-pro → glm-5.2 | minimax → minimax-m3'
    }
  });
});

// List models endpoint (OpenAI compatible)
app.get('/v1/models', (req, res) => {
  const models = Object.keys(MODEL_MAPPING).map(model => ({
    id: model,
    object: 'model',
    created: Date.now(),
    owned_by: 'nvidia-nim-proxy',
    nim_model: MODEL_MAPPING[model],
    supports_thinking: THINKING_MODELS.includes(MODEL_MAPPING[model])
  }));
  
  res.json({
    object: 'list',
    data: models
  });
});

// Chat completions endpoint (main proxy)
app.post('/v1/chat/completions', async (req, res) => {
  try {
    if (!NIM_API_KEY) {
      return res.status(500).json({
        error: {
          message: 'NIM_API_KEY not configured. Please add your NVIDIA API key in Render environment variables.',
          type: 'configuration_error',
          code: 500
        }
      });
    }

    const { model, messages, temperature, max_tokens, stream } = req.body;
    
    let nimModel = MODEL_MAPPING[model];
    
    if (!nimModel) {
      try {
        await axios.post(`${NIM_API_BASE}/chat/completions`, {
          model: model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        }, {
          headers: { 
            'Authorization': `Bearer ${NIM_API_KEY}`, 
            'Content-Type': 'application/json' 
          },
          validateStatus: (status) => status < 500
        }).then(res => {
          if (res.status >= 200 && res.status < 300) {
            nimModel = model;
          }
        });
      } catch (e) {
        // Will use fallback below
      }
      
      if (!nimModel) {
        const modelLower = model.toLowerCase();
        if (modelLower.includes('gpt-4') || modelLower.includes('opus') || modelLower.includes('405b')) {
          nimModel = 'deepseek-ai/deepseek-v4-pro';
        } else if (modelLower.includes('claude') || modelLower.includes('gemini') || modelLower.includes('70b')) {
          nimModel = 'minimaxai/minimax-m3';
        } else {
          nimModel = 'z-ai/glm-5.2'; // Most reliable confirmed free model
        }
      }
    }
    
    // 🛡️ ROLEPLAY GUARD - Inject character-only instruction
    const systemIndex = messages.findIndex(m => m.role === 'system');
    if (systemIndex !== -1) {
      messages[systemIndex] = {
        ...messages[systemIndex],
        content: messages[systemIndex].content + '\n\n' + RP_GUARD_INSTRUCTION
      };
    } else {
      messages.unshift({ role: 'system', content: RP_GUARD_INSTRUCTION });
    }

    const nimRequest = {
      model: nimModel,
      messages: messages,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 12000,
      stream: stream || false
    };

    if (ENABLE_THINKING_MODE && THINKING_MODELS.includes(nimModel)) {
      if (nimModel.includes('deepseek')) {
        nimRequest.extra_body = { thinking: true };
      } else if (nimModel.includes('nemotron')) {
        if (nimRequest.messages[0]?.role !== 'system') {
          nimRequest.messages.unshift({
            role: 'system',
            content: 'detailed thinking on'
          });
        }
      }
    }
    
    // 🔄 Use fallback-aware request helper
    const response = await makeNimRequest(nimRequest, stream || false);
    
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      let buffer = '';
      let reasoningStarted = false;
      let contentAccumulator = '';
      let flushedUpTo = 0;
      const LOOKAHEAD = 200;
      
      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            if (line.includes('[DONE]')) {
              if (contentAccumulator.length > flushedUpTo) {
                const remaining = stripUserBreakout(contentAccumulator.substring(flushedUpTo));
                if (remaining.length > 0) {
                  const doneFlush = {
                    choices: [{ delta: { content: remaining }, index: 0 }]
                  };
                  res.write(`data: ${JSON.stringify(doneFlush)}\n\n`);
                }
              }
              res.write(line + '\n\n');
              return;
            }
            
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta) {
                const reasoning = data.choices[0].delta.reasoning_content;
                const content = data.choices[0].delta.content;
                
                if (SHOW_REASONING) {
                  let combinedContent = '';
                  if (reasoning && !reasoningStarted) {
                    combinedContent = '<think>\n' + reasoning;
                    reasoningStarted = true;
                  } else if (reasoning) {
                    combinedContent = reasoning;
                  }
                  if (content && reasoningStarted) {
                    combinedContent += '\n</think>\n\n' + content;
                    reasoningStarted = false;
                  } else if (content) {
                    combinedContent += content;
                  }
                  if (combinedContent) {
                    data.choices[0].delta.content = combinedContent;
                    delete data.choices[0].delta.reasoning_content;
                  }
                } else {
                  if (content) {
                    data.choices[0].delta.content = content;
                  } else {
                    data.choices[0].delta.content = '';
                  }
                  delete data.choices[0].delta.reasoning_content;
                }

                const chunkText = data.choices[0].delta.content || '';
                if (chunkText) {
                  contentAccumulator += chunkText;
                  const filtered = stripUserBreakout(contentAccumulator);
                  const safeEnd = Math.max(flushedUpTo, filtered.length - LOOKAHEAD);
                  if (safeEnd > flushedUpTo) {
                    const toSend = filtered.substring(flushedUpTo, safeEnd);
                    flushedUpTo = safeEnd;
                    data.choices[0].delta.content = toSend;
                    res.write(`data: ${JSON.stringify(data)}\n\n`);
                  }
                  return;
                }
              }
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            } catch (e) {
              res.write(line + '\n');
            }
          }
        });
      });
      
      response.data.on('end', () => res.end());
      response.data.on('error', (err) => {
        console.error('Stream error:', err);
        res.end();
      });
    } else {
      const openaiResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: response.data.choices.map(choice => {
          let fullContent = choice.message?.content || '';
          fullContent = stripUserBreakout(fullContent);
          if (SHOW_REASONING && choice.message?.reasoning_content) {
            fullContent = '<think>\n' + choice.message.reasoning_content + '\n</think>\n\n' + fullContent;
          }
          return {
            index: choice.index,
            message: {
              role: choice.message.role,
              content: fullContent
            },
            finish_reason: choice.finish_reason
          };
        }),
        usage: response.data.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      };
      res.json(openaiResponse);
    }
    
  } catch (error) {
    console.error('Proxy error:', error.message);
    
    let errorMessage = error.message || 'Internal server error';
    if (error.response?.status === 401) {
      errorMessage = 'Invalid NVIDIA API key. Please check your NIM_API_KEY in environment variables.';
    } else if (error.response?.status === 429) {
      errorMessage = 'All models are rate limited. Please wait 60 seconds and try again.';
      res.setHeader('Retry-After', error.response?.headers?.['retry-after'] || 60);
    } else if (error.response?.status === 503) {
      errorMessage = 'NIM servers are overloaded. All fallback models also full. Please try again shortly.';
    } else if (error.response?.status === 410) {
      errorMessage = 'Model is no longer available on NIM. Please try a different model.';
    } else if (error.response?.data?.detail) {
      errorMessage = error.response.data.detail;
    }
    
    res.status(error.response?.status || 500).json({
      error: {
        message: errorMessage,
        type: 'invalid_request_error',
        code: error.response?.status || 500
      }
    });
  }
});

// Catch-all for unsupported endpoints
app.all('*', (req, res) => {
  res.status(404).json({
    error: {
      message: `Endpoint ${req.path} not found. Available endpoints: /health, /v1/models, /v1/chat/completions`,
      type: 'invalid_request_error',
      code: 404
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 OpenAI → NVIDIA NIM Proxy (Janitor AI Optimized)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 Models list: http://localhost:${PORT}/v1/models`);
  console.log('');
  console.log('⚙️  Configuration:');
  console.log(`   • Reasoning display: ${SHOW_REASONING ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`   • Thinking mode:     ${ENABLE_THINKING_MODE ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`   • API key:           ${NIM_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   • Max tokens:        12000`);
  console.log(`   • Fallback triggers: 429, 503, 410`);
  console.log('');
  console.log('🎯 Confirmed Working Models (August 2026):');
  console.log('   • glm-pro          → GLM-5.2          (8M calls/mo) ✅');
  console.log('   • minimax          → MiniMax M3        (10M calls/mo) ✅');
  console.log('   • gpt-3.5-turbo    → Nemotron Ultra 550B (52M calls/mo) ✅');
  console.log('   • gpt-4o-mini      → Nemotron Lightning 30B (NEW Aug 2026) ✅');
  console.log('   • step-flash       → Step-3.7 Flash    (7M calls/mo) ✅');
  console.log('   • deepseek-v4-pro  → DeepSeek V4 Pro   (1M ctx) ✅');
  console.log('   ⚠️  deepseek-v4-flash REMOVED — deprecated on NIM');
  console.log('');
  console.log('🔄 Fallback Chain (on 429/503/410):');
  FALLBACK_CHAIN.forEach((m, i) => console.log(`   ${i + 1}. ${m}`));
  console.log('═══════════════════════════════════════════════════════');
});
