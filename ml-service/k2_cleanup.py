"""
Cleanup + structured director prompt via OpenAI-compatible POST /v1/chat/completions.

Default provider: K2 Think v2 (https://api.k2think.ai) — same shape as the curl example.
Alternative: Moonshot Kimi (https://api.moonshot.ai/v1) — set K2_BASE_URL + K2_CLEANUP_MODEL.

Auth: Bearer token. Set K2THINK_API_KEY (or K2_API_KEY; MOONSHOT_API_KEY still works for Kimi-only setups).
"""

from __future__ import annotations

import ast
import json
import os
import re
from typing import Any

import httpx

# Official K2 Think v2 (per api.k2think.ai docs)
DEFAULT_BASE = "https://api.k2think.ai/v1"
DEFAULT_MODEL = "MBZUAI-IFM/K2-Think-v2"


def _resolve_language(s: str | None, language_tag: str | None) -> str:
    """Default pipeline language is English (en) when STT/model are missing or 'unknown'."""
    m = (s or "").strip()
    if m and m.lower() not in ("unknown", ""):
        return m
    t = (language_tag or "").strip()
    if t and t.lower() not in ("unknown", ""):
        return t
    return "en"


def _fallback_director_prompt(
    *, clean_transcript: str, filters: dict[str, str], language: str
) -> str:
    """Use when the model returns an empty director_prompt; keeps pipeline usable."""
    key_labels = {
        "visualStyle": "visual style",
        "narratorVoice": "narrator voice",
        "readingLevel": "reading level",
        "tone": "tone",
        "pacing": "pacing",
    }
    lines: list[str] = [
        "Lullaby — VEO director brief for downstream scene planning, rewrite, and video generation.",
        f"Target language for narration/rewrite: {language}.",
        "Session constraints: single browser recording, max 5 minutes; preserve story facts and emotional intent.",
        "",
        "Primary objective for Veo:",
        "Create a coherent narrative film that directly depicts the transcript content, not abstract motion graphics.",
        "",
        "Hard visual constraints (must follow):",
        "- Do NOT generate abstract geometric morphing, kaleidoscopes, test-pattern visuals, or random color-cycling.",
        "- Keep one consistent world, lighting logic, and character identity across all shots.",
        "- Ensure every shot contains concrete story action tied to transcript events.",
        "- Avoid generic filler imagery that could apply to any story.",
        "",
        "Director-selected filters (apply consistently):",
    ]
    for k, v in filters.items():
        label = key_labels.get(k, k)
        lines.append(f"- {label} ({k}): {v}")
    lines.extend(
        [
            "",
            "Cinematic direction for Veo:",
            "- Story overview: summarize the exact narrative in 2-4 sentences.",
            "- Character continuity: specify age/appearance/clothing anchors and keep them fixed.",
            "- Environment continuity: define primary location(s), era, weather, and texture details.",
            "- Camera plan: use specific shot grammar (establishing, medium, close-up, tracking, insert).",
            "- Motion plan: include meaningful character and camera motion in every shot.",
            "- Lighting and palette: specify practical light sources and stable color design.",
            "- Negative prompt guidance: exclude abstract artifacts and unrelated objects.",
            "- Output should feel like one short film, not disconnected clips.",
            "",
            "Shot blueprint requirement:",
            "Provide 4-8 sequential shots with concrete details for each shot:",
            "- what happens",
            "- who is visible",
            "- where the camera is",
            "- how subjects/camera move",
            "- key visual details to preserve continuity",
            "",
            "Clean transcript (source of truth for the story):",
        ]
    )
    cap = 4000
    lines.append(clean_transcript[:cap] if len(clean_transcript) <= cap else clean_transcript[: cap - 3] + "...")
    return "\n".join(lines)


