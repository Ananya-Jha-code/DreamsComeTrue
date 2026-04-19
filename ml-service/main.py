from __future__ import annotations

import base64
import math
import os
import shutil
import subprocess
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
    target_duration_seconds: float | None = None


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


def _build_segment_prompt(
    *,
    base_prompt: str,
    segment_index: int,
    segment_count: int,
    segment_duration_seconds: float,
    target_duration_seconds: float,
) -> str:
    return (
        f"{base_prompt}\n\n"
        "Temporal generation constraints:\n"
        f"- This is segment {segment_index + 1} of {segment_count}.\n"
        f"- Segment duration target: about {segment_duration_seconds:.1f} seconds.\n"
        f"- Total final film target duration: {target_duration_seconds:.1f} seconds.\n"
        "- Keep character identity, wardrobe, location, and lighting continuity.\n"
        "- Continue narrative progression naturally from prior segments.\n"
        "- No title cards, captions, logos, or credits."
    )


def _run_ffmpeg_concat_and_trim(
    *,
    clip_paths: list[Path],
    target_duration_seconds: float,
    workdir: Path,
) -> bytes:
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise HTTPException(
            status_code=500,
            detail="ffmpeg is required to create long videos. Install ffmpeg and retry.",
        )

    concat_list = workdir / "concat.txt"
    concat_out = workdir / "concat.mp4"
    trimmed_out = workdir / "trimmed.mp4"

    concat_lines = []
    for clip_path in clip_paths:
        safe_path = str(clip_path).replace("'", "'\\''")
        concat_lines.append(f"file '{safe_path}'")
    concat_list.write_text("\n".join(concat_lines), encoding="utf-8")

    concat_cmd = [
        ffmpeg_bin,
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_list),
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(concat_out),
    ]
    concat_proc = subprocess.run(concat_cmd, capture_output=True, text=True)
    if concat_proc.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=f"ffmpeg concat failed: {concat_proc.stderr[-1000:]}",
        )

    trim_cmd = [
        ffmpeg_bin,
        "-y",
        "-i",
        str(concat_out),
        "-t",
        f"{target_duration_seconds:.3f}",
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(trimmed_out),
    ]
    trim_proc = subprocess.run(trim_cmd, capture_output=True, text=True)
    if trim_proc.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=f"ffmpeg trim failed: {trim_proc.stderr[-1000:]}",
        )

    return trimmed_out.read_bytes()


def _generate_video_with_veo(prompt: str, target_duration_seconds: float | None = None) -> dict[str, str]:
    api_key = _resolve_veo_api_key()
    model = os.getenv("VEO_MODEL", "veo-2.0-generate-001")
    aspect_ratio = os.getenv("VEO_ASPECT_RATIO", "16:9")
    poll_seconds = float(os.getenv("VEO_POLL_SECONDS", "5"))
    timeout_seconds = float(os.getenv("VEO_TIMEOUT_SECONDS", "300"))
    max_seconds = float(os.getenv("VEO_MAX_SECONDS", "120"))
    segment_seconds = float(os.getenv("VEO_SEGMENT_SECONDS", "10"))
    segment_seconds = min(15.0, max(6.0, segment_seconds))

    client = genai.Client(api_key=api_key)

    desired_seconds: float | None = None
    if target_duration_seconds is not None:
        desired_seconds = min(max_seconds, max(6.0, float(target_duration_seconds)))

    if desired_seconds is None:
        segment_count = 1
    else:
        segment_count = max(1, math.ceil(desired_seconds / segment_seconds))

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            temp_dir = Path(tmpdir)
            clip_paths: list[Path] = []

            for segment_index in range(segment_count):
                segment_target = segment_seconds
                if desired_seconds is not None:
                    remaining = max(1.0, desired_seconds - (segment_index * segment_seconds))
                    segment_target = min(segment_seconds, remaining)

                segment_prompt = (
                    prompt
                    if segment_count == 1
                    else _build_segment_prompt(
                        base_prompt=prompt,
                        segment_index=segment_index,
                        segment_count=segment_count,
                        segment_duration_seconds=segment_target,
                        target_duration_seconds=desired_seconds or segment_seconds,
                    )
                )

                operation = client.models.generate_videos(
                    model=model,
                    prompt=segment_prompt,
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

                clip_path = temp_dir / f"segment_{segment_index:03d}.mp4"
                video_ref.save(clip_path)
                clip_paths.append(clip_path)

            if desired_seconds is not None and len(clip_paths) > 0:
                out_bytes = _run_ffmpeg_concat_and_trim(
                    clip_paths=clip_paths,
                    target_duration_seconds=desired_seconds,
                    workdir=temp_dir,
                )
            else:
                out_bytes = clip_paths[0].read_bytes()

            encoded = base64.b64encode(out_bytes).decode("utf-8")

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

    out = _generate_video_with_veo(prompt, req.target_duration_seconds)
    return VideoGenerateResponse(
        video_base64=out["video_base64"],
        mime_type=out["mime_type"],
        provider=out["provider"],
        model=out["model"],
    )
