"""
video_gen.py — Veo text-to-video + Google TTS narration
Called by main.py /v1/generate-video
"""
from __future__ import annotations

import base64
import os
import time
from typing import Any

import httpx

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
TTS_API_KEY    = os.getenv("GOOGLE_TTS_API_KEY") or GEMINI_API_KEY

VEO_URL       = "https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning"
OPS_BASE      = "https://generativelanguage.googleapis.com/v1beta"
TTS_URL       = "https://texttospeech.googleapis.com/v1/text:synthesize"

VOICE_MAP: dict[str, dict[str, str]] = {
    "warm_mother":          {"name": "en-US-Journey-F",  "languageCode": "en-US"},
    "wise_grandfather":     {"name": "en-US-Journey-D",  "languageCode": "en-US"},
    "playful_sister":       {"name": "en-US-Studio-O",   "languageCode": "en-US"},
    "gentle_father":        {"name": "en-US-Journey-D",  "languageCode": "en-US"},
    "mysterious_narrator":  {"name": "en-US-Studio-Q",   "languageCode": "en-US"},
    "kid_narrator":         {"name": "en-US-Studio-O",   "languageCode": "en-US"},
}
DEFAULT_VOICE = {"name": "en-US-Journey-F", "languageCode": "en-US"}

# ── Scene extraction ──────────────────────────────────────────────────────────

def _extract_scene_prompts(director_prompt: str) -> list[str]:
    """Pull the Scene Guidance block out of the K2 director_prompt."""
    import re
    m = re.search(
        r"Scene Guidance([\s\S]*?)(?=\n(?:Emotion|Pacing|Visual Consistency|Video Model|$))",
        director_prompt, re.IGNORECASE
    )
    if m:
        block  = m.group(1)
        scenes = re.split(r"\n(?=Scene \d)", block, flags=re.IGNORECASE)
        scenes = [re.sub(r"^Scene \d+:?\s*", "", s, flags=re.IGNORECASE).strip()
                  for s in scenes if s.strip()]
        if len(scenes) >= 2:
            return [s[:500] for s in scenes[:4]]

    # Fallback: split into thirds
    text  = director_prompt.strip()
    chunk = max(1, len(text) // 3)
    return [text[i*chunk:(i+1)*chunk].strip() for i in range(3)]


def _style_context(director_prompt: str) -> str:
    import re
    vs = (re.search(r"Visual Style[\s\S]{0,350}", director_prompt, re.IGNORECASE) or object()).group(0) if hasattr(re.search(r"Visual Style[\s\S]{0,350}", director_prompt, re.IGNORECASE), "group") else ""  # noqa: E501
    cd = (re.search(r"Character Design[\s\S]{0,250}", director_prompt, re.IGNORECASE) or object()).group(0) if hasattr(re.search(r"Character Design[\s\S]{0,250}", director_prompt, re.IGNORECASE), "group") else ""  # noqa: E501
    return f"{vs} {cd}".replace("\n", " ").strip()[:400]


def _split_transcript(transcript: str, n: int) -> list[str]:
    words = transcript.split()
    per   = max(1, len(words) // n)
    return [" ".join(words[i*per:(i+1)*per]) for i in range(n)]


# ── Veo ───────────────────────────────────────────────────────────────────────

def _veo_generate(prompt: str) -> str:
    """Submit Veo job, poll until done, return base64 MP4."""
    headers = {"Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY}
    body: dict[str, Any] = {
        "instances":  [{"prompt": prompt}],
        "parameters": {"aspectRatio": "16:9", "durationSeconds": 6},
    }
    with httpx.Client(timeout=30) as c:
        r = c.post(VEO_URL, headers=headers, json=body)
    r.raise_for_status()
    op_name: str = r.json()["name"]

    # Poll every 5s, max 6 min
    for _ in range(72):
        time.sleep(5)
        with httpx.Client(timeout=15) as c:
            poll = c.get(
                f"{OPS_BASE}/{op_name}?key={GEMINI_API_KEY}",
                headers={"x-goog-api-key": GEMINI_API_KEY},
            )
        poll.raise_for_status()
        data = poll.json()
        if not data.get("done"):
            continue
        if data.get("error"):
            raise RuntimeError(f"Veo error: {data['error']}")
        uri: str = (
            data.get("response", {})
            .get("generateVideoResponse", {})
            .get("generatedSamples", [{}])[0]
            .get("video", {})
            .get("uri", "")
        )
        if not uri:
            raise RuntimeError("Veo done but no URI")

        dl_uri = f"{uri}&key={GEMINI_API_KEY}" if "?" in uri else f"{uri}?key={GEMINI_API_KEY}"
        with httpx.Client(timeout=120, follow_redirects=True) as c:
            dl = c.get(dl_uri)
        dl.raise_for_status()
        return base64.b64encode(dl.content).decode()

    raise RuntimeError("Veo timed out after 6 minutes")


# ── Google TTS ────────────────────────────────────────────────────────────────

def _tts_generate(text: str, voice_key: str) -> str:
    """Return base64 MP3."""
    voice = VOICE_MAP.get(voice_key, DEFAULT_VOICE)
    body  = {
        "input":       {"text": text},
        "voice":       {"languageCode": voice["languageCode"], "name": voice["name"]},
        "audioConfig": {"audioEncoding": "MP3"},
    }
    with httpx.Client(timeout=30) as c:
        r = c.post(f"{TTS_URL}?key={TTS_API_KEY}", json=body)
    r.raise_for_status()
    return r.json()["audioContent"]


# ── Public entry point ────────────────────────────────────────────────────────

import concurrent.futures


def generate_film(
    *,
    director_prompt: str,
    clean_transcript: str,
    narrator_voice:  str = "warm_mother",
) -> list[dict[str, Any]]:
    """
    Returns list of scene dicts:
      { videoBase64: str, audioBase64: str, caption: str }
    All scenes generated in parallel (video + TTS per scene also parallel).
    """
    scene_prompts = _extract_scene_prompts(director_prompt)
    style_ctx     = _style_context(director_prompt)
    narrations    = _split_transcript(clean_transcript, len(scene_prompts))

    def process_scene(i: int) -> dict[str, Any]:
        veo_prompt = f"{style_ctx}\n\n{scene_prompts[i]}".strip()[:800]
        narration  = narrations[i] if i < len(narrations) else ""

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            video_fut = ex.submit(_veo_generate, veo_prompt)
            audio_fut = ex.submit(_tts_generate, narration, narrator_voice) if narration else None

            video_b64 = video_fut.result() if video_fut else ""
            audio_b64 = audio_fut.result() if audio_fut else ""

        return {"videoBase64": video_b64, "audioBase64": audio_b64, "caption": narration}

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(scene_prompts)) as ex:
        scenes = list(ex.map(process_scene, range(len(scene_prompts))))

    return scenes
