"""
Cleanup + picture-book planning via OpenAI-compatible POST /v1/chat/completions.

Default provider: K2 Think v2 (https://api.k2think.ai) — same shape as the curl example.
Alternative: Moonshot Kimi (https://api.moonshot.ai/v1) — set K2_BASE_URL + K2_CLEANUP_MODEL.

Auth: Bearer token. Set K2THINK_API_KEY (or K2_API_KEY; MOONSHOT_API_KEY still works for Kimi-only setups).
"""

from __future__ import annotations

import ast
import json
import math
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


def _fallback_book_title(clean_transcript: str) -> str:
    words = re.findall(r"[A-Za-z0-9']+", clean_transcript.strip())
    if not words:
        return "My Picture Book"
    title_words = words[:5]
    title = " ".join(title_words).strip()
    return title[:48] if title else "My Picture Book"


def _fallback_picture_book_paragraphs(clean_transcript: str) -> list[str]:
    cleaned = clean_transcript.strip()
    if not cleaned:
        return ["The story begins in a quiet, gentle way."]

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", cleaned) if part.strip()]
    if len(sentences) <= 2:
        return [cleaned]

    target_count = min(6, max(3, round(len(sentences) / 2)))
    chunk_size = max(1, math.ceil(len(sentences) / target_count))
    paragraphs: list[str] = []
    for index in range(0, len(sentences), chunk_size):
        paragraph = " ".join(sentences[index : index + chunk_size]).strip()
        if paragraph:
            paragraphs.append(paragraph)
    return paragraphs or [cleaned]


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
    is required; language, book_title, and picture_book_paragraphs default if
    missing or malformed.
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
        "book_title": "My Picture Book",
        "picture_book_paragraphs": "[]",
    }
    for key in ("language", "book_title", "picture_book_paragraphs"):
        m = re.search(
            rf'["\']?{re.escape(key)}["\']?\s*:\s*', text, re.IGNORECASE
        )
        if not m:
            continue
        v = _extract_value_with_decoder(text, m.end(), decoder)
        if v is not None:
            s = json.dumps(v) if key == "picture_book_paragraphs" and isinstance(v, list) else str(v)
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
2) splitting the story into picture-book pages

Your response MUST be valid JSON (application/json) and exactly one JSON object with the keys:

clean_transcript
language
book_title
picture_book_paragraphs

Do NOT include markdown, explanations, code fences, or additional text.

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

TASK 2 — PICTURE BOOK PLANNING

Turn the cleaned transcript into a picture book plan.

The goal is to split the story into 3-6 short paragraphs, where each paragraph will become one illustrated page.

Rules for the paragraphs:
- Keep the story faithful to the narration.
- Preserve the order of events.
- Each paragraph should be concise and self-contained.
- Each paragraph should describe a scene that can be illustrated clearly.
- Do not add dialogue or events that were not present in the original story.
- Keep the tone and pacing aligned with the selected filters.

Book title guidance:
- Create a short, child-friendly storybook title.
- The title should be descriptive and warm.
- It should not sound like a movie title.

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

OUTPUT FORMAT

Return exactly this JSON structure:

{
    "clean_transcript": "...",
    "language": "en",
    "book_title": "...",
    "picture_book_paragraphs": ["...", "..."]
}

The picture_book_paragraphs must be an array of 3-6 strings.
The first paragraph should open the book naturally.
The last paragraph should close the story warmly.

--------------------------------------------------

VISUAL CONSISTENCY

Characters must keep the same appearance across all scenes.

The visual style must remain consistent throughout the book.

Avoid introducing new characters unless they exist in the story.
LANGUAGE

The narration language must match the provided language tag.

If the language is unknown or missing, default to:

en

Never return an empty book_title or picture_book_paragraphs."""

    user = f"""RAW TRANSCRIPT (from speech-to-text):
---
{raw_transcript}
---

DETECTED_LANGUAGE_TAG: {lang}

SELECTED_FILTERS (machine keys + values):
{json.dumps(filters, indent=2)}

Return ONLY valid JSON for the object specified in the system message."""

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
        "stream": False,
    }
    # Enforce structured output by default so providers return JSON objects,
    # not free-form/plain text. Set K2_JSON_MODE=0 to opt out if needed.
    if os.getenv("K2_JSON_MODE", "1").strip().lower() in ("1", "true", "yes"):
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
        # Graceful degradation: if the model replies with prose/reasoning instead
        # of JSON, continue the pipeline using deterministic fallbacks.
        fallback_clean = raw_transcript.strip()
        if not fallback_clean:
            raise RuntimeError(
                f"K2 output was not parseable as JSON. {e!s}. First 500 chars: {content[:500]!r}"
            ) from e
        parsed = {
            "clean_transcript": fallback_clean,
            "language": _resolve_language(None, language_tag),
            "book_title": _fallback_book_title(fallback_clean),
            "picture_book_paragraphs": _fallback_picture_book_paragraphs(fallback_clean),
            "parse_warning": f"non_json_model_output: {e!s}",
            "raw_model_text_excerpt": content[:500],
        }

    clean = str(parsed.get("clean_transcript", "")).strip()
    if not clean:
        raise RuntimeError("K2 returned empty clean_transcript")

    raw_lang = str(parsed.get("language", "")).strip()
    out_lang = _resolve_language(raw_lang, language_tag)
    book_title = str(parsed.get("book_title", "")).strip() or _fallback_book_title(clean)

    raw_paragraphs = parsed.get("picture_book_paragraphs")
    if isinstance(raw_paragraphs, list):
        paragraphs = [str(item).strip() for item in raw_paragraphs if str(item).strip()]
    else:
        paragraphs = _fallback_picture_book_paragraphs(clean)

    if not paragraphs:
        paragraphs = _fallback_picture_book_paragraphs(clean)

    return {
        "clean_transcript": clean,
        "language": out_lang,
        "book_title": book_title,
        "picture_book_paragraphs": paragraphs,
        "raw_model_json": parsed,
    }
