// lib/stage6_video.js
// Stage 6 — Veo 3.1 image-to-video
//
// Takes a still image (base64) from Stage 4 and animates it into a 6-second
// MP4 clip using Veo 3.1. Polls the long-running operation until done, then
// downloads and returns the video bytes as base64.
//
// Env vars:
//   GEMINI_API_KEY  — same key used for Gemini image gen

"use strict";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const VEO_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning";
const OPERATIONS_BASE = "https://generativelanguage.googleapis.com/v1beta";

const POLL_INTERVAL_MS  = 5000;
const MAX_POLL_ATTEMPTS = 72; // 6 min max

// ─── generateSceneVideo ───────────────────────────────────────────────────

/**
 * @param {string} imageBase64       — base64 still image from Stage 4
 * @param {string} imageMime         — e.g. "image/png"
 * @param {string} sceneDescription  — from image_prompt.scene_description
 * @param {string} mood              — from image_prompt.mood
 * @returns {Promise<{ mimeType: "video/mp4", data: string }>}  base64 MP4
 */
async function generateSceneVideo(imageBase64, imageMime, sceneDescription, mood) {
  const prompt = `${sceneDescription} ${mood}. Subtle cinematic motion, gentle animation, no sudden cuts.`;

  // 1. Submit the long-running job
  const submitRes = await fetch(VEO_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      instances: [{
        prompt,
        image: { bytesBase64Encoded: imageBase64, mimeType: imageMime },
      }],
      parameters: {
        aspectRatio:     "16:9",
        resolution:      "720p",
        durationSeconds: 6,
      },
    }),
  });

  if (!submitRes.ok) {
    const txt = await submitRes.text();
    throw new Error(`Veo submit error ${submitRes.status}: ${txt}`);
  }

  const { name: operationName } = await submitRes.json();
  if (!operationName) throw new Error("Veo did not return an operation name");

  // 2. Poll until done
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(
      `${OPERATIONS_BASE}/${operationName}?key=${GEMINI_API_KEY}`,
      { headers: { "x-goog-api-key": GEMINI_API_KEY } }
    );

    if (!pollRes.ok) {
      const txt = await pollRes.text();
      throw new Error(`Veo poll error ${pollRes.status}: ${txt}`);
    }

    const op = await pollRes.json();

    if (!op.done) continue;
    if (op.error) throw new Error(`Veo operation failed: ${JSON.stringify(op.error)}`);

    const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) throw new Error("Veo done but no video URI in response");

    // 3. Download video bytes — URI redirects to CDN, append key + follow redirect
    const dlUri = uri.includes("?") ? `${uri}&key=${GEMINI_API_KEY}` : `${uri}?key=${GEMINI_API_KEY}`;
    const dlRes = await fetch(dlUri, { redirect: "follow" });
    if (!dlRes.ok) throw new Error(`Veo download error ${dlRes.status}`);

    const buf = await dlRes.arrayBuffer();
    return {
      mimeType: "video/mp4",
      data:     Buffer.from(buf).toString("base64"),
    };
  }

  throw new Error(`Veo timed out after ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`);
}

module.exports = { generateSceneVideo };