def _strip_c_style_json_comments(s: str) -> str:
    """
    Remove // and /* */ only outside JSON double-quoted strings (so // inside
    a string is preserved). Single-quoted strings are not in strict JSON; we
    only track standard "..." strings.
    """
    out: list[str] = []
    i, n = 0, len(s)
    in_dq = False
    escape = False
    while i < n:
        c = s[i]
        if in_dq:
            out.append(c)
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == '"':
                in_dq = False
            i += 1
            continue
        if c == '"':
            in_dq = True
            out.append(c)
            i += 1
            continue
        if c == "/" and i + 1 < n:
            if s[i + 1] == "/":
                eol = s.find("\n", i)
                if eol < 0:
                    break
                i = eol + 1
                continue
            if s[i + 1] == "*":
                e = s.find("*/", i + 2)
                if e < 0:
                    out.append(" ")
                    break
                out.append(" ")
                i = e + 2
                continue
        out.append(c)
        i += 1
    return "".join(out)


def _loosen_jsonish(s: str) -> str:
    """Fix common model mistakes: C-style comments, trailing commas.

    (Avoid global True/False/None replacement: it can corrupt long string values.)"""
    s = _strip_c_style_json_comments(s)
    s = re.sub(r",\s*([}\]])", r"\1", s)
    return s


def _braced_substring(s: str) -> str:
    start = s.find("{")
    end = s.rfind("}")
    if start < 0 or end <= start:
        return s
    return s[start : end + 1]


def _extract_value_with_decoder(
    text: str, after_colon: int, decoder: json.JSONDecoder
) -> Any | None:
    n = len(text)
    p = after_colon
    while p < n and text[p] in " \t\n\r:":
        p += 1
    if p >= n:
        return None
    # Number / object / string — we only need what K2 returns (strings, usually)
    try:
        v, _ = decoder.raw_decode(text, p)
        return v
    except json.JSONDecodeError:
        return None


def _parse_fields_piecewise(text: str) -> dict[str, str] | None:
    """
    If the object is not valid as a whole, decode each value with JSONDecoder
    (handles broken commas, partial JSON, extra prose). A valid clean_transcript
    is required; language and director_prompt default if missing or malformed.
    """
    decoder = json.JSONDecoder()
    m0 = re.search(
        r'["\']?clean_transcript["\']?\s*:\s*', text, re.IGNORECASE
    )
    if not m0:
        return None
    v0 = _extract_value_with_decoder(text, m0.end(), decoder)
    if v0 is None or not str(v0).strip():
        return None
    out: dict[str, str] = {
        "clean_transcript": str(v0).strip(),
        "language": "en",
        "director_prompt": "",
    }
    for key in ("language", "director_prompt"):
        m = re.search(
            rf'["\']?{re.escape(key)}["\']?\s*:\s*', text, re.IGNORECASE
        )
        if not m:
            continue
        v = _extract_value_with_decoder(text, m.end(), decoder)
        if v is not None:
            s = str(v)
            if key == "language" and len(s) > 64:
                s = s[:64]
            out[key] = s
    return out


def _try_parse_json_object(s: str) -> dict[str, Any] | None:
    s0 = s.strip()
    t = s0
    if not t.startswith("{"):
        t = _braced_substring(t)
    for variant in (s0, t, _loosen_jsonish(s0), _loosen_jsonish(t)):
        if not variant.strip().startswith("{"):
            continue
        try:
            o = json.loads(variant)
            if isinstance(o, dict):
                return o
        except json.JSONDecodeError:
            pass
    for variant in (s0, t, _loosen_jsonish(s0), _loosen_jsonish(t)):
        if not variant.strip().startswith("{"):
            continue
        try:
            ev = ast.literal_eval(variant)
            if isinstance(ev, dict):
                return ev
        except (SyntaxError, TypeError, ValueError):
            pass
    return None


def _parse_dict_from_model_text(raw: str) -> dict[str, Any]:
    """Parse JSON; tolerate code fences, loose JSON, and Python-dict style."""
    t = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", t)
    if fence:
        t = fence.group(1).strip()

    for block in (t, _braced_substring(t)):
        if not block or not "{" in block:
            continue
        parsed = _try_parse_json_object(block)
        if isinstance(parsed, dict):
            ct = parsed.get("clean_transcript")
            if ct is not None and str(ct).strip():
                return {str(k): v for k, v in parsed.items()}

    per_field = _parse_fields_piecewise(t)
    if per_field is not None:
        return {k: v for k, v in per_field.items()}

    snippet = t[:2000] if len(t) > 2000 else t
    raise json.JSONDecodeError("Could not parse model output as object", snippet, 0)


