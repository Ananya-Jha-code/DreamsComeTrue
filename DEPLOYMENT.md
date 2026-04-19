# Deployment Plan (PRD Stack)

## Frontend

- Platform: **Vercel**
- Project root: `frontend/`
- Build command: `npm run build`
- Output directory: `dist`

## Backend Services

Use **Render** for both Express + FastAPI.

- Blueprint file: `render.yaml` (repository root)
- Backend service root: `backend/`
- ML service root: `ml-service/`
- Both services can run on Render free tier

## Required Runtime Services

- Express API (`backend/src/index.ts`)
- FastAPI ML service (`ml-service/main.py`)
- FFmpeg binary available where orchestration runs
- Supabase credentials as secrets

## Required Secrets

### Express
- `ML_SERVICE_URL`
- `ML_SERVICE_TOKEN`
- `FRONTEND_ORIGIN`

### FastAPI
- `ML_SERVICE_TOKEN`
- `ELEVENLABS_API_KEY`
- `K2THINK_API_KEY`
- `TOGETHER_API_KEY`
- `FLUX_MODEL` (optional, defaults to `black-forest-labs/FLUX.2-pro`)

## Network Rules

- FastAPI should not be publicly exposed without token checks.
- Express should call FastAPI via private URL/internal network when possible.

## Render + Vercel Wiring

1. Deploy the Render blueprint from `render.yaml`.
2. Set backend `ML_SERVICE_URL` to your Render ML service URL.
3. Set the same `ML_SERVICE_TOKEN` on both backend and ML services.
4. Set backend `FRONTEND_ORIGIN` to your Vercel domain.
5. In Vercel, set `VITE_API_BASE_URL` to your backend Render URL.
