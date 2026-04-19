from __future__ import annotations

import base64
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

from k2_cleanup import run_k2_cleanup  # noqa: E402

app = FastAPI(title="Lullaby ML Service", version="0.4.0")


def _check_token(x_ml_token: str | None) -> None:
    expected = os.getenv("ML_SERVICE_TOKEN", "dev-token")
    if x_ml_token != expected:
        raise HTTPException(status_code=401, detail="Invalid ML service token")


class Filters(BaseModel):
    visualStyle: str = "watercolor"
    narratorVoice: str = "warm_mother"
    readingLevel: str = "early_reader"
    tone: str = "cozy"
    pacing: str = "unhurried"


class TranscribeRequest(BaseModel):
    audioBase64: str | None = None
    mimeType: str = "audio/webm"


class CleanupRequest(BaseModel):
    transcript: str
    language: str | None = None
    filters: Filters


class CleanupResponse(BaseModel):
    clean_transcript: str
    language: str
    director_prompt: str
    raw_model_json: dict[str, Any]
    provider: str


class VideoGenerateRequest(BaseModel):
    director_prompt: str


class VideoGenerateResponse(BaseModel):
    video_base64: str
    mime_type: str
    provider: str
    model: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "service": "lullaby-ml-fastapi"}


def _transcribe_with_elevenlabs(audio_bytes: bytes, mime_type: str) -> dict[str, Any]:
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY is missing")

    model_id = os.getenv("ELEVENLABS_STT_MODEL", "scribe_v2")
    url = os.getenv("ELEVENLABS_STT_URL", "https://api.elevenlabs.io/v1/speech-to-text")

    try:
        response = httpx.post(
            url,
            headers={"xi-api-key": api_key},
            files={"file": ("recording.webm", audio_bytes, mime_type)},
            data={"model_id": model_id},
            timeout=60.0,
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"ElevenLabs request failed: {exc}") from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"ElevenLabs STT failed ({response.status_code}): {response.text}",
        )

    return response.json()


@app.post("/v1/transcribe")
def transcribe(req: TranscribeRequest, x_ml_token: str | None = Header(default=None)) -> dict[str, Any]:
    _check_token(x_ml_token)
    if not req.audioBase64:
        raise HTTPException(status_code=400, detail="No audio payload provided")

    try:
        audio_bytes = base64.b64decode(req.audioBase64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 audio") from exc

    payload = _transcribe_with_elevenlabs(audio_bytes, req.mimeType)
    provider: Literal["elevenlabs-scribe-v2"] = "elevenlabs-scribe-v2"

    text = str(payload.get("text", "")).strip()
    words_raw = payload.get("words", [])
    words: list[dict[str, Any]] = []
    if isinstance(words_raw, list):
        for word_info in words_raw:
            if not isinstance(word_info, dict):
                continue
            token = word_info.get("text") or word_info.get("word")
            start = word_info.get("start", 0)
            end = word_info.get("end", 0)
            if isinstance(token, str) and token:
                words.append({"word": token, "start": float(start), "end": float(end)})

    return {"text": text, "words": words, "provider": provider}


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


def _resolve_veo_api_key() -> str:
    for key_name in (
        "VEO_API_KEY",
        "GOOGLE_AI_STUDIO_API_KEY",
        "GOOGLE_API_KEY",
        "GEMINI_API_KEY",
    ):
        value = os.getenv(key_name, "").strip()
        if value:
            return value
    raise HTTPException(status_code=500, detail="Missing VEO_API_KEY (or GOOGLE_AI_STUDIO_API_KEY/GOOGLE_API_KEY)")


def _generate_video_with_veo(prompt: str) -> dict[str, str]:
    api_key = _resolve_veo_api_key()
    model = os.getenv("VEO_MODEL", "veo-2.0-generate-001")
    aspect_ratio = os.getenv("VEO_ASPECT_RATIO", "16:9")
    poll_seconds = float(os.getenv("VEO_POLL_SECONDS", "5"))
    timeout_seconds = float(os.getenv("VEO_TIMEOUT_SECONDS", "300"))

    client = genai.Client(api_key=api_key)

    try:
        operation = client.models.generate_videos(
            model=model,
            prompt=prompt,
            config=types.GenerateVideosConfig(
                number_of_videos=1,
                aspect_ratio=aspect_ratio,
            ),
        )

        started_at = time.monotonic()
        while not operation.done:
            if time.monotonic() - started_at > timeout_seconds:
                raise HTTPException(status_code=504, detail="Timed out waiting for Veo video generation")
            time.sleep(poll_seconds)
            operation = client.operations.get(operation)

        response = getattr(operation, "response", None)
        generated = getattr(response, "generated_videos", None)
        if not generated:
            raise HTTPException(status_code=502, detail="Veo did not return a generated video")

        video_ref = generated[0].video
        client.files.download(file=video_ref)

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            video_ref.save(tmp_path)
            encoded = base64.b64encode(tmp_path.read_bytes()).decode("utf-8")
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass

        return {
            "video_base64": encoded,
            "mime_type": "video/mp4",
            "provider": "google-ai-studio-veo",
            "model": model,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Veo generation failed: {exc}") from exc


@app.post("/v1/video", response_model=VideoGenerateResponse)
def generate_video(req: VideoGenerateRequest, x_ml_token: str | None = Header(default=None)) -> VideoGenerateResponse:
    _check_token(x_ml_token)
    prompt = req.director_prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="director_prompt is required")

    out = _generate_video_with_veo(prompt)
    return VideoGenerateResponse(
        video_base64=out["video_base64"],
        mime_type=out["mime_type"],
        provider=out["provider"],
        model=out["model"],
    )
