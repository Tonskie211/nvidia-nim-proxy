# OpenAI to NVIDIA NIM Proxy - Janitor AI Optimized 🚀

A high-performance proxy server that connects Janitor AI to NVIDIA's powerful NIM API, featuring the best models for roleplay and conversations including **DeepSeek V3.2**, **Llama Nemotron**, and more.

## ✨ Features

- ✅ **Janitor AI Optimized** - Perfect model selection for roleplay
- ✅ **Latest Models** - DeepSeek V3.2, V3.1-Terminus, Nemotron 3, Qwen3-Next
- ✅ **Smart Fallbacks** - Automatic model routing
- ✅ **Streaming Support** - Real-time responses
- ✅ **Reasoning Mode** - Optional thinking display
- ✅ **OpenAI Compatible** - Drop-in replacement

## 🎯 Best Models for Janitor AI

| Model Alias | NVIDIA NIM Model | Parameters | Best For |
|------------|------------------|------------|----------|
| `gpt-4` | deepseek-v3.2 | 685B | 🏆 Highest quality roleplay |
| `gpt-4-turbo` | deepseek-v3.1 | 685B | Hybrid thinking, 128K context |
| `gpt-4o` | deepseek-v3.1-terminus | 685B | Improved stability |
| `claude-opus` | llama-3.1-nemotron-ultra | 253B | Complex reasoning |
| `claude-sonnet` | llama-3.3-nemotron-super | 49B | ⚡ Best balance |
| `gpt-3.5-turbo` | llama-3.1-nemotron-nano | 8B | ⚡ Fastest responses |
| `gemini-pro` | qwen3-next-80b | 80B | Ultra-long context |

## 🚀 Quick Setup for Render.com

### 1. Get Your NVIDIA API Key

1. Go to [build.nvidia.com](https://build.nvidia.com)
2. Sign in with your email
3. Click **"Get API Key"**
4. Copy your key (starts with `nvapi-...`)

### 2. Deploy to Render

1. **Fork/Upload this code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git push
   ```

2. **Create Web Service on Render**
   - Go to [render.com](https://render.com)
   - Click **"New +"** → **"Web Service"**
   - Connect your GitHub repository
   - Configure:
     - **Name**: `nvidia-nim-janitorai` (or any name)
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`

3. **Add Environment Variable**
   - Click **"Environment"** tab
   - Add variable:
     - **Key**: `NIM_API_KEY`
     - **Value**: Your NVIDIA API key

4. **Deploy!**
   - Click **"Create Web Service"**
   - Wait 2-3 minutes for deployment
   - Copy your URL: `https://your-service.onrender.com`

### 3. Connect to Janitor AI

1. Go to [janitorai.com](https://janitorai.com)
2. Click **Settings** → **API Settings**
3. Select **"OpenAI"** as API type
4. Enter:
   - **API URL**: `https://your-service.onrender.com/v1`
   - **API Key**: Any text (not used, but required by Janitor AI)
5. **Save** and start chatting!

## 🎨 Recommended Model Settings for Janitor AI

### For Best Quality (Slower but Better)
- Model: `gpt-4` or `claude-opus`
- Temperature: `0.7-0.9`
- Max Tokens: `2048-4096`

### For Balanced Performance (Recommended)
- Model: `claude-sonnet` or `gpt-4-turbo`
- Temperature: `0.7`
- Max Tokens: `2048`

### For Fastest Responses
- Model: `gpt-3.5-turbo` or `claude-haiku`
- Temperature: `0.8`
- Max Tokens: `1024`

## 🔧 Optional Configuration

### Enable Thinking Mode (See Model Reasoning)
Add environment variable in Render:
- **Key**: `ENABLE_THINKING_MODE`
- **Value**: `true`

### Show Reasoning in Responses
Add environment variable:
- **Key**: `SHOW_REASONING`
- **Value**: `true`

## 📊 API Endpoints

### Health Check
```bash
GET /health
```

Returns server status and configuration.

### List Models
```bash
GET /v1/models
```

Returns all available models.

### Chat (Main Endpoint)
```bash
POST /v1/chat/completions
```

OpenAI-compatible chat endpoint.

**Example:**
```bash
curl -X POST https://your-service.onrender.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}],
    "temperature": 0.7
  }'
```

## 🆘 Troubleshooting

### "NIM_API_KEY not configured"
- Make sure you added the environment variable in Render
- Check spelling: `NIM_API_KEY`
- Restart the service after adding

### Service is slow on first request
- Free tier on Render spins down after 15 min inactivity
- First request wakes it up (30-60 seconds)
- Subsequent requests are instant

### "Invalid NVIDIA API key"
- Verify your key at [build.nvidia.com](https://build.nvidia.com)
- Make sure it starts with `nvapi-`
- Generate a new key if needed

### Model not responding
- Try a different model (e.g., `claude-sonnet`)
- Check `/health` endpoint to verify configuration
- View Render logs for error details

## 📈 Model Comparison

### DeepSeek V3.2 (gpt-4)
- ✅ Best overall quality
- ✅ 685B parameters
- ✅ State-of-the-art reasoning
- ⚠️ Slower response time
- 🎯 Best for: Complex roleplay, detailed responses

### Llama Nemotron Super 49B (claude-sonnet)
- ✅ Excellent quality
- ✅ 2-3x faster than DeepSeek
- ✅ Great balance
- ✅ Fits on single GPU
- 🎯 Best for: Most users, balanced performance

### Llama Nemotron Nano 8B (gpt-3.5-turbo)
- ✅ Very fast
- ✅ Good quality
- ✅ Low latency
- ⚠️ Simpler responses
- 🎯 Best for: Quick conversations, speed priority

## 🔄 Updates & Maintenance

The proxy automatically:
- ✅ Tests if requested models exist directly on NVIDIA
- ✅ Falls back intelligently based on model name patterns
- ✅ Handles streaming and non-streaming requests
- ✅ Provides enhanced error messages

## 📜 Model Mapping Reference

```javascript
'gpt-4' → 'deepseek-ai/deepseek-v3.2'
'gpt-4-turbo' → 'deepseek-ai/deepseek-v3.1'
'gpt-4o' → 'deepseek-ai/deepseek-v3.1-terminus'
'claude-opus' → 'nvidia/llama-3.1-nemotron-ultra-253b-v1'
'claude-sonnet' → 'nvidia/llama-3.3-nemotron-super-49b-v1.5'
'gpt-3.5-turbo' → 'nvidia/llama-3.1-nemotron-nano-8b-v1'
'claude-haiku' → 'nvidia/nemotron-3-nano-30b-a3b'
'gemini-pro' → 'qwen/qwen3-next-80b-a3b-thinking'
```

## 💡 Tips for Best Results

1. **Start with `claude-sonnet`** - Best balance of quality and speed
2. **Use `gpt-4` for special scenes** - When you need the absolute best
3. **Adjust temperature** - Higher (0.9) = more creative, Lower (0.5) = more focused
4. **Set appropriate max_tokens** - 2048 is usually perfect for Janitor AI
5. **Enable thinking mode** - See how the model reasons (optional)

## 🔐 Security Notes

- Your NVIDIA API key is only stored in Render environment variables
- Janitor AI never sees your actual API key
- All communication uses HTTPS
- No data is logged or stored by the proxy

## 📞 Support

Having issues? Check:
1. Render logs for error messages
2. `/health` endpoint for configuration
3. NVIDIA API key is valid
4. Environment variables are set correctly

## 📄 License

MIT License - Free to use and modify

---

**Made for Janitor AI users** 🤖💬

Enjoy chatting with the most powerful AI models available!
