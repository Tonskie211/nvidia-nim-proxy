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

// 🎯 MODEL MAPPING — verified against build.nvidia.com/models (May 2025)
const MODEL_MAPPING = {
  // --- DeepSeek (confirmed live on NIM) ---
  'deepseek-v4-pro':   'deepseek-ai/deepseek-v4-pro',    // 1M ctx, flagship MoE
  'deepseek-v4-flash': 'deepseek-ai/deepseek-v4-flash',  // 1M ctx, fast 284B MoE
  'gpt-4':             'deepseek-ai/deepseek-v4-pro',
  'gpt-4o':            'deepseek-ai/deepseek-v4-flash',

  // --- NVIDIA Nemotron ---
  'gpt-3.5-turbo':  'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'gpt-4o-mini':    'nvidia/nemotron-3-super-120b-a12b',

  // --- Qwen ---
  'gpt-4-faster':  'qwen/qwen3.5-122b-a10b',

  // --- Mistral (free endpoints) ---
  'mistral-medium':  'mistralai/mistral-medium-3.5-128b',
  'mistral-small':   'mistralai/mistral-small-4-119b-2603',
  'gemini-pro':      'mistralai/mistral-medium-3.5-128b',

  // --- GLM (Z.ai, free endpoint) ---
  'glm-fast':   'z-ai/glm-4.7',
  'glm-pro':    'z-ai/glm-5.1',

  // --- MiniMax (free endpoint) ---
  'minimax':    'minimaxai/minimax-m2.7',

  // --- Google ---
  'gemma':      'google/gemma-4-31b-it',

  // --- OpenAI OSS (via NIM) ---
  'claude-3-opus':   'openai/gpt-oss-120b',
  'claude-3-sonnet': 'openai/gpt-oss-20b',
};

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
  'deepseek-ai/deepseek-v4-flash',
  'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'nvidia/nemotron-3-super-120b-a12b',
  'qwen/qwen3.5-122b-a10b',
  'mistralai/mistral-medium-3.5-128b',
  'mistralai/mistral-small-4-119b-2603',
  'z-ai/glm-5.1',
  'minimaxai/minimax-m2.7',
];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'OpenAI to NVIDIA NIM Proxy (Janitor AI Optimized)', 
    reasoning_display: SHOW_REASONING,
    thinking_mode: ENABLE_THINKING_MODE,
    nim_api_configured: !!NIM_API_KEY,
    available_models: Object.keys(MODEL_MAPPING).length,
    optimized_for: 'Janitor AI'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'OpenAI to NVIDIA NIM Proxy',
    version: '2.0',
    optimized_for: 'Janitor AI',
    status: 'running',
    endpoints: {
      health: '/health',
      models: '/v1/models',
      chat: '/v1/chat/completions'
    },
    featured_models: {
      best_quality: 'gpt-4 → deepseek-v4-pro (1M ctx)',
      balanced: 'gpt-4o → deepseek-v4-flash (fast MoE)',
      fastest: 'mistral-medium → mistral-medium-3.5 (free)'
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
          nimModel = 'deepseek-ai/deepseek-v4-flash';
        } else {
          nimModel = 'mistralai/mistral-medium-3.5-128b'; // Free endpoint default
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
      max_tokens: max_tokens || 4096,
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
    
    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: stream ? 'stream' : 'json'
    });
    
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
      errorMessage = 'Rate limit exceeded. Please try again in a moment.';
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
  console.log(`   • Thinking mode: ${ENABLE_THINKING_MODE ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`   • API key: ${NIM_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log('');
  console.log('🎯 Featured Models:');
  console.log('   • Best Quality: gpt-4 → DeepSeek V4 Pro (1M ctx)');
  console.log('   • Balanced: gpt-4o → DeepSeek V4 Flash (fast MoE)');
  console.log('   • Fastest: mistral-medium → Mistral Medium 3.5 (free)');
  console.log('═══════════════════════════════════════════════════════');
});
