import type { StoryFilters } from "../types/filters.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";
const ML_SERVICE_TOKEN = process.env.ML_SERVICE_TOKEN ?? "dev-token";
const ML_SERVICE_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS ?? 45000);
const ML_SERVICE_MAX_ATTEMPTS = Number(process.env.ML_SERVICE_MAX_ATTEMPTS ?? 4);
const ML_SERVICE_RETRY_BASE_MS = Number(process.env.ML_SERVICE_RETRY_BASE_MS ?? 2000);
const ML_SERVICE_LOG_CALLS = (process.env.ML_SERVICE_LOG_CALLS ?? "false").toLowerCase() === "true";
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatErrorBody(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 240)}...` : compact;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildMlUrl(path: string): string {
  const base = normalizeBaseUrl(ML_SERVICE_URL);
  let nextPath = path.startsWith("/") ? path : `/${path}`;

  // If env includes /v1 already, avoid calling /v1/v1/... by stripping the duplicate segment.
  if (/\/v1$/i.test(base) && /^\/v1(\/|$)/i.test(nextPath)) {
    nextPath = nextPath.replace(/^\/v1/i, "");
    if (!nextPath.startsWith("/")) {
      nextPath = `/${nextPath}`;
    }
  }

  return `${base}${nextPath}`;
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError") {
    return true;
  }
  return true;
}

async function mlPost<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= ML_SERVICE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const targetUrl = buildMlUrl(path);
      if (ML_SERVICE_LOG_CALLS && attempt === 1) {
        console.info(`[mlServiceClient] Calling ML endpoint: ${targetUrl}`);
      }
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ml-token": ML_SERVICE_TOKEN,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ML_SERVICE_TIMEOUT_MS),
      });

      if (res.ok) {
        return (await res.json()) as TRes;
      }

      const text = await res.text();
      const formatted = formatErrorBody(text);
      const shouldRetry = RETRYABLE_STATUSES.has(res.status) && attempt < ML_SERVICE_MAX_ATTEMPTS;

      if (shouldRetry) {
        await sleep(ML_SERVICE_RETRY_BASE_MS * attempt);
        continue;
      }

      throw new Error(`ML service ${path} failed (${res.status}) on attempt ${attempt} [${targetUrl}]: ${formatted}`);
    } catch (error) {
      if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error(String(error));
      }

      const shouldRetry = attempt < ML_SERVICE_MAX_ATTEMPTS && isRetryableFetchError(error);
      if (!shouldRetry) {
        break;
      }

      await sleep(ML_SERVICE_RETRY_BASE_MS * attempt);
    }
  }

  throw new Error(`ML service ${path} unavailable after ${ML_SERVICE_MAX_ATTEMPTS} attempts: ${lastError?.message ?? "unknown error"}`);
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

