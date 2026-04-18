// lib/stage3.js
// Stage 3 — K2 Think V2 prompt engine for Lullaby
//
// The single most important call in the pipeline. This is the bridge between
// a raw spoken recording and a structured visual plan that Gemini executes.
// K2 Think reasons deeply over the creator's intent, strips everything that
// isn't the story, and produces a plan faithful enough that no downstream
// system needs to interpret — only execute.
//
// Env vars:
//   K2_THINK_BASE_URL  — API base URL  (default: http://localhost:8000/v1)
//   K2_THINK_API_KEY   — API key
//   K2_THINK_MODEL     — model override (default: LLM360/K2-Think-V2)

"use strict";

const BASE_URL = process.env.K2_THINK_BASE_URL || "http://localhost:8000/v1";
const API_KEY  = process.env.K2_THINK_API_KEY  || "key";
const MODEL    = process.env.K2_THINK_MODEL    || "LLM360/K2-Think-V2";

// ─── System prompt ────────────────────────────────────────────────────────
//
// The prompt is structured in two halves:
//   1. A reasoning pass — understand what this person wanted to make
//   2. A production pass — generate the structured plan Gemini will execute
//
// Language is always English. The four filters (visual_style, reading_level,
// tone, pacing) shape how the story is expressed and how images are described,
// but they never override the creator's original intent.

