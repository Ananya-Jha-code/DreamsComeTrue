import type { StoryFilters } from "../types/filters.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";
const ML_SERVICE_TOKEN = process.env.ML_SERVICE_TOKEN ?? "dev-token";

interface SceneDescriptor {
  id: string;
  prompt: string;
  seconds: number;
  ambientTag: string;
}

async function mlPost<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${ML_SERVICE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ml-token": ML_SERVICE_TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ML service ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TRes;
}

export async function transcribeWhisper(input: {
  audioBase64?: string;
  mimeType: string;
}): Promise<{ text: string; words: Array<{ word: string; start: number; end: number }>; provider: string }> {
  return mlPost("/v1/transcribe", input);
}

export async function cleanupTranscript(input: {
  transcript: string;
}): Promise<{ text: string; provider: string }> {
  return mlPost("/v1/cleanup", input);
}

export async function planScenes(input: {
  transcript: string;
  filters: StoryFilters;
}): Promise<{ scenes: SceneDescriptor[]; provider: string }> {
  return mlPost("/v1/plan", input);
}

export async function rewriteStory(input: {
  transcript: string;
  filters: StoryFilters;
}): Promise<{ script: string; provider: string }> {
  return mlPost("/v1/rewrite", input);
}

export async function generateSceneImages(input: {
  scenes: SceneDescriptor[];
  filters: StoryFilters;
}): Promise<{ imageUrls: string[]; provider: string; fallbackUsed: boolean }> {
  return mlPost("/v1/images", input);
}

export async function generateNarrationAudio(input: {
  script: string;
  filters: StoryFilters;
}): Promise<{ audioBase64: string; provider: string }> {
  return mlPost("/v1/audio/narration", input);
}

export async function generateAmbientAudio(input: {
  scenes: SceneDescriptor[];
  filters: StoryFilters;
}): Promise<{ audioBase64: string; provider: string }> {
  return mlPost("/v1/audio/ambient", input);
}

