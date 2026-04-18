import { setStage, updateJob } from "../store/jobsStore.js";
import {
  cleanupTranscript,
  generateAmbientAudio,
  generateNarrationAudio,
  generateSceneImages,
  planScenes,
  rewriteStory,
  transcribeWhisper,
} from "../services/mlServiceClient.js";
import type { JobRecord } from "../types/job.js";

/**
 * Strict stack pipeline orchestration:
 * - Whisper large-v3 (Modal/Replicate) for transcription
 * - K2 Think primary + Gemini 2.5 Pro fallback for cleanup/planning/rewrite
 * - Imagen 3 primary + FLUX.1 schnell fallback for images
 * - Gemini 2.5 native multimodal audio for narration + ambient
 * - FFmpeg for assembly (placeholder in scaffold)
 */
export async function runPipeline(job: JobRecord, audioBuffer?: Buffer): Promise<void> {
  const { id } = job;
  const rawAudioBase64 = audioBuffer?.toString("base64");

  setStage(id, "transcribing");
  const transcript = await transcribeWhisper({
    audioBase64: rawAudioBase64,
    mimeType: "audio/webm",
  });

  setStage(id, "cleaning");
  const cleanTranscript = await cleanupTranscript({
    transcript: transcript.text,
  });

  setStage(id, "planning");
  const scenePlan = await planScenes({
    transcript: cleanTranscript.text,
    filters: job.filters,
  });

  setStage(id, "rewriting");
  const rewritten = await rewriteStory({
    transcript: cleanTranscript.text,
    filters: job.filters,
  });

  setStage(id, "generating_images");
  const images = await generateSceneImages({
    scenes: scenePlan.scenes,
    filters: job.filters,
  });

  setStage(id, "generating_audio");
  const narration = await generateNarrationAudio({
    script: rewritten.script,
    filters: job.filters,
  });
  const ambient = await generateAmbientAudio({
    scenes: scenePlan.scenes,
    filters: job.filters,
  });

  setStage(id, "assembling");
  const ffmpegNote =
    "(scaffold) FFmpeg assembly placeholder. Wire real asset download + compose + Supabase upload.";

  updateJob(id, {
    stage: "ready",
    result: {
      transcript: transcript.text,
      cleanTranscript: cleanTranscript.text,
      videoUrl: undefined,
    },
  });
  console.log("[pipeline]", id, {
    imageCount: images.imageUrls.length,
    narrationBytes: narration.audioBase64.length,
    ambientBytes: ambient.audioBase64.length,
    ffmpegNote,
  });
}