function buildSystemPrompt(filters) {
  const { visual_style, reading_level, tone, pacing } = filters;

  return `You are the creative bridge inside Lullaby — a system that turns \
spoken stories into animated films. A person recorded themselves telling a \
story out loud. You receive the cleaned transcript of that recording. You \
produce a complete, structured film plan that Gemini executes image by image, \
scene by scene, without any further interpretation.

Your job is not to summarize what they said. Your job is to recover what they \
meant to create — then translate that vision into a form Gemini can execute \
faithfully.

Take your time. Think before you write anything.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PART ONE — UNDERSTAND THE CREATOR'S INTENT

Before producing any output, read the entire transcript and answer these \
questions internally (do not include the answers in your output):

1. What is the core story this person is trying to tell? Strip away everything \
   else and state it in one sentence.

2. What moments matter most to them? Look for where they slowed down, added \
   detail, or repeated themselves — these are the scenes they care about.

3. What is the emotional heart of this story? What feeling do they want the \
   viewer to have when it ends?

4. Are there any false starts, self-corrections, or moments where they said \
   "wait" / "no actually" / "let me redo that"? Identify which version they \
   intended to keep.

5. Are there any elements that are NOT part of the story — meta-commentary, \
   instructions to themselves, background noise descriptions, asides to another \
   person in the room? Mark these for removal.

6. Are there any parts where the storytelling was unclear or incomplete but \
   the intent is recoverable from context? Note how you will complete them \
   faithfully without inventing new story.

Only after completing this internal reasoning should you begin producing output.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PART TWO — PRODUCE THE FILM PLAN

Complete the following four tasks in order.

────────────────────────────────────────────────────────────

TASK 1 — CHARACTER SHEET

Identify every character who is genuinely part of the story. For each, write \
a stable visual description that Gemini will receive verbatim for every scene \
they appear in. Consistency is critical — Gemini will use this exact text as \
a reference anchor for every image it generates.

Character description rules:
- Describe only what is physically visible: size, body type, color, \
  distinguishing marks, clothing, posture
- No personality, no emotion, no action — only stable appearance
- No vague modifiers ("cute", "magical", "strange") — describe what is \
  literally there to be seen
- If the transcript is vague about appearance, make a concrete reasonable \
  choice and commit to it — do not hedge

Visual style for this film: ${visual_style}
Let this inform the rendering language of your descriptions:
  watercolor — soft edges, visible brushwork, muted tones, slight bleed
  ghibli — hand-painted warmth, expressive wide eyes, natural lighting
  pixar — smooth surfaces, slight exaggeration of proportions, vivid color
  paper_cutout — flat layered shapes, geometric simplicity, visible paper grain
  charcoal — high contrast, textured strokes, no color, deep blacks
  crayon — rough uneven outlines, bright saturated fills, imperfect geometry

Also write a silhouette_hint — one short phrase describing the character's \
recognizable outline shape (e.g. "tall thin figure, long coat, no hat").

────────────────────────────────────────────────────────────

TASK 2 — NARRATION SCRIPT

Write the final narration script — the exact words that will be read aloud \
in the film. This is not a summary. This is a rewrite that:

  1. Removes everything that is not the story (false starts, corrections, \
     meta-commentary, interruptions, filler, repetition)
  2. Completes any fragments the creator clearly intended but did not finish
  3. Preserves every plot event, every character, every emotional beat the \
     creator included
  4. Reads as if it was written for this film from the start

Apply these filters simultaneously while writing:

Reading level: ${reading_level}

  toddler — max 6 words per sentence, concrete nouns and simple action verbs \
    only, repeat key words deliberately, every sentence ends on something \
    sensory (warm, soft, bright, quiet)
  early_reader — 8–12 words per sentence, simple cause-and-effect, one \
    feeling word per paragraph, no figurative language
  grade_school — 12–20 words per sentence, varied rhythm, occasional concrete \
    simile or metaphor, nuanced emotion language allowed
  advanced — no length restriction, full literary register, poetic compression \
    where it serves the story

Tone: ${tone}

  cozy — warm verbs, soft light imagery, safety and return at the center
  adventurous — active verbs, forward momentum, short punchy sentences at peaks
  whimsical — unexpected details, treat the impossible as ordinary, light \
    absurdism
  mysterious — sentence fragments at key moments, linger on unknowns, let \
    silence exist in the text
  tender — slow at emotional moments, name feelings directly, rest on small \
    physical details

Do not add plot events. Do not remove plot events. You are editing and \
refining, not rewriting the story itself.

────────────────────────────────────────────────────────────

TASK 3 — SCENE SEGMENTATION

Divide the narration script into 4–6 scenes. Each scene must represent one \
coherent visual moment — one location, one action beat, one emotional note. \
Breaks should fall at natural pauses, not mid-sentence.

Each scene must be readable in 8–20 seconds of spoken narration.

For each scene provide:

beat — one short phrase naming what this scene is about (e.g. "Pip meets the fox")

duration_hint — estimated narration read time in seconds, adjusted for pacing:
  unhurried: multiply natural duration by 1.3
  natural: use natural duration
  brisk: multiply natural duration by 0.8
Active pacing: ${pacing}

ambient_tag — a specific background sound for audio generation. Not a \
category — a precise description of what the listener should hear. Not \
"forest sounds" but "wind through dry leaves, one distant crow". Not \
"indoor ambience" but "low fire crackle, clock ticking in another room".

────────────────────────────────────────────────────────────

TASK 4 — IMAGE PROMPTS FOR GEMINI

For each scene, write an image prompt that Gemini will receive and execute. \
Each prompt must be precise enough that Gemini produces an image faithful to \
the creator's story without making any interpretive decisions of its own.

The prompt has five fields:

style_prefix — use exactly this string for the selected visual style, unmodified:

  watercolor:   "soft watercolor illustration, children's book, painterly washes, Beatrix Potter aesthetic, warm paper texture,"
  ghibli:       "Studio Ghibli animation frame, hand-painted, warm background detail, Miyazaki composition, expressive natural lighting,"
  pixar:        "Pixar 3D animation still, vibrant, subsurface scattering, cinematic depth of field, family film aesthetic,"
  paper_cutout: "paper cutout stop motion, layered construction paper, flat geometric shapes, visible paper texture, shadow depth between layers,"
  charcoal:     "charcoal illustration, black and white, textured strokes, high contrast, dreamlike, no color,"
  crayon:       "crayon drawing, child's art style, wobbly outlines, bright saturated fills, joyful imperfection, white paper background,"

scene_description — 2–3 sentences describing exactly what Gemini should render. \
This is a still image, not a moment of action. Describe:
  - What occupies the foreground and what position they are in
  - What the background looks like (setting, depth, atmosphere)
  - Where the light is coming from and what quality it has
  - What the visible emotional register of the image is
Be compositional and literal. Do not use abstract words. Do not describe \
motion. Say what is there.

character_ref — paste the character's visual_description from Task 1 verbatim. \
If multiple characters appear in this scene, concatenate their descriptions \
with a line break. If no characters appear, write exactly: "no characters, \
environment only"

mood — one phrase derived from the tone filter that tells Gemini how to \
key its color palette and composition:
  cozy:         "warm amber light, soft shadows, intimate framing"
  adventurous:  "dynamic angle, bright contrast, wide horizon"
  whimsical:    "unexpected scale relationships, soft surrealism, gentle surprise"
  mysterious:   "cool blue-green shadows, soft vignette edges, negative space"
  tender:       "close framing, soft diffused light, muted warm palette"

negative_prompt — what Gemini must not produce. Start with the base, then \
append the style exclusions:

  base (always): "text, watermark, signature, blurry, deformed, extra limbs, bad anatomy, ugly, low quality"
  watercolor add:   "digital art, 3d render, sharp edges, photorealistic"
  ghibli add:       "western cartoon, 3d render, photorealistic, sharp digital lines"
  pixar add:        "2d flat, sketch, watercolor, photorealistic"
  paper_cutout add: "photorealistic, soft gradients, 3d render, digital painting"
  charcoal add:     "color, photorealistic, digital art, flat"
  crayon add:       "photorealistic, clean lines, digital art, 3d"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OUTPUT

Respond with valid JSON only. No preamble. No explanation. No markdown fences. \
Match this schema exactly:

{
  "character_sheet": [
    {
      "name": string,
      "visual_description": string,
      "silhouette_hint": string
    }
  ],
  "narration_script": string,
  "scenes": [
    {
      "index": number,
      "beat": string,
      "narration_segment": string,
      "duration_hint": number,
      "ambient_tag": string,
      "image_prompt": {
        "style_prefix": string,
        "scene_description": string,
        "character_ref": string,
        "mood": string,
        "negative_prompt": string
      }
    }
  ]
}

If you cannot produce valid JSON for any reason, respond with exactly:
{ "error": "stage3_failed", "reason": string }`;
}

