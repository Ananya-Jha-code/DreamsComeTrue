from __future__ import annotations

import base64
import os
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

app = FastAPI(title="Lullaby ML Service", version="0.5.0")


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
    book_title: str
    picture_book_paragraphs: list[str]
    raw_model_json: dict[str, Any]
    provider: str


class IllustrationRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "3:4"
    output_mime_type: str = "image/jpeg"


class IllustrationResponse(BaseModel):
    image_base64: str
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
        book_title=out["book_title"],
        picture_book_paragraphs=list(out["picture_book_paragraphs"]),
        raw_model_json=out["raw_model_json"],
        provider="k2think-k2-cleanup",
    )


def _resolve_imagen_api_key() -> str:
    for key_name in (
        "IMAGEN_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_AI_STUDIO_API_KEY",
        "GOOGLE_API_KEY",
    ):
        value = os.getenv(key_name, "").strip()
        if value:
            return value
    raise HTTPException(status_code=500, detail="Missing IMAGEN_API_KEY (or GEMINI_API_KEY/GOOGLE_API_KEY)")


def _generate_illustration_with_imagen(
    prompt: str,
    aspect_ratio: str = "3:4",
    output_mime_type: str = "image/jpeg",
) -> dict[str, str]:
    api_key = _resolve_imagen_api_key()
    model = os.getenv("IMAGEN_MODEL", "imagen-4.0-generate-001")

    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_images(
            model=model,
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio=aspect_ratio,
                output_mime_type=output_mime_type,
            ),
        )
        generated = getattr(response, "generated_images", None) or []
        if not generated:
            raise HTTPException(status_code=502, detail="Imagen did not return a generated image")

        image = generated[0].image
        image_bytes = getattr(image, "image_bytes", None)
        if not image_bytes:
            raise HTTPException(status_code=502, detail="Imagen response did not include image bytes")

        mime_type = getattr(image, "mime_type", None) or output_mime_type
        encoded = base64.b64encode(image_bytes).decode("utf-8")
        return {
            "image_base64": encoded,
            "mime_type": mime_type,
            "provider": "google-ai-studio-imagen",
            "model": model,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Imagen generation failed: {exc}") from exc


@app.post("/v1/illustration", response_model=IllustrationResponse)
def illustration(req: IllustrationRequest, x_ml_token: str | None = Header(default=None)) -> IllustrationResponse:
    _check_token(x_ml_token)
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    out = _generate_illustration_with_imagen(prompt, req.aspect_ratio, req.output_mime_type)
    return IllustrationResponse(
        image_base64=out["image_base64"],
        mime_type=out["mime_type"],
        provider=out["provider"],
        model=out["model"],
    )