from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import FastAPI, Header, HTTPException
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from k2_cleanup import run_k2_cleanup

app = FastAPI(title="Lullaby ML Service", version="0.1.0")

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))


def _check_token(x_ml_token: str | None) -> None:
    expected = os.getenv("ML_SERVICE_TOKEN", "dev-token")
    if x_ml_token != expected:
        raise HTTPException(status_code=401, detail="Invalid ML service token")


class Filters(BaseModel):
    visualStyle: str
    narratorVoice: str
    readingLevel: str
    tone: str
    pacing: str


class TranscribeRequest(BaseModel):
    audioBase64: str | None = None
    mimeType: str = "audio/webm"


class CleanupRequest(BaseModel):
    transcript: str
    language: str | None = None
    filters: Filters


class CleanupResponse(BaseModel):
    """OpenAPI + stable JSON body for /v1/cleanup (K2 field names)."""

    clean_transcript: str
    language: str
    director_prompt: str
    raw_model_json: dict[str, Any]
    provider: str


class PlanRequest(BaseModel):
    transcript: str
    filters: Filters
    language: str | None = None
    director_prompt: str | None = None


class RewriteRequest(BaseModel):
    transcript: str
    filters: Filters
    language: str | None = None
    director_prompt: str | None = None


class Scene(BaseModel):
    id: str
    prompt: str
    seconds: float = Field(default=4, ge=1, le=20)
    ambientTag: str = "forest-night"


class ImagesRequest(BaseModel):
    scenes: list[Scene]
    filters: Filters


class AudioNarrationRequest(BaseModel):
    script: str
    filters: Filters


class AudioAmbientRequest(BaseModel):
    scenes: list[Scene]
    filters: Filters


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "service": "lullaby-ml-fastapi"}


def _transcribe_with_elevenlabs(audio_bytes: bytes, mime_type: str) -> dict:
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="ELEVENLABS_API_KEY is missing in ml-service environment",
        )

    model_id = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2")
    url = os.getenv("ELEVENLABS_STT_URL", "https://api.elevenlabs.io/v1/speech-to-text")

    headers = {"xi-api-key": api_key}
    files = {
        "file": ("recording.webm", audio_bytes, mime_type),
    }
    data = {
        "model_id": model_id,
    }

    try:
        response = httpx.post(url, headers=headers, files=files, data=data, timeout=60.0)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"ElevenLabs request failed: {exc}") from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"ElevenLabs STT failed ({response.status_code}): {response.text}",
        )

    return response.json()


def _language_from_elevenlabs(payload: dict) -> str | None:
    """Best-effort language tag from ElevenLabs STT JSON (no extra API call)."""
    for key in ("language_code", "language", "detected_language"):
        val = payload.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    meta = payload.get("metadata")
    if isinstance(meta, dict):
        for key in ("language_code", "language"):
            val = meta.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    analysis = payload.get("analysis")
    if isinstance(analysis, dict):
        val = analysis.get("language_code") or analysis.get("language")
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


@app.post("/v1/transcribe")
def transcribe(req: TranscribeRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    if not req.audioBase64:
        raise HTTPException(status_code=400, detail="No audio payload provided to ML service")

    try:
        audio_bytes = base64.b64decode(req.audioBase64)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid base64 audio payload") from exc

    payload = _transcribe_with_elevenlabs(audio_bytes, req.mimeType)
    provider: Literal["elevenlabs-scribe-v2"] = "elevenlabs-scribe-v2"

    text = str(payload.get("text", "")).strip()
    words_raw = payload.get("words", [])
    words: list[dict[str, float | str]] = []
    if isinstance(words_raw, list):
        for w in words_raw:
            if not isinstance(w, dict):
                continue
            token = w.get("text") or w.get("word")
            start = w.get("start", 0)
            end = w.get("end", 0)
            if isinstance(token, str) and token:
                words.append(
                    {
                        "word": token,
                        "start": float(start) if isinstance(start, (int, float)) else 0.0,
                        "end": float(end) if isinstance(end, (int, float)) else 0.0,
                    }
                )

    language = _language_from_elevenlabs(payload)

    return {
        "text": text,
        "words": words,
        "language": language,
        "provider": provider,
    }


@app.post("/v1/cleanup", response_model=CleanupResponse)
def cleanup(req: CleanupRequest, x_ml_token: str | None = Header(default=None)) -> CleanupResponse:
    _check_token(x_ml_token)
    try:
        out = run_k2_cleanup(
            raw_transcript=req.transcript,
            language_tag=req.language,
            filters=req.filters.model_dump(),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return CleanupResponse(
        clean_transcript=out["clean_transcript"],
        language=out["language"],
        director_prompt=out["director_prompt"],
        raw_model_json=out["raw_model_json"],
        provider="k2think-k2-cleanup",
    )


@app.post("/v1/plan")
def plan(req: PlanRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    _ = (req.language, req.director_prompt)  # wired for next: K2 scene JSON
    return {
        "provider": "k2-think-primary-gemini-2.5-pro-fallback",
        "scenes": [
            {
                "id": "scene-1",
                "prompt": f"{req.filters.visualStyle} storybook scene, moonlit garden, coherent character consistency",
                "seconds": 4,
                "ambientTag": "garden-night",
            },
            {
                "id": "scene-2",
                "prompt": f"{req.filters.visualStyle} close-up, emotional beat, warm cinematic lighting",
                "seconds": 4,
                "ambientTag": "soft-wind",
            },
        ],
    }


@app.post("/v1/rewrite")
def rewrite(req: RewriteRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    # req.language / req.director_prompt reserved for K2 rewrite call.
    return {
        "provider": "k2-think-primary-gemini-2.5-pro-fallback",
        "script": (
            f"[{req.filters.readingLevel}|{req.filters.tone}] "
            "Once there was a little fox who found courage under a falling star."
        ),
    }


@app.post("/v1/images")
def images(req: ImagesRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    style = req.filters.visualStyle
    return {
        "provider": "imagen-3-primary-flux.1-schnell-fallback",
        "fallbackUsed": False,
        "imageUrls": [f"https://example.com/{style}/{scene.id}.png" for scene in req.scenes],
    }


@app.post("/v1/audio/narration")
def narration(req: AudioNarrationRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    return {
        "provider": "gemini-2.5-native-multimodal-audio",
        "audioBase64": "U1RVRF9OQVJSQVRJT05fQVVESU8=",  # "STUD_NARRATION_AUDIO"
    }


@app.post("/v1/audio/ambient")
def ambient(req: AudioAmbientRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    return {
        "provider": "gemini-2.5-native-multimodal-audio",
        "audioBase64": "U1RVRF9BTUJJRU5UX0FVRElP",  # "STUD_AMBIENT_AUDIO"
    }

