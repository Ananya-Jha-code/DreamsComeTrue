// lib/stage4.js
// Stage 4 — Gemini image generation
//
// Takes the structured scene plan from Stage 3 (K2 Think) and generates one
// image per scene via the Gemini image generation API. Returns the scene plan
// with base64 image data attached to each scene, ready for the film player.
//
// Env vars:
//   GEMINI_API_KEY  — Google AI Studio API key

"use strict";

const { assembleImagePrompt } = require("./stage3");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Gemini image generation model
// gemini-2.0-flash-exp-image-generation supports responseModalities: ["IMAGE"]
const IMAGE_MODEL = "gemini-2.0-flash-exp-image-generation";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// ─── Single scene image generation ───────────────────────────────────────

async function generateSceneImage(scene) {
  const { positive, negative } = assembleImagePrompt(scene);

  // Gemini image generation prompt: positive description + negative guidance
  const prompt =
    positive +
    (negative
      ? `\n\nDo not include: ${negative}`
      : "");

  const url = `${GEMINI_BASE}/${IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini image API error ${res.status} for scene ${scene.index}: ${text}`);
  }

  const data = await res.json();

  // Response shape: candidates[0].content.parts[].inlineData.data (base64)
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith("image/"));

  if (!imagePart) {
    throw new Error(
      `Gemini returned no image for scene ${scene.index}. ` +
      `Response: ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  return {
    mimeType: imagePart.inlineData.mimeType,
    data:     imagePart.inlineData.data, // base64 string
  };
}

// ─── runStage4 ────────────────────────────────────────────────────────────

/**
 * Generates one image per scene and attaches it to the scene plan.
 *
 * @param {object}   scenePlan          — full output from runStage3
 * @param {Function} [onProgress]       — optional callback(sceneIndex, total)
 * @returns {Promise<object>}           — scenePlan with .image added to each scene
 */
async function runStage4(scenePlan, onProgress) {
  const { scenes } = scenePlan;
  const enrichedScenes = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (onProgress) onProgress(i + 1, scenes.length);

    const image = await generateSceneImage(scene);

    enrichedScenes.push({
      ...scene,
      image, // { mimeType, data }
    });
  }

  return {
    ...scenePlan,
    scenes: enrichedScenes,
  };
}

module.exports = { runStage4, generateSceneImage };
