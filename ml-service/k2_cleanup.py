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
        "Lullaby — director brief for downstream K2 (scene plan + rewrite + visuals).",
        f"Target language for narration/rewrite: {language}.",
        "Session: single browser recording, max 5 minutes; input was cleaned of fillers/pauses; preserve story content.",
        "The director’s selected filters (use consistently):",
    ]
    for k, v in filters.items():
        label = key_labels.get(k, k)
        lines.append(f"- {label} ({k}): {v}")
    lines.append(
        "Next steps: (1) Build a JSON scene plan from the clean transcript + these filters. "
        "(2) Rewrite for reading level, tone, and target language. "
        "(3) Keep character and visual style consistent."
    )
    lines.append("Clean transcript (source of truth for the story):")
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

    system = """You are the Lullaby story pipeline "cleanup + director prompt" stage.

Your job:
1) Produce a CLEAN TRANSCRIPT: same story as the user told it, but remove disfluencies only:
   - long pauses / false starts / obvious self-corrections where they restated
   - filler words: um, uh, like, you know (when filler, not meaningful)
   Preserve: plot, character names, intentional repetition, dialogue, and meaning.
2) Produce a STRUCTURED DIRECTOR PROMPT (director_prompt) for downstream K2 models (scene planning, rewrite, visuals).
   It MUST be non-empty, even for very short inputs: always include the filter matrix, language target, and session rules.

Output MUST be one JSON object only, no markdown fences. Do NOT use the word "string" as a placeholder. Use real values.
Keys: clean_transcript, language, director_prompt.

- clean_transcript: the cleaned text (string).
- language: BCP-47 code (e.g. en, es, zh). Default to "en" if uncertain or the tag is "unknown" / missing.
- director_prompt: a substantial brief (at least 4 sentences) including: (a) max 5 min voice capture, (b) the five filter axes with BOTH machine keys and human meaning, (c) that the next K2 steps must use this language, (d) that scene plan + rewrite use the clean_transcript. Never return "".

Voice capture (session constraints to mention in director_prompt):
- Input: browser-based continuous audio capture
- Max duration: 5 minutes per recording

Transcription / cleanup (mention in director_prompt):
- Cleanup removes long pauses, fillers, obvious self-corrections; preserves story content, names, intentional repetition.
- Target: cleaning pass should be fast in production (under ~2 seconds); do not add extra processing steps in the text.

Filter axes (director already chose these; repeat in director_prompt with both key and label):
- visualStyle: watercolor | pixar | ghibli | paper_cutout | charcoal | crayon
- narratorVoice: warm_mother | wise_grandfather | playful_sister | gentle_father | mysterious_narrator | kid_narrator
- readingLevel: toddler | early_reader | grade_school | advanced
- tone: cozy | adventurous | whimsical | mysterious | tender
- pacing: unhurried | natural | brisk

Downstream expectations (summarize in director_prompt):
- Scene planning (K2): input = clean transcript + these filters + language tag; output = structured JSON scene beats + character sheet for visual consistency.
- Story rewrite (K2): single call applying reading level, tone, and language; output = final narrator script in the director's language.

Be concise in director_prompt but complete enough for the next model call."""

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
