from __future__ import annotations

import base64
import io
import math
import os
import time
import wave
from pathlib import Path
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

from k2_cleanup import run_k2_cleanup  # noqa: E402

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
    language: str | None = None
    filters: Filters


class CleanupResponse(BaseModel):
    clean_transcript: str
    language: str
    director_prompt: str
    raw_model_json: dict[str, Any]
    provider: str

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
    directorPrompt: str
    scenes: list[Scene]
    script: str
    filters: Filters


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


def _collapse_ws(text: str) -> str:
    return " ".join(text.split())


def _trim_text(text: str, max_chars: int) -> str:
    compact = _collapse_ws(text)
    if len(compact) <= max_chars:
        return compact
    return compact[: max_chars - 3].rstrip() + "..."


def _extract_video_base64(payload: Any) -> str | None:
    if isinstance(payload, str):
        return None

    if isinstance(payload, dict):
        direct_keys = ("videoBase64", "video_base64", "videoBytes", "video")
        for key in direct_keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        inline_data = payload.get("inlineData")
        if isinstance(inline_data, dict):
            data = inline_data.get("data")
            mime = str(inline_data.get("mimeType", ""))
            if isinstance(data, str) and data.strip() and "video" in mime.lower():
                return data.strip()

        content = payload.get("content")
        if isinstance(content, dict):
            parts = content.get("parts")
            if isinstance(parts, list):
                for part in parts:
                    found = _extract_video_base64(part)
                    if found:
                        return found

        candidates = payload.get("candidates")
        if isinstance(candidates, list):
            for candidate in candidates:
                found = _extract_video_base64(candidate)
                if found:
                    return found

        response = payload.get("response")
        if response is not None:
            found = _extract_video_base64(response)
            if found:
                return found

        for value in payload.values():
            found = _extract_video_base64(value)
            if found:
                return found

    if isinstance(payload, list):
        for item in payload:
            found = _extract_video_base64(item)
            if found:
                return found

    return None


def _extract_operation_name(payload: Any) -> str | None:
    if isinstance(payload, dict):
        name = payload.get("name")
        if isinstance(name, str) and name:
            if name.startswith("operations/") or "/operations/" in name:
                return name

        operation = payload.get("operation")
        if operation is not None:
            nested = _extract_operation_name(operation)
            if nested:
                return nested

        for value in payload.values():
            nested = _extract_operation_name(value)
            if nested:
                return nested

    if isinstance(payload, list):
        for item in payload:
            nested = _extract_operation_name(item)
            if nested:
                return nested

    return None


def _poll_operation_for_video(
    *,
    client: httpx.Client,
    base_url: str,
    api_key: str,
    operation_name: str,
    timeout_seconds: float,
    poll_seconds: float,
) -> str:
    operation_path = operation_name.lstrip("/")
    if operation_path.startswith("http://") or operation_path.startswith("https://"):
        op_url = operation_path
        if "?" not in op_url:
            op_url = f"{op_url}?key={api_key}"
    else:
        op_url = f"{base_url}/{operation_path}?key={api_key}"

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        op_res = client.get(op_url)
        if op_res.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Veo3 operation poll failed ({op_res.status_code}): {op_res.text[:2000]}",
            )

        op_payload = op_res.json()
        maybe_video = _extract_video_base64(op_payload)
        if isinstance(maybe_video, str) and maybe_video.strip():
            return maybe_video

        if isinstance(op_payload, dict) and op_payload.get("done"):
            if "error" in op_payload:
                raise HTTPException(status_code=502, detail=f"Veo3 operation error: {op_payload['error']}")

            response_payload = op_payload.get("response", op_payload)
            maybe_video = _extract_video_base64(response_payload)
            if maybe_video:
                return maybe_video

            raise HTTPException(status_code=502, detail="Veo3 operation completed without video payload.")

        time.sleep(max(1.0, poll_seconds))

    raise HTTPException(status_code=504, detail="Veo3 generation timed out.")