def _extract_json_object(text: str) -> dict[str, Any]:
    """Parse JSON from model output; tolerate fences, comments, and loose syntax."""
    return _parse_dict_from_model_text(text)


def build_cleanup_messages(
    *,
    raw_transcript: str,
    language_tag: str | None,
    filters: dict[str, str],
) -> list[dict[str, str]]:
    """System + user messages for K2 cleanup."""
    # Default to English when STT does not send a tag (avoids "unknown" in K2 + UI)
    lang = (language_tag or "").strip() or "en"

    system = """You are the Lullaby pipeline stage responsible for:

1) cleaning a speech transcript
2) generating a cinematic director brief that will be used to generate a short animated movie with a text-to-video model (Gemini).

Your response MUST be exactly one JSON object with the keys:

clean_transcript
language
director_prompt

Do NOT include markdown, explanations, or additional text.

--------------------------------------------------

TASK 1 — CLEAN TRANSCRIPT

Convert the raw speech transcript into a clean story transcript.

Remove:
- filler words (um, uh, like, you know)
- long pauses
- false starts
- obvious self-corrections

Preserve:
- story meaning
- characters
- dialogue
- emotional tone
- intentional repetition

Do NOT summarize the story.

The cleaned transcript must remain faithful to the original narration.

--------------------------------------------------

TASK 2 — CINEMATIC DIRECTOR PROMPT

Create a HIGH-DETAIL CINEMATIC DIRECTOR BRIEF designed specifically for a text-to-video model such as Gemini.

The goal is to transform the story into a short animated film.

The director_prompt must read like instructions from a film director to an animation team.

The brief must contain rich visual detail so the video model can clearly imagine the world, characters, and camera movement.

This prompt is consumed by a Veo-style video generation stage.
Prioritize cinematic continuity, concrete actions, and shot-by-shot specificity.

Never produce abstract or non-narrative visual guidance such as:
- geometric morphing shapes
- kaleidoscopic color fields
- test-pattern motion
- random color pulsing unrelated to story action

Avoid vague descriptions.

Use concrete visual descriptions.

Do NOT describe APIs, pipelines, or processing steps.

--------------------------------------------------

FILTER MATRIX

The director has selected the following creative filters.

You MUST incorporate these filters naturally into the cinematic brief.

visualStyle:
watercolor | pixar | ghibli | paper_cutout | charcoal | crayon

narratorVoice:
warm_mother | wise_grandfather | playful_sister | gentle_father | mysterious_narrator | kid_narrator

readingLevel:
toddler | early_reader | grade_school | advanced

tone:
cozy | adventurous | whimsical | mysterious | tender

pacing:
unhurried | natural | brisk

--------------------------------------------------

DIRECTOR PROMPT STRUCTURE

The director_prompt must include the following sections.

Story Overview
A short explanation of the story being told.

Narration Voice
Describe the emotional tone and delivery style of the narrator.

Visual Style
Explain the art style in vivid visual terms.

Character Design
Describe the main character(s) with physical details such as age, clothing, facial features, proportions, and expression.

Environment and World
Describe the physical world where the story takes place.

Lighting
Describe the lighting style and time of day.

Color Palette
Describe dominant colors used throughout the film.

Animation Style
Explain how characters and environments move.

Camera Direction
Describe camera behavior such as:
- wide shots
- close-ups
- slow pans
- gentle zooms
- perspective

Temporal Shot Plan
Provide a clear sequential shot plan (4-8 shots) in story order.
Each shot must include:
- subject
- action
- camera position + lens feel
- camera movement
- continuity anchors (wardrobe/props/location)

Scene Guidance
Create 3–6 short cinematic scene ideas that follow the story.

Each scene should describe:
- what happens
- camera framing
- character action
- environment details

Emotion and Tone
Describe the emotional atmosphere of the film.

Pacing
Describe how fast or slow the film should feel.

--------------------------------------------------

VISUAL CONSISTENCY

Characters must keep the same appearance across all scenes.

The visual style must remain consistent throughout the film.

Avoid introducing new characters unless they exist in the story.

--------------------------------------------------

VIDEO MODEL OPTIMIZATION

The prompt must help the video model clearly imagine:

- spatial layout
- character scale
- lighting direction
- camera motion
- environment depth

Use descriptive cinematic language.

--------------------------------------------------

LANGUAGE

The narration language must match the provided language tag.

If the language is unknown or missing, default to:

en

--------------------------------------------------

OUTPUT FORMAT

Return exactly this JSON structure:

{
  "clean_transcript": "...",
  "language": "en",
  "director_prompt": "..."
}

The director_prompt must be detailed, cinematic, and visually descriptive.

Never return an empty director_prompt."""

    user = f"""RAW TRANSCRIPT (from speech-to-text):
---
{raw_transcript}
---

DETECTED_LANGUAGE_TAG: {lang}

SELECTED_FILTERS (machine keys + values):
{json.dumps(filters, indent=2)}

Return ONLY the JSON object specified in the system message."""

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _api_key() -> str:
    return (
        os.getenv("K2THINK_API_KEY", "").strip()
        or os.getenv("K2_API_KEY", "").strip()
        or os.getenv("MOONSHOT_API_KEY", "").strip()
    )


