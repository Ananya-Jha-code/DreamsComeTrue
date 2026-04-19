# DreamsComeTrue

> **Speak a story. Watch it become a picture book.**

[![HackPrinceton Spring 2026](https://img.shields.io/badge/HackPrinceton-Spring%202026-gold?style=flat-square)](https://hackprinceton.com)
[![Built in 36 Hours](https://img.shields.io/badge/Built%20in-36%20Hours-blueviolet?style=flat-square)](https://github.com/Ananya-Jha-code/DreamsComeTrue)
[![K2 Think v2](https://img.shields.io/badge/Powered%20by-K2%20Think%20v2-orange?style=flat-square)](https://k2think.ai)
[![Gemini 2.5 Flash](https://img.shields.io/badge/Images-Gemini%202.5%20Flash-blue?style=flat-square)](https://deepmind.google/gemini)
[![ElevenLabs](https://img.shields.io/badge/Voice-ElevenLabs%20Scribe%20v2-yellow?style=flat-square)](https://elevenlabs.io)

---

You speak. Ninety seconds later, **a fully illustrated picture book exists** — every paragraph its own painted page, styled to your taste.

DreamsComeTrue is a real-time AI pipeline that turns a single voice recording into a multi-page illustrated storybook. Choose your art style before you speak. Watch pages appear as they're painted. No typing. No prompting. Just tell the story the way you'd tell it to a child.

---

## The Pipeline

```
  🎙  Voice Recording
       Browser MediaRecorder → WebM audio
          │
          ▼
  📝  ElevenLabs Scribe v2
       Speech-to-text with word-level timing
       Raw transcript + detected language
          │
          ▼
  🧠  K2 Think v2  ←  THE AUTHOR
       Strips filler words & transcription noise
       Structures story into 3–6 picture-book paragraphs
       Invents a book title
       Bakes in your chosen style, tone & reading level
          │
          ▼
  🎨  Gemini 2.5 Flash  (one illustration per paragraph)
       Director-prompted per page
       Character continuity enforced across all spreads
       Aspect-locked 3:4 picture-book format
          │
          ▼
  📖  Your Picture Book
       Pages stream in as they finish painting
       Download any page. Share the whole book.
```

End-to-end in **under 90 seconds**.

---

## K2 Think v2 — The Author in the Machine

The most unusual architectural choice here is what sits at the center of the pipeline: **K2 Think v2**, a model from MBZUAI-IFM that was designed for deep reasoning and structured multi-step problem solving.

We didn't use it for reasoning. We used it as a **writer**.

Most projects reach for GPT-4o or Claude for creative tasks. We gave K2 the hardest job in the system — and it delivered. In a single API call, K2:

**1. Edits the raw transcript.**
Speech-to-text output is messy. K2 strips "um", "like", false starts, and transcription artifacts while preserving the speaker's voice, rhythm, and intent. It doesn't rewrite — it *uncovers* the story that was already there.

**2. Structures a picture book.**
It decides where page breaks go. It segments the narrative into 3–6 self-contained paragraphs, each rich enough to paint but not so long it overwhelms a spread. Vocabulary is adapted to the chosen reading level.

**3. Titles the book.**
One child-friendly, evocative title. Every time.

**4. Internalizes the filter matrix.**
Style, tone, and reading level aren't labels passed downstream — K2 integrates them into *how it writes*. A "mysterious" grade-school story reads structurally different from a "cozy" toddler one. The model shapes the prose accordingly before a single image prompt is built.

All of this returns as strict JSON:

```json
{
  "clean_transcript": "Once there was a fox who lived...",
  "language": "en",
  "book_title": "The Fox Who Counted Stars",
  "picture_book_paragraphs": [
    "Once there was a small red fox who lived at the edge of a silver forest...",
    "Every night she climbed the tallest pine tree and counted the stars...",
    "One evening she counted one extra star — and it blinked back."
  ]
}
```

K2 runs at `temperature: 0.3` with JSON mode enforced — consistent enough for a pipeline, creative enough for a story.

> K2 Think v2 is typically deployed for structured reasoning and agentic tasks. DreamsComeTrue repurposes it as a creative writing orchestrator — leveraging its instruction-following precision not to answer questions, but to *author*.

---

## 120 Ways to Dream the Same Story

Before you record, you pick three things:

| Axis | Options | Choices |
|------|---------|---------|
| **Visual Style** | 6 | Watercolor Storybook · Studio Ghibli · Pixar / 3D · Paper Cutout · Charcoal Sketch · Crayon Drawing |
| **Reading Level** | 4 | Toddler (2–3) · Early Reader (4–6) · Grade School (7–10) · Advanced (11+) |
| **Tone** | 5 | Cozy · Adventurous · Whimsical · Mysterious · Tender |

**6 × 4 × 5 = 120 distinct picture books from one spoken story.**

These aren't cosmetic filters. They flow into K2 (which adjusts prose structure and vocabulary) and into Gemini (which shifts the illustrated aesthetic). The same bedtime story becomes a brooding charcoal mystery at grade-school level, or a warm crayon adventure for toddlers — genuinely different books.

---

## Director Prompts — How We Talk to Gemini

Gemini 2.5 Flash is a powerful model, but getting it to paint *continuous characters* across *multiple pages* required treating each generation like a film production brief:

```
[DIRECTOR PROMPT — Page 2 of 4]

BOOK: "The Fox Who Counted Stars"
SCENE: Every night she climbed the tallest pine tree and counted the stars.

CONTINUITY: Opening — a small red fox at the edge of a silver forest.
[Full transcript excerpt for visual reference across all pages]

STYLE: Studio Ghibli hand-painted. Early reader. Tone: whimsical.

COMPOSITION: Full-page picture-book spread. Cinematic depth.
Maintain character appearance from page 1. Children's illustration.

STRICT: Zero readable text. No letters, words, watermarks, or symbols.
```

Every page gets the full story context. The result: illustrations that feel like they belong to the same book.

---

## Architecture

```
┌──────────────────┐                    ┌────────────────────────────┐
│  React Frontend  │  ←── polling ────► │  Express Backend           │
│  Vite · Three.js │                    │  TypeScript · Zod          │
│  Tailwind CSS    │  ──POST /jobs ───► │  Async job pipeline        │
└──────────────────┘                    └──────────────┬─────────────┘
                                                       │ x-ml-token
                                                       ▼
                                        ┌────────────────────────────┐
                                        │  FastAPI ML Service        │
                                        │  Python · httpx            │
                                        │                            │
                                        │  /v1/transcribe            │
                                        │    → ElevenLabs Scribe v2  │
                                        │                            │
                                        │  /v1/cleanup               │
                                        │    → K2 Think v2           │
                                        │                            │
                                        │  /v1/illustration          │
                                        │    → Gemini 2.5 Flash      │
                                        └────────────────────────────┘
```

**Why a separate ML service?**
Provider API keys never reach the frontend. The Express server and FastAPI service authenticate via a shared internal token. Swapping any AI provider requires a single config change — nothing in the frontend changes.

**Why async + polling?**
The backend returns a `202` immediately and runs the pipeline in the background. The frontend polls every 1.2 seconds. Pages update in the job record as each one finishes — so the UI can show illustrations arriving progressively instead of waiting for the full book.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 · Vite 6 · Tailwind CSS · Three.js |
| Backend | Express.js · TypeScript · Zod |
| ML Service | FastAPI · Python · httpx |
| Transcription | ElevenLabs Scribe v2 |
| Story Authoring | **K2 Think v2** (MBZUAI-IFM) |
| Illustration | **Gemini 2.5 Flash** (Google DeepMind) |

---

## Running Locally

### Prerequisites
- Node.js 20+, Python 3.11+
- API keys: ElevenLabs, Google AI (Gemini), K2 Think

### ML Service
```bash
cd ml-service
cp .env.example .env   # fill in API keys + ML_SERVICE_TOKEN
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```

### Backend
```bash
cd backend
cp .env.example .env   # ML_SERVICE_URL + ML_SERVICE_TOKEN (same token)
npm install && npm run dev   # :3001
```

### Frontend
```bash
cd frontend
npm install && npm run dev   # :5173
```

Open `http://localhost:5173`. Pick a style. Tell a story.

---

## Environment Variables

**`ml-service/.env`**
```env
ELEVENLABS_API_KEY=
GOOGLE_AI_API_KEY=
K2THINK_API_KEY=
ML_SERVICE_TOKEN=
K2_TEMPERATURE=0.3
```

**`backend/.env`**
```env
ML_SERVICE_URL=http://localhost:8000
ML_SERVICE_TOKEN=
PORT=3001
```

---

## What Makes This Different

Most AI storytelling tools ask you to type. DreamsComeTrue asks you to **speak** — because that's how stories actually get told to children.

Most pipelines treat the LLM as a formatter. We treat K2 Think v2 as a **co-author** — giving it the speaker's exact words and trusting its reasoning capabilities to find the story inside the noise.

Most image generation pipelines produce disconnected illustrations. Ours uses director prompts carrying **full narrative continuity** — the same fox, the same forest, the same silver light — across every page.

The result isn't a demo. It's a book.

---

*Built in 36 hours at HackPrinceton Spring 2026 · Entertainment & Media Track*

*"A story doesn't have one correct form. Every dream deserves its own shape."*