def _generate_video_with_veo3(story_prompt: str) -> str:
    api_key = _google_api_key()
    model = os.getenv("VEO3_MODEL", "veo-3.1-fast-generate-preview")
    base = os.getenv("GOOGLE_GENAI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
    timeout_seconds = float(os.getenv("VEO3_TIMEOUT_SECONDS", "900"))
    poll_seconds = float(os.getenv("VEO3_POLL_SECONDS", "5"))

    endpoint_variants: list[tuple[str, dict[str, Any]]] = [
        (
            f"{base}/models/{model}:predictLongRunning?key={api_key}",
            {
                "instances": [
                    {
                        "prompt": story_prompt,
                    }
                ],
                "parameters": {
                    "sampleCount": 1,
                    "aspectRatio": "16:9",
                }
            },
        ),
        (
            f"{base}/models/{model}:predict?key={api_key}",
            {
                "instances": [
                    {
                        "prompt": story_prompt,
                        "aspectRatio": "16:9",
                    }
                ]
            },
        ),
        (
            f"{base}/models/{model}:generateVideo?key={api_key}",
            {
                "prompt": story_prompt,
                "aspectRatio": "16:9",
            },
        ),
        (
            f"{base}/models/{model}:generateContent?key={api_key}",
            {
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": story_prompt}],
                    }
                ]
            },
        ),
    ]

    errors: list[str] = []
    with httpx.Client(timeout=120.0) as client:
        for url, body in endpoint_variants:
            response = client.post(url, json=body)
            if response.status_code >= 400:
                errors.append(f"{url} -> {response.status_code}: {response.text[:400]}")
                continue

            payload = response.json()
            direct_video = _extract_video_base64(payload)
            if direct_video:
                return direct_video

            operation_name = _extract_operation_name(payload)
            if operation_name:
                try:
                    return _poll_operation_for_video(
                        client=client,
                        base_url=base,
                        api_key=api_key,
                        operation_name=operation_name,
                        timeout_seconds=timeout_seconds,
                        poll_seconds=poll_seconds,
                    )
                except HTTPException as exc:
                    errors.append(str(exc.detail))
                    continue

            errors.append(f"{url} -> response had no video payload or operation name")

    raise HTTPException(status_code=502, detail=f"Veo3 generation failed. Attempts: {' | '.join(errors)[:2000]}")


def _local_fallback_tts_base64(duration_seconds: float = 8.0, sample_rate: int = 24000) -> str:
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


# ── Generate video — Veo + Google TTS ────────────────────────────────────────

@app.post("/v1/video")
def video(req: VideoRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)

    scene_lines = "\n".join(f"- {scene.prompt}" for scene in req.scenes)
    story_prompt = "\n".join(
        [
            "Create a coherent short animated film from this director brief and shot plan.",
            "Keep character appearance, location logic, and lighting continuity across all shots.",
            "Avoid abstract geometric visuals, test-pattern motion, and unrelated color pulses.",
            f"Director brief: {_trim_text(req.directorPrompt, 3500)}",
            "Scene prompts:",
            scene_lines,
            f"Narration script: {_trim_text(req.script, 3500)}",
            "Output should feel like one consistent film sequence.",
        ]
    )

    video_base64 = _generate_video_with_veo3(story_prompt)
    return {
        "provider": "veo3-google",
        "videoBase64": video_base64,
    }


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
    allow_fallback = os.getenv("ALLOW_TTS_FALLBACK", "1").strip().lower() in ("1", "true", "yes")
    api_key = _google_api_key()
    voice_name = {
        "warm_mother": "en-US-Chirp3-HD-Achird",
        "wise_grandfather": "en-US-Chirp3-HD-Autonoe",
        "playful_sister": "en-US-Chirp3-HD-Leda",
        "gentle_father": "en-US-Chirp3-HD-Sadachbia",
        "mysterious_narrator": "en-US-Chirp3-HD-Callirrhoe",
        "kid_narrator": "en-US-Chirp3-HD-Rasalgethi",
    }.get(req.filters.narratorVoice, "en-US-Chirp3-HD-Achird")
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
    return {"provider": "stub", "audioBase64": ""}