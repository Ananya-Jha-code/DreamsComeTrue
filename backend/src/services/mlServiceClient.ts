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
  bookTitle: string;
  pictureBookParagraphs: string[];
  provider: string;
  /** Full K2-shaped JSON (clean_transcript / language / book_title / picture_book_paragraphs) + extras from parser */
  rawModelJson: Record<string, unknown>;
}> {
  const res = await mlPost<
    { transcript: string; language?: string | null; filters: StoryFilters },
    {
      clean_transcript: string;
      language: string;
      book_title: string;
      picture_book_paragraphs: string[];
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
    bookTitle: res.book_title,
    pictureBookParagraphs: res.picture_book_paragraphs,
    provider: res.provider,
    rawModelJson: res.raw_model_json,
  };
}

export async function generateIllustrationFromPrompt(input: {
  prompt: string;
  aspectRatio?: string;
}): Promise<{
  imageBase64: string;
  mimeType: string;
  provider: string;
  model: string;
}> {
  const res = await mlPost<
    { prompt: string; aspect_ratio?: string },
    {
      image_base64: string;
      mime_type: string;
      provider: string;
      model: string;
    }
  >("/v1/illustration", {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio,
  });
  return {
    imageBase64: res.image_base64,
    mimeType: res.mime_type,
    provider: res.provider,
    model: res.model,
  };
}