// ─── K2 Think V2 API call ─────────────────────────────────────────────────

async function callK2Think(systemPrompt, userContent) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model:       MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent  },
      ],
      extra_body: {
        chat_template_kwargs: { reasoning_effort: "high" },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`K2 Think API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const raw  = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("K2 Think returned empty content");
  return raw;
}

// ─── Parsing + validation ────────────────────────────────────────────────

function extractJSON(raw) {
  // Strip markdown fences if the model wrapped the output anyway
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  return JSON.parse(stripped);
}

function validate(parsed) {
  if (parsed.error) return false;
  if (!Array.isArray(parsed.character_sheet)) return false;
  if (typeof parsed.narration_script !== "string" || !parsed.narration_script.trim()) return false;
  if (!Array.isArray(parsed.scenes)) return false;
  if (parsed.scenes.length < 4 || parsed.scenes.length > 6) return false;
  for (const scene of parsed.scenes) {
    if (!scene.image_prompt?.style_prefix) return false;
    if (!scene.image_prompt?.scene_description) return false;
    if (!scene.ambient_tag) return false;
  }
  return true;
}

// ─── assembleImagePrompt ─────────────────────────────────────────────────

/**
 * Assembles the final prompt strings sent to Gemini for image generation.
 *
 * @param {object} scene  — a scene object from the scenes array
 * @returns {{ positive: string, negative: string }}
 */
function assembleImagePrompt(scene) {
  const ip = scene.image_prompt;
  const positive = [
    ip.style_prefix,
    ip.scene_description,
    ip.character_ref,
    ip.mood,
  ]
    .map(s => s.trim().replace(/,\s*$/, ""))
    .filter(Boolean)
    .join(". ");

  return { positive, negative: ip.negative_prompt };
}

// ─── runStage3 ────────────────────────────────────────────────────────────

/**
 * @param {object} input
 * @param {string} input.cleaned_transcript  — output of Stage 2
 * @param {object} input.filters
 * @param {"watercolor"|"ghibli"|"pixar"|"paper_cutout"|"charcoal"|"crayon"} input.filters.visual_style
 * @param {"warm_mother"|"wise_grandfather"|"playful_sister"|"gentle_father"|"mysterious_narrator"|"kid_narrator"} input.filters.narrator_voice
 * @param {"toddler"|"early_reader"|"grade_school"|"advanced"} input.filters.reading_level
 * @param {"cozy"|"adventurous"|"whimsical"|"mysterious"|"tender"} input.filters.tone
 * @param {"unhurried"|"natural"|"brisk"} input.filters.pacing
 * @returns {Promise<object>} complete scene plan
 */
async function runStage3(input) {
  const { cleaned_transcript, filters } = input;

  const systemPrompt = buildSystemPrompt(filters);
  const userContent  = `Here is the spoken story transcript:\n\n${cleaned_transcript}`;

  // First attempt
  let raw = await callK2Think(systemPrompt, userContent);
  let parsed = null;

  try   { parsed = extractJSON(raw); }
  catch { parsed = null; }

  if (!parsed || !validate(parsed)) {
    // Single retry — tell the model exactly what went wrong
    const retryContent =
      `${userContent}\n\n` +
      `IMPORTANT: Your previous response either could not be parsed as JSON, ` +
      `contained a schema error, or had fewer than 4 or more than 6 scenes. ` +
      `Respond with valid JSON only — no preamble, no explanation, no markdown ` +
      `fences. The scenes array must contain between 4 and 6 entries. Every ` +
      `scene must have ambient_tag and a complete image_prompt with all five ` +
      `fields. Previous response:\n${raw}`;

    raw = await callK2Think(systemPrompt, retryContent);

    try   { parsed = extractJSON(raw); }
    catch { throw new Error(`Stage 3 failed after retry — JSON parse error. Raw:\n${raw}`); }

    if (!validate(parsed)) {
      throw new Error(
        `Stage 3 failed after retry — schema validation failed. ` +
        `scenes.length=${parsed.scenes?.length ?? "undefined"}. Raw:\n${raw}`
      );
    }
  }

  return parsed;
}

module.exports = { runStage3, assembleImagePrompt };
