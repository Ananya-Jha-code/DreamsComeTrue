from __future__ import annotations

import base64
import io
import math
import os
import wave
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


def _google_api_key() -> str:
    key = (
        os.getenv("GOOGLE_TTS_API_KEY", "").strip()
        or os.getenv("GOOGLE_API_KEY", "").strip()
        or os.getenv("GEMINI_API_KEY", "").strip()
    )
    if not key:
        raise HTTPException(
            status_code=500,
            detail="Missing Google key. Set GOOGLE_TTS_API_KEY or GOOGLE_API_KEY (or GEMINI_API_KEY).",
        )
    return key


def _tts_voice_for_filter(narrator_voice: str) -> str:
    mapping = {
        "warm_mother": "en-US-Chirp3-HD-Achird",
        "wise_grandfather": "en-US-Chirp3-HD-Autonoe",
        "playful_sister": "en-US-Chirp3-HD-Leda",
        "gentle_father": "en-US-Chirp3-HD-Sadachbia",
        "mysterious_narrator": "en-US-Chirp3-HD-Callirrhoe",
        "kid_narrator": "en-US-Chirp3-HD-Rasalgethi",
    }
    return mapping.get(narrator_voice, "en-US-Chirp3-HD-Achird")


def _local_fallback_tts_base64(duration_seconds: float = 8.0, sample_rate: int = 24000) -> str:
    """Generate a minimal WAV fallback so pipeline can continue when cloud TTS is unavailable."""
    total_samples = max(1, int(duration_seconds * sample_rate))
    amplitude = 0.11

    with io.BytesIO() as buff:
        with wave.open(buff, "wb") as wav_out:
            wav_out.setnchannels(1)
            wav_out.setsampwidth(2)
            wav_out.setframerate(sample_rate)

            frames = bytearray()
            for i in range(total_samples):
                t = i / sample_rate
                sample = (
                    math.sin(2.0 * math.pi * 220.0 * t)
                    + 0.5 * math.sin(2.0 * math.pi * 330.0 * t)
                )
                value = int(max(-1.0, min(1.0, sample * amplitude)) * 32767)
                frames.extend(value.to_bytes(2, byteorder="little", signed=True))

            wav_out.writeframes(bytes(frames))

        return base64.b64encode(buff.getvalue()).decode("ascii")


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
    allow_fallback = os.getenv("ALLOW_TTS_FALLBACK", "1").strip().lower() in ("1", "true", "yes")
    api_key = _google_api_key()
    voice_name = _tts_voice_for_filter(req.filters.narratorVoice)
    tts_url = f"https://texttospeech.googleapis.com/v1/text:synthesize?key={api_key}"
    payload = {
        "input": {"text": req.script},
        "voice": {"languageCode": "en-US", "name": voice_name},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": 0.9},
    }

    with httpx.Client(timeout=120.0) as client:
        response = client.post(tts_url, json=payload)

    if response.status_code >= 400:
        if allow_fallback and response.status_code == 403 and "SERVICE_DISABLED" in response.text:
            return {
                "provider": "local-fallback-tts",
                "audioBase64": _local_fallback_tts_base64(),
                "warning": "Google TTS API disabled; using local fallback narration audio.",
            }
        raise HTTPException(
            status_code=502,
            detail=f"Google TTS failed ({response.status_code}): {response.text[:2000]}",
        )

    data = response.json()
    audio = data.get("audioContent")
    if not isinstance(audio, str) or not audio.strip():
        if allow_fallback:
            return {
                "provider": "local-fallback-tts",
                "audioBase64": _local_fallback_tts_base64(),
                "warning": "Google TTS returned no audioContent; using local fallback narration audio.",
            }
        raise HTTPException(status_code=502, detail="Google TTS returned no audioContent.")

    return {
        "provider": "google-tts",
        "audioBase64": audio,
    }


@app.post("/v1/audio/ambient")
def ambient(req: AudioAmbientRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    return {
        "provider": "gemini-2.5-native-multimodal-audio",
        "audioBase64": "U1RVRF9BTUJJRU5UX0FVRElP",  # "STUD_AMBIENT_AUDIO"
    }

