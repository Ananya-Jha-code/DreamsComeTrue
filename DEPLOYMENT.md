# Deployment Plan (PRD Stack)

## Frontend

- Platform: **Vercel**
- Project root: `frontend/`
- Build command: `npm run build`
- Output directory: `dist`

## Backend Services

Choose one platform for both Express + FastAPI:

1. **Fly.io** (recommended for one app with two processes)
2. **Modal** (function-first; can host ML endpoints and/or orchestration API)

## Required Runtime Services

- Express API (`backend/src/index.ts`)
- FastAPI ML service (`ml-service/main.py`)
- FFmpeg binary available where orchestration runs
- Supabase credentials as secrets

## Required Secrets

### Express
- `ML_SERVICE_URL`
- `ML_SERVICE_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### FastAPI
- `ML_SERVICE_TOKEN`
- `GOOGLE_API_KEY`
- `REPLICATE_API_TOKEN`
- `FAL_KEY`
- `WHISPER_PROVIDER` (`replicate` or `modal`)

## Network Rules

- FastAPI should not be publicly exposed without token checks.
- Express should call FastAPI via private URL/internal network when possible.
