from __future__ import annotations

import base64
import os
import time
from pathlib import Path
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
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


def _resolve_flux_api_key() -> str:
    for key_name in ("FLUX_API_KEY", "REPLICATE_API_TOKEN"):
        value = os.getenv(key_name, "").strip()
        if value:
            return value
    raise HTTPException(status_code=500, detail="Missing FLUX_API_KEY (or REPLICATE_API_TOKEN)")


def _parse_flux_model() -> tuple[str, str]:
    model_ref = os.getenv("FLUX_MODEL", "black-forest-labs/FLUX.1-schnell").strip()
    if "/" not in model_ref:
        raise HTTPException(
            status_code=500,
            detail="FLUX_MODEL must be in owner/model format (for example black-forest-labs/FLUX.1-schnell)",
        )
    owner, name = model_ref.split("/", 1)
    owner = owner.strip()
    name = name.strip()
    if not owner or not name:
        raise HTTPException(
            status_code=500,
            detail="FLUX_MODEL must include both owner and model name",
        )
    return owner, name


def _generate_illustration_with_flux(
    prompt: str,
    aspect_ratio: str = "3:4",
    output_mime_type: str = "image/jpeg",
) -> dict[str, str]:
    api_key = _resolve_flux_api_key()
    owner, model_name = _parse_flux_model()
    model_ref = f"{owner}/{model_name}"

    output_format = "jpg" if output_mime_type == "image/jpeg" else "png"
    timeout_seconds = float(os.getenv("FLUX_TIMEOUT_SECONDS", "120"))

    create_url = f"https://api.replicate.com/v1/models/{owner}/{model_name}/predictions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    create_payload = {
        "input": {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "output_format": output_format,
            "num_outputs": 1,
        }
    }

    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            create_res = client.post(create_url, headers=headers, json=create_payload)
            if create_res.status_code >= 400:
                raise HTTPException(
                    status_code=502,
                    detail=f"FLUX prediction create failed ({create_res.status_code}): {create_res.text}",
                )

            prediction = create_res.json()
            prediction_id = str(prediction.get("id", "")).strip()
            if not prediction_id:
                raise HTTPException(status_code=502, detail="FLUX response missing prediction id")

            status_url = f"https://api.replicate.com/v1/predictions/{prediction_id}"
            started = time.monotonic()
            while True:
                status = str(prediction.get("status", "")).strip().lower()
                if status == "succeeded":
                    break
                if status in {"failed", "canceled"}:
                    err = prediction.get("error") or "unknown error"
                    raise HTTPException(status_code=502, detail=f"FLUX prediction failed: {err}")
                if time.monotonic() - started > timeout_seconds:
                    raise HTTPException(status_code=504, detail="FLUX prediction timed out")

                time.sleep(0.9)
                poll_res = client.get(status_url, headers=headers)
                if poll_res.status_code >= 400:
                    raise HTTPException(
                        status_code=502,
                        detail=f"FLUX prediction poll failed ({poll_res.status_code}): {poll_res.text}",
                    )
                prediction = poll_res.json()

            output = prediction.get("output")
            image_url = ""
            if isinstance(output, list) and output:
                image_url = str(output[0])
            elif isinstance(output, str):
                image_url = output

            image_url = image_url.strip()
            if not image_url:
                raise HTTPException(status_code=502, detail="FLUX output did not include an image URL")

            image_res = client.get(image_url)
            if image_res.status_code >= 400:
                raise HTTPException(
                    status_code=502,
                    detail=f"FLUX image download failed ({image_res.status_code})",
                )

        mime_type = image_res.headers.get("content-type") or output_mime_type
        encoded = base64.b64encode(image_res.content).decode("utf-8")
        return {
            "image_base64": encoded,
            "mime_type": mime_type,
            "provider": "replicate-flux",
            "model": model_ref,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"FLUX generation failed: {exc}") from exc


@app.post("/v1/illustration", response_model=IllustrationResponse)
def illustration(req: IllustrationRequest, x_ml_token: str | None = Header(default=None)) -> IllustrationResponse:
    _check_token(x_ml_token)
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required")

    out = _generate_illustration_with_flux(prompt, req.aspect_ratio, req.output_mime_type)
    return IllustrationResponse(
        image_base64=out["image_base64"],
        mime_type=out["mime_type"],
        provider=out["provider"],
        model=out["model"],
    )