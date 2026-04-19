# Lullaby

Web app scaffold for the PRD pipeline: spoken story -> narrated illustrated picture book.

## Required Stack (Strict)

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express + FastAPI (ML calls) |
| Transcription | Whisper large-v3 on Modal or Replicate |
| Cleanup / Planning / Rewrite | K2 Think primary, Gemini 2.5 Pro fallback |
| Image generation | FLUX.1-schnell primary for page illustrations, local SVG fallback |
| Narration audio | Gemini 2.5 native multimodal TTS |
| Ambient audio | Gemini 2.5 multimodal audio |
| Assembly | Page-by-page image composition |
| Storage | Supabase (session cache + temporary image hosting) |
| Deployment | Vercel (frontend), Modal or Fly.io (backend services) |

## Repository Structure

| Path | Purpose |
|---|---|
- `frontend/` | React + Vite + Tailwind UI |
- `backend/` | Express public API, job orchestration |
- `ml-service/` | FastAPI internal ML gateway (Whisper/K2/FLUX adapters) |

## Service Boundaries

- Express (`backend`) is the public app API: receives uploads, tracks jobs, calls internal ML service, handles orchestration and eventual FFmpeg + Supabase.
- FastAPI (`ml-service`) is internal-only ML gateway:
  - `/v1/transcribe` (ElevenLabs speech-to-text)
  - `/v1/cleanup` (K2 Think paragraph planning)
  - `/v1/illustration` (FLUX page art)

## APIs (Express)

- `GET /api/health`
- `POST /api/jobs` (multipart: `audio`, optional `filters` JSON string)
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/refilter`

## Local Setup

```bash
cd HackPrinceton
npm install
```

Install Python deps for FastAPI with Python 3.12:

```bash
py -3.12 -m pip install -r ml-service/requirements.txt
```

Run frontend + express:

```bash
npm run dev
```

Run the full local stack with one command:

```bash
npm run dev:full
```

`dev:full` starts the frontend, backend, and ML service together. It uses Python 3.12 for the ML service so the FastAPI dependencies install and run correctly on Windows.

## Docker Setup

Run the full stack with Docker (no local Node/Python dependency install required):

```bash
docker compose up --build -d
```

Before running, set `ELEVENLABS_API_KEY` in your shell so `docker-compose.yml` can pass it to `ml-service`.

PowerShell:

```powershell
$env:ELEVENLABS_API_KEY="your_key_here"
docker compose up --build -d
```

Services:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3001/api/health`
- ML service health: `http://localhost:8000/health`

Stop containers:

```bash
docker compose down
```

## Environment

- Copy `backend/.env.example` -> `backend/.env`
- Copy `ml-service/.env.example` -> `ml-service/.env`
- Put your ElevenLabs API key in `ml-service/.env` as `ELEVENLABS_API_KEY=...`
- Never commit real keys.

For the current transcription flow, `ELEVENLABS_API_KEY` is the only required ML service secret. `K2THINK_API_KEY` enables paragraph planning and `FLUX_API_KEY` (or `REPLICATE_API_TOKEN`) enables illustration generation.

## Build

```bash
npm run build
```

Outputs `frontend/dist` and `backend/dist`.

## Important Note

Current ML/Ffmpeg/Supabase logic is scaffold-level and intentionally stubbed in places, but the architecture and provider/fallback boundaries now match the picture-book workflow above.
