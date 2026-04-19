import { setStage, updateJob } from "../store/jobsStore.js";
import {
  cleanupTranscript,
  generateVideoFromDirectorPrompt,
  transcribeWhisper,
} from "../services/mlServiceClient.js";
import type { JobRecord } from "../types/job.js";

function deriveAudioDurationSeconds(transcript: {
  text: string;
  words: Array<{ word: string; start: number; end: number }>;
}): number {
  const wordEnds = transcript.words
    .map((w) => Number(w.end))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (wordEnds.length > 0) {
    return Math.max(...wordEnds);
  }

  // Fallback when STT does not return timings: estimate from speaking rate.
  const wordCount = transcript.text.trim().split(/\s+/).filter(Boolean).length;
  const wordsPerSecond = 2.4;
  return Math.max(6, wordCount / wordsPerSecond);
}

/**
 * Strict stack pipeline orchestration:
 * - ElevenLabs STT for transcription (record branch) — language tag from response
 * - K2 Think for cleanup + director prompt output
 */
export async function runPipeline(job: JobRecord, audioBuffer?: Buffer): Promise<void> {
  const { id } = job;
  const rawAudioBase64 = audioBuffer?.toString("base64");

  setStage(id, "transcribing");
  const transcript = await transcribeWhisper({
    audioBase64: rawAudioBase64,
    mimeType: "audio/webm",
  });
  const languageTag = transcript.language ?? null;

  console.log("[pipeline][stt]", id, {
    provider: transcript.provider,
    language: languageTag,
    text: transcript.text,
    words: transcript.words,
  });

  setStage(id, "cleaning");
  const cleanTranscript = await cleanupTranscript({
    transcript: transcript.text,
    language: languageTag,
    filters: job.filters,
  });

  const directorPrompt =
    cleanTranscript.directorPrompt?.trim() ||
    cleanTranscript.text;

  console.log("[pipeline][cleanup]", id, {
    provider: cleanTranscript.provider,
    cleanTranscript: cleanTranscript.text,
    directorPrompt,
  });

  setStage(id, "generating_video");
  const targetDurationSeconds = Math.min(120, Math.max(6, deriveAudioDurationSeconds(transcript)));
  const video = await generateVideoFromDirectorPrompt({
    directorPrompt,
    targetDurationSeconds,
  });
  const videoDataUrl = `data:${video.mimeType};base64,${video.videoBase64}`;

  console.log("[pipeline][video]", id, {
    provider: video.provider,
    model: video.model,
    mimeType: video.mimeType,
    targetDurationSeconds,
    bytesApprox: Math.round((video.videoBase64.length * 3) / 4),
  });

  updateJob(id, {
    stage: "ready",
    result: {
      transcript: transcript.text,
      cleanTranscript: cleanTranscript.text,
      language: cleanTranscript.language,
      directorPrompt,
      videoDataUrl,
      videoMimeType: video.mimeType,
      videoProvider: video.provider,
      videoModel: video.model,
      rawModelJson: cleanTranscript.rawModelJson,
    },
  });
  console.log("[pipeline]", id, {
    language: cleanTranscript.language,
    hasDirectorPrompt: Boolean(directorPrompt),
    hasVideo: Boolean(videoDataUrl),
  });
}
