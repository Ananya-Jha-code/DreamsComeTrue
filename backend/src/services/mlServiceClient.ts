import type { StoryFilters } from "../types/filters.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";
const ML_SERVICE_TOKEN = process.env.ML_SERVICE_TOKEN ?? "dev-token";

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
}): Promise<{
  text: string;
  words: Array<{ word: string; start: number; end: number }>;
  provider: string;
  language?: string | null;
}> {
  return mlPost("/v1/transcribe", input);
}

export async function cleanupTranscript(input: {
  transcript: string;
  language?: string | null;
  filters: StoryFilters;
}): Promise<{
  text: string;
  language: string;
  directorPrompt: string;
  provider: string;
  /** Full K2-shaped JSON (clean_transcript / language / director_prompt) + extras from parser */
  rawModelJson: Record<string, unknown>;
}> {
  const res = await mlPost<
    { transcript: string; language?: string | null; filters: StoryFilters },
    {
      clean_transcript: string;
      language: string;
      director_prompt: string;
      raw_model_json: Record<string, unknown>;
      provider: string;
    }
  >("/v1/cleanup", {
    transcript: input.transcript,
    language: input.language ?? undefined,
    filters: input.filters,
  });
  return {
    text: res.clean_transcript,
    language: res.language,
    directorPrompt: res.director_prompt,
    provider: res.provider,
    rawModelJson: res.raw_model_json,
  };
}

export async function generateVideoFromDirectorPrompt(input: {
  directorPrompt: string;
  targetDurationSeconds?: number;
}): Promise<{
  videoBase64: string;
  mimeType: string;
  provider: string;
  model: string;
}> {
  const res = await mlPost<
    { director_prompt: string; target_duration_seconds?: number },
    {
      video_base64: string;
      mime_type: string;
      provider: string;
      model: string;
    }
  >("/v1/video", {
    director_prompt: input.directorPrompt,
    target_duration_seconds: input.targetDurationSeconds,
  });
  return {
    videoBase64: res.video_base64,
    mimeType: res.mime_type,
    provider: res.provider,
    model: res.model,
  };
}

