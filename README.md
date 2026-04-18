# Lullaby

Web app scaffold: spoken story → narrated illustrated film (see `prd.md`).

## Structure

| Path | Stack |
|------|--------|
| `frontend/` | React 19, Vite 6, TypeScript, Tailwind CSS |
| `backend/` | Node.js, Express, TypeScript, Zod |

**API (stub pipeline)**

- `GET /api/health` — liveness
- `POST /api/jobs` — multipart form: field `audio` (file), optional `filters` (JSON string of partial filter object)
- `GET /api/jobs/:id` — job status and stub results
- `POST /api/jobs/:id/refilter` — JSON `{ "filters": { ...partial } }`

In-memory job store resets on server restart. Replace `backend/src/pipeline/runPipeline.ts` with Whisper → LLM → images → Gemini audio → FFmpeg.

## Setup

```bash
cd HackPrinceton
npm install
```

From the repo root:

```bash
npm run dev
```

Runs the Vite dev server (frontend) and the API (backend) together. Open **http://localhost:5173** — the UI proxies `/api` to **http://localhost:3001**.

### Run workspaces separately

```bash
npm run dev -w frontend
npm run dev -w backend
```

### Environment

Copy `backend/.env.example` to `backend/.env` and adjust if needed. `FRONTEND_ORIGIN` must match the Vite URL for CORS.

## Build

```bash
npm run build
```

Outputs `frontend/dist` and `backend/dist`.

## Next steps

1. Implement real transcription (Whisper) in the pipeline.
2. Persist jobs / uploads (e.g. Supabase) instead of `jobsStore`.
3. Add picker UI for the five filter axes and pass them through `createJob`.
