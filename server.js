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
const SHOW_REASONING = false;

// 🔥 THINKING MODE TOGGLE - Enables thinking for specific models that support it
const ENABLE_THINKING_MODE = false;

// 🎯 OPTIMIZED MODEL MAPPING FOR JANITOR AI
// Best models from NVIDIA NIM API (January 2025)
const MODEL_MAPPING = {
  // Premium Reasoning Models (Best for Roleplay & Complex Conversations)
  'gpt-4': 'deepseek-ai/deepseek-v3.2',                                    // State-of-the-art 685B reasoning LLM
  'gpt-4-turbo': 'deepseek-ai/deepseek-v3.1',                              // Hybrid thinking mode, 128K context
  'gpt-4o': 'deepseek-ai/deepseek-v3.1-terminus',                          // Improved stability & agent behavior
  'claude-opus': 'nvidia/llama-3.1-nemotron-ultra-253b-v1',                // Highest accuracy, complex reasoning
  'claude-sonnet': 'nvidia/llama-3.3-nemotron-super-49b-v1.5',             // Great accuracy-efficiency balance
  
  // Fast & Efficient Models (Balanced Performance)
  'gpt-3.5-turbo': 'nvidia/llama-3.1-nemotron-nano-8b-v1',                 // Fast, efficient, good quality
  'gpt-3.5-turbo-16k': 'nvidia/nvidia-nemotron-nano-9b-v2',                // Hybrid Mamba-Transformer, 128K context
  'claude-haiku': 'nvidia/nemotron-3-nano-30b-a3b',                        // Best-in-class throughput, 1M tokens
  
  // Specialized Models
  'gemini-pro': 'qwen/qwen3-next-80b-a3b-thinking',                        // Hybrid attention, ultra-long context
  'gemini-pro-vision': 'nvidia/nemotron-nano-12b-v2-vl',                   // Multi-image, video understanding
  
  // Alternative Premium Options
  'gpt-4-reasoning': 'moonshotai/kimi-k2-instruct-1113',                   // Long context, enhanced reasoning
  'deepseek': 'deepseek-ai/deepseek-v3.1',                                 // Direct DeepSeek access
  
  // Fallback Models (Meta Llama)
  'llama-70b': 'meta/llama-3.1-70b-instruct',
  'llama-405b': 'meta/llama-3.1-405b-instruct',
  'llama-8b': 'meta/llama-3.1-8b-instruct'
};

// 🎨 THINKING-CAPABLE MODELS (for reasoning mode)
const THINKING_MODELS = [
  'deepseek-ai/deepseek-v3.2',
  'deepseek-ai/deepseek-v3.1',
  'deepseek-ai/deepseek-v3.1-terminus',
  'qwen/qwen3-next-80b-a3b-thinking',
  'nvidia/llama-3.1-nemotron-ultra-253b-v1',
  'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  'nvidia/llama-3.1-nemotron-nano-8b-v1',
  'nvidia/nvidia-nemotron-nano-9b-v2',
  'nvidia/nemotron-3-nano-30b-a3b'
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
      best_quality: 'gpt-4 → deepseek-v3.2 (685B params)',
      balanced: 'claude-sonnet → llama-3.3-nemotron-super (49B)',
      fastest: 'gpt-3.5-turbo → llama-3.1-nemotron-nano (8B)'
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
    // Check API key
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
    
    // Smart model selection with fallback
    let nimModel = MODEL_MAPPING[model];
    
    // If exact model not found, try intelligent fallback
    if (!nimModel) {
      try {
        // Test if the requested model exists directly on NVIDIA NIM
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
      
      // Intelligent fallback based on model name patterns
      if (!nimModel) {
        const modelLower = model.toLowerCase();
        
        // Match patterns for best model selection
        if (modelLower.includes('gpt-4') || modelLower.includes('opus')) {
          nimModel = 'deepseek-ai/deepseek-v3.2'; // Best quality
        } else if (modelLower.includes('deepseek')) {
          nimModel = 'deepseek-ai/deepseek-v3.1';
        } else if (modelLower.includes('claude-sonnet') || modelLower.includes('70b')) {
          nimModel = 'nvidia/llama-3.3-nemotron-super-49b-v1.5'; // Balanced
        } else if (modelLower.includes('3.5') || modelLower.includes('haiku') || modelLower.includes('fast')) {
          nimModel = 'nvidia/llama-3.1-nemotron-nano-8b-v1'; // Fast
        } else if (modelLower.includes('gemini') || modelLower.includes('qwen')) {
          nimModel = 'qwen/qwen3-next-80b-a3b-thinking';
        } else {
          // Default to balanced model for Janitor AI
          nimModel = 'nvidia/llama-3.3-nemotron-super-49b-v1.5';
        }
      }
    }
    
    // Transform OpenAI request to NIM format
    const nimRequest = {
      model: nimModel,
      messages: messages,
      temperature: temperature || 0.7, // Optimized for roleplay
      max_tokens: max_tokens || 4096,  // Good balance for conversations
      stream: stream || false
    };

    // Thinking mode is disabled - no extra_body or system prompts added
    
    // Make request to NVIDIA NIM API
    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: stream ? 'stream' : 'json'
    });
    
    if (stream) {
      // Handle streaming response without reasoning
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      let buffer = '';
      
      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            if (line.includes('[DONE]')) {
              res.write(line + '\n');
              return;
            }
            
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta) {
                const content = data.choices[0].delta.content;
                
                // Only show content, hide any reasoning
                if (content) {
                  data.choices[0].delta.content = content;
                } else {
                  data.choices[0].delta.content = '';
                }
                delete data.choices[0].delta.reasoning_content;
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
      // Transform NIM response to OpenAI format without reasoning
      const openaiResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: response.data.choices.map(choice => ({
          index: choice.index,
          message: {
            role: choice.message.role,
            content: choice.message?.content || ''
          },
          finish_reason: choice.finish_reason
        })),
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
    
    // Enhanced error messages
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
  console.log(`   • Reasoning display: ❌ DISABLED`);
  console.log(`   • Thinking mode: ❌ DISABLED`);
  console.log(`   • API key: ${NIM_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log('');
  console.log('🎯 Featured Models:');
  console.log('   • Best Quality: gpt-4 → DeepSeek V3.2 (685B)');
  console.log('   • Balanced: claude-sonnet → Llama Nemotron Super (49B)');
  console.log('   • Fastest: gpt-3.5-turbo → Llama Nemotron Nano (8B)');
  console.log('═══════════════════════════════════════════════════════');
});
