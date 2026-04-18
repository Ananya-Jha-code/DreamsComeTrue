from __future__ import annotations

import os
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Lullaby ML Service", version="0.1.0")


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


class PlanRequest(BaseModel):
    transcript: str
    filters: Filters


class RewriteRequest(BaseModel):
    transcript: str
    filters: Filters


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


@app.post("/v1/transcribe")
def transcribe(req: TranscribeRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    provider: Literal["replicate-whisper-large-v3", "modal-whisper-large-v3"] = (
        "modal-whisper-large-v3"
        if os.getenv("WHISPER_PROVIDER", "replicate").lower() == "modal"
        else "replicate-whisper-large-v3"
    )
    text = (
        "Stub transcript. Wire Whisper large-v3 on Modal or Replicate here."
        if req.audioBase64
        else "No audio payload provided to ML service."
    )
    return {
        "text": text,
        "words": [
            {"word": "Once", "start": 0.0, "end": 0.25},
            {"word": "upon", "start": 0.26, "end": 0.45},
            {"word": "a", "start": 0.46, "end": 0.52},
            {"word": "night", "start": 0.53, "end": 0.82},
        ],
        "provider": provider,
    }


@app.post("/v1/cleanup")
def cleanup(req: CleanupRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
    return {
        "text": req.transcript.replace(" um ", " ").replace(" uh ", " ").strip(),
        "provider": "k2-think-primary-gemini-2.5-pro-fallback",
    }


@app.post("/v1/plan")
def plan(req: PlanRequest, x_ml_token: str | None = Header(default=None)) -> dict:
    _check_token(x_ml_token)
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