def run_k2_cleanup(
    *,
    raw_transcript: str,
    language_tag: str | None,
    filters: dict[str, str],
) -> dict[str, Any]:
    api_key = _api_key()
    if not api_key:
        raise RuntimeError(
            "Set K2THINK_API_KEY (or K2_API_KEY) for api.k2think.ai — required for K2 cleanup"
        )

    base = os.getenv("K2_BASE_URL", DEFAULT_BASE).rstrip("/")
    model = os.getenv("K2_CLEANUP_MODEL", os.getenv("K2_MODEL", DEFAULT_MODEL))
    url = f"{base}/chat/completions"

    messages = build_cleanup_messages(
        raw_transcript=raw_transcript,
        language_tag=language_tag,
        filters=filters,
    )

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": float(os.getenv("K2_TEMPERATURE", "0.3")),
        # Non-streaming: we need full message content to parse JSON (curl often uses stream: true)
        "stream": False,
    }
    # Optional: OpenAI-style JSON mode (enable only if your endpoint supports it)
    if os.getenv("K2_JSON_MODE", "0").strip().lower() in ("1", "true", "yes"):
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    timeout = float(os.getenv("K2_TIMEOUT_SECONDS", "120"))

    with httpx.Client(timeout=timeout) as client:
        response = client.post(url, headers=headers, json=payload)

    if response.status_code >= 400:
        raise RuntimeError(f"K2 API error {response.status_code}: {response.text[:2000]}")

    data = response.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise RuntimeError(f"Unexpected K2 response shape: {data!r}") from exc

    if not isinstance(content, str):
        content = str(content)

    try:
        parsed = _extract_json_object(content)
    except json.JSONDecodeError as e:
        raise RuntimeError(
            f"K2 output was not parseable as JSON. {e!s}. First 500 chars: {content[:500]!r}"
        ) from e

    clean = str(parsed.get("clean_transcript", "")).strip()
    if not clean:
        raise RuntimeError("K2 returned empty clean_transcript")

    raw_lang = str(parsed.get("language", "")).strip()
    out_lang = _resolve_language(raw_lang, language_tag)
    director = str(parsed.get("director_prompt", "")).strip()
    if not director:
        director = _fallback_director_prompt(
            clean_transcript=clean,
            filters=filters,
            language=out_lang,
        )

    # JSON-serializable object (echoes K2 keys + any extra keys from piecewise parse)
    return {
        "clean_transcript": clean,
        "language": out_lang,
        "director_prompt": director,
        "raw_model_json": parsed,
    }
