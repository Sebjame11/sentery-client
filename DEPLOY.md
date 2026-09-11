# Sentery — GCP Deployment Guide

## Prerequisites

- GCP account with billing enabled
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated
- A Supabase project (free tier works)
- Google Cloud OAuth credentials (for Gmail integration)
- Resend API key (optional, for fallback email sending)

---

## Step 1: Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste the contents of `supabase-schema.sql` → run
3. Note your:
   - Project URL: `https://XXXX.supabase.co`
   - Anon key (Settings → API → `anon` `public`)
   - Service role key (Settings → API → `service_role` `secret`)

---

## Step 2: Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable **Gmail API** (APIs & Services → Library → search "Gmail")
4. Create **OAuth 2.0 credentials** (APIs & Services → Credentials → Create Credentials → OAuth client ID)
   - Application type: **Web application**
   - Authorized redirect URIs: `https://api.YOUR-DOMAIN.com/api/google/callback`
5. Note your **Client ID** and **Client Secret**

---

## Step 3: Configure Environment

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in all values in `.env` (see `.env.example` for reference)

---

## Step 4: Build & Test Locally

```bash
# Build the Docker image
docker build \
  --build-arg VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=your-anon-key \
  -t sentery-local .

# Run it
docker run -p 3001:3001 --env-file .env sentery-local

# Or use docker-compose
docker-compose up --build
```

Open `http://localhost:3001` — the app should load with your Supabase data.

---

## Step 5: Deploy to GCP

### Option A: Cloud Build (recommended — auto-deploys on push)

1. Create a GCP project:
   ```bash
   gcloud projects create sentery-prod --name="Sentery"
   gcloud config set project sentery-prod
   ```

2. Enable required APIs:
   ```bash
   gcloud services enable run.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable containerregistry.googleapis.com
   ```

3. Set up authentication:
   ```bash
   gcloud auth configure-docker
   ```

4. Build and deploy manually:
   ```bash
   gcloud builds submit --config cloudbuild.yaml .
   ```

5. Or connect your GitHub repo to Cloud Build for auto-deploy:
   - Go to [Cloud Build](https://console.cloud.google.com/cloud-build) → Triggers → Create Trigger
   - Connect your repo, use `cloudbuild.yaml` as the build config
   - Set substitution variables in the trigger

### Option B: Manual Docker deploy

```bash
# Build
gcloud builds submit --tag gcr.io/YOUR-PROJECT/sentery

# Deploy to Cloud Run
gcloud run deploy sentery \
  --image gcr.io/YOUR-PROJECT/sentery \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --port 3001 \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars SUPABASE_URL=https://YOUR-PROJECT.supabase.co,SUPABASE_SERVICE_ROLE_KEY=your-key,GOOGLE_CLIENT_ID=id,GOOGLE_CLIENT_SECRET=secret,RESEND_API_KEY=key,APP_URL=https://YOUR-DOMAIN,MCP_SERVER_URL=https://api.YOUR-DOMAIN,SYNC_SECRET=any-string,CORS_ORIGINS=https://YOUR-DOMAIN
```

---

## Step 6: Set Up Domain (Optional)

1. In Cloud Run, you'll get a URL like `https://sentery-abc123-xx.a.run.app`
2. To use a custom domain:
   - Go to [Cloud Run](https://console.cloud.google.com/run) → your service → **Manage Custom Domains**
   - Add your domain, follow the DNS verification steps
3. Update your Supabase Google OAuth redirect URI to match

---

## Step 7: Create First User

1. Open your deployed app
2. Sign up with any email
3. Go to Supabase → Authentication → Users → confirm the user
4. The user will auto-get a workspace via the `handle_new_user` trigger

---

## Architecture

```
                    ┌─────────────────────────────────┐
                    │        Cloud Run (sentery)       │
                    │                                  │
                    │  Express backend (port 3001)     │
                    │  ├─ /api/*  → API routes         │
                    │  ├─ /mcp    → MCP endpoint       │
                    │  └─ /*      → React SPA (static) │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────┴───────────────────┐
                    │         Supabase (managed)        │
                    │  PostgreSQL + Auth + Realtime      │
                    └──────────────────────────────────┘
```

Single container: backend + frontend built into one Docker image.
No separate hosting needed for the frontend.

---

## Updating

```bash
# Pull latest code
git pull

# Rebuild and deploy
gcloud builds submit --config cloudbuild.yaml .
```

Or if using auto-deploy, just push to your repo.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| CORS errors | Add your domain to `CORS_ORIGINS` env var |
| OAuth redirect mismatch | Update Google OAuth redirect URI to match `GOOGLE_REDIRECT_URI` |
| Blank page | Check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly |
| API 502 | Check Cloud Run logs: `gcloud logs read --service=sentery` |
| Cold starts | Set `--min-instances 1` (costs more but no cold start) |
