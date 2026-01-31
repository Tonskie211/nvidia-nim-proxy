# 🚀 Quick Setup Guide for Janitor AI

## Step 1: Get NVIDIA API Key (2 minutes)

1. Go to: https://build.nvidia.com
2. Click "Get API Key"
3. Sign in with email
4. Copy your key (starts with `nvapi-`)

## Step 2: Deploy to Render (3 minutes)

1. Upload these files to GitHub
2. Go to: https://render.com
3. Create "New Web Service"
4. Connect your GitHub repo
5. Settings:
   - Runtime: **Node**
   - Build: `npm install`
   - Start: `npm start`
6. Add Environment Variable:
   - Key: `NIM_API_KEY`
   - Value: [paste your NVIDIA key]
7. Click "Create Web Service"
8. Wait 2-3 minutes
9. Copy your URL: `https://your-app.onrender.com`

## Step 3: Connect to Janitor AI (1 minute)

1. Go to: https://janitorai.com
2. Settings → API Settings
3. Select "OpenAI"
4. Enter:
   - API URL: `https://your-app.onrender.com/v1`
   - API Key: `anything` (any text works)
5. Save and start chatting!

## 🎯 Recommended Models

- **gpt-4** - Best quality (slower)
- **claude-sonnet** - Balanced (recommended) ⭐
- **gpt-3.5-turbo** - Fastest

## 🎨 Recommended Settings

- Temperature: 0.7-0.8
- Max Tokens: 2048
- Top P: 0.95

## ✅ Done!

Your Janitor AI is now powered by NVIDIA's best models!

### Test Your Setup

Visit: `https://your-app.onrender.com/health`

You should see:
```json
{
  "status": "ok",
  "nim_api_configured": true
}
```

---

**Need help?** Check the full README.md
