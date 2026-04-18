from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Any, Literal, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

from k2_cleanup import run_k2_cleanup  # noqa: E402
from video_gen import generate_film    # noqa: E402

app = FastAPI(title="Lullaby ML Service", version="0.3.0")


def _check_token(x_ml_token: str | None) -> None:
    expected = os.getenv("ML_SERVICE_TOKEN", "dev-token")
    if x_ml_token != expected:
        raise HTTPException(status_code=401, detail="Invalid ML service token")


# ── Request models ────────────────────────────────────────────────────────────

class Filters(BaseModel):
    visualStyle:   str = "watercolor"
    narratorVoice: str = "warm_mother"
    readingLevel:  str = "early_reader"
    tone:          str = "cozy"
    pacing:        str = "unhurried"

class TranscribeRequest(BaseModel):
    audioBase64: str | None = None
    mimeType:    str        = "audio/webm"

class CleanupRequest(BaseModel):
    transcript: str
    filters:    Optional[Filters] = None

class PlanRequest(BaseModel):
    transcript: str
    filters:    Filters

class RewriteRequest(BaseModel):
    transcript: str
    filters:    Filters

class Scene(BaseModel):
    id:         str
    prompt:     str
    seconds:    float = Field(default=4, ge=1, le=20)
    ambientTag: str   = "forest-night"

class ImagesRequest(BaseModel):
    scenes:  list[Scene]
    filters: Filters

class AudioNarrationRequest(BaseModel):
    script:  str
    filters: Filters

class AudioAmbientRequest(BaseModel):
    scenes:  list[Scene]
    filters: Filters

class VideoRequest(BaseModel):
    directorPrompt:  str
    cleanTranscript: str
    filters:         Optional[Filters] = None


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "service": "lullaby-ml-fastapi"}


# ── Transcribe — ElevenLabs Scribe v2 (from record branch) ───────────────────

def _transcribe_with_elevenlabs(audio_bytes: bytes, mime_type: str) -> dict:
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY is missing")

    model_id = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2")
    url      = os.getenv("ELEVENLABS_STT_URL", "https://api.elevenlabs.io/v1/speech-to-text")

    try:
        r = httpx.post(
            url,
            headers={"xi-api-key": api_key},
            files={"file": ("recording.webm", audio_bytes, mime_type)},
            data={"model_id": model_id},
            timeout=60.0,
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"ElevenLabs request failed: {exc}") from exc

    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"ElevenLabs STT failed ({r.status_code}): {r.text}")

    return r.json()


@app.post("/v1/transcribe")
def transcribe(req: TranscribeRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    if not req.audioBase64:
        raise HTTPException(status_code=400, detail="No audio payload provided")

    try:
        audio_bytes = base64.b64decode(req.audioBase64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 audio") from exc

    payload: dict = _transcribe_with_elevenlabs(audio_bytes, req.mimeType)
    provider: Literal["elevenlabs-scribe-v2"] = "elevenlabs-scribe-v2"

    text      = str(payload.get("text", "")).strip()
    words_raw = payload.get("words", [])
    words: list[dict[str, Any]] = []
    if isinstance(words_raw, list):
        for w in words_raw:
            if not isinstance(w, dict):
                continue
            token = w.get("text") or w.get("word")
            start = w.get("start", 0)
            end   = w.get("end", 0)
            if isinstance(token, str) and token:
                words.append({"word": token, "start": float(start), "end": float(end)})

    return {"text": text, "words": words, "provider": provider}


# ── Cleanup — K2 Think (from cleanupk2 branch) ───────────────────────────────

@app.post("/v1/cleanup")
def cleanup(req: CleanupRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)

    filters_dict: dict[str, str] = {}
    if req.filters:
        filters_dict = {
            "visualStyle":   req.filters.visualStyle,
            "narratorVoice": req.filters.narratorVoice,
            "readingLevel":  req.filters.readingLevel,
            "tone":          req.filters.tone,
            "pacing":        req.filters.pacing,
        }

    try:
        result = run_k2_cleanup(raw_transcript=req.transcript, language_tag=None, filters=filters_dict)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"K2 cleanup failed: {exc}") from exc

    return {
        "text":           result["clean_transcript"],
        "directorPrompt": result["director_prompt"],
        "language":       result.get("language", "en"),
        "provider":       "k2-think-v2",
    }


# ── Generate video — Veo + Google TTS ────────────────────────────────────────

@app.post("/v1/generate-video")
def generate_video(req: VideoRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)

    narrator_voice = req.filters.narratorVoice if req.filters else "warm_mother"

    try:
        scenes = generate_film(
            director_prompt=req.directorPrompt,
            clean_transcript=req.cleanTranscript,
            narrator_voice=narrator_voice,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Video generation failed: {exc}") from exc

    return {"scenes": scenes, "provider": "veo-3.0-fast + google-tts"}


# ── Stubs (kept from start/record branch) ────────────────────────────────────

@app.post("/v1/plan")
def plan(req: PlanRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    return {"provider": "stub", "scenes": [
        {"id": "scene-1", "prompt": f"{req.filters.visualStyle} opening", "seconds": 6, "ambientTag": "forest"},
        {"id": "scene-2", "prompt": f"{req.filters.visualStyle} closing", "seconds": 6, "ambientTag": "night"},
    ]}

@app.post("/v1/rewrite")
def rewrite(req: RewriteRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    return {"provider": "stub", "script": req.transcript}

@app.post("/v1/images")
def images(req: ImagesRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    return {"provider": "stub", "fallbackUsed": False, "imageUrls": []}

@app.post("/v1/audio/narration")
def narration(req: AudioNarrationRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    return {"provider": "stub", "audioBase64": ""}

@app.post("/v1/audio/ambient")
def ambient(req: AudioAmbientRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    return {"provider": "stub", "audioBase64": ""}
