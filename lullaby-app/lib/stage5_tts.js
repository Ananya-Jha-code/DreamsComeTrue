// lib/stage5_tts.js
// Stage 5 — Google Cloud Text-to-Speech narration
//
// Converts narration text to MP3 audio using the Google TTS REST API.
// Returns base64-encoded audio data ready for the film player.
//
// Env vars:
//   GOOGLE_TTS_API_KEY  — Google Cloud API key with TTS enabled
//                         (falls back to GEMINI_API_KEY if not set)

"use strict";

const TTS_API_KEY =
  process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY || "";

// Map from narrator_voice filter values to Google TTS voice names
const VOICE_MAP = {
  warm_mother:          { name: "en-US-Journey-F", languageCode: "en-US" },
  wise_grandfather:     { name: "en-US-Journey-D", languageCode: "en-US" },
  playful_sister:       { name: "en-US-Studio-O",  languageCode: "en-US" },
  gentle_father:        { name: "en-US-Journey-D", languageCode: "en-US" },
  mysterious_narrator:  { name: "en-US-Studio-Q",  languageCode: "en-US" },
  kid_narrator:         { name: "en-US-Studio-O",  languageCode: "en-US" },
};

const DEFAULT_VOICE = { name: "en-US-Journey-F", languageCode: "en-US" };

// ─── generateSceneTTS ─────────────────────────────────────────────────────

/**
 * Synthesizes speech for a single narration segment.
 *
 * @param {string} text       — narration text to synthesize
 * @param {string} voiceKey   — narrator_voice filter value (e.g. "warm_mother")
 * @returns {Promise<{ mimeType: string, data: string }>}
 *   mimeType: "audio/mp3", data: base64-encoded MP3
 */
async function generateSceneTTS(text, voiceKey) {
  const voice = VOICE_MAP[voiceKey] || DEFAULT_VOICE;

  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_API_KEY}`;

  const body = {
    input:       { text },
    voice:       { languageCode: voice.languageCode, name: voice.name },
    audioConfig: { audioEncoding: "MP3" },
  };

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google TTS API error ${res.status}: ${errText}`);
  }

  const data = await res.json();

  if (!data.audioContent) {
    throw new Error("Google TTS returned no audioContent");
  }

  return {
    mimeType: "audio/mp3",
    data:     data.audioContent, // base64 MP3
  };
}

module.exports = { generateSceneTTS };
