import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { setStage, updateJob } from "../store/jobsStore.js";
import {
  cleanupTranscript,
  generateAmbientAudio,
  generateNarrationAudio,
  generateSceneImages,
  generateVideo,
  planScenes,
  rewriteStory,
  transcribeWhisper,
} from "../services/mlServiceClient.js";
import type { JobRecord } from "../types/job.js";

const GENERATED_DIR = path.resolve(process.cwd(), "generated");

function buildFallbackDirectorPrompt(transcript: string, language: string | null, filters: JobRecord["filters"]): string {
  const lang = (language ?? "en").trim() || "en";
  return [
    "Lullaby fallback director brief for movie generation.",
    `Language: ${lang}`,
    `Visual style: ${filters.visualStyle}`,
    `Narrator voice: ${filters.narratorVoice}`,
    `Reading level: ${filters.readingLevel}`,
    `Tone: ${filters.tone}`,
    `Pacing: ${filters.pacing}`,
    "Create a coherent narrative film with stable character/world continuity.",
    "Avoid abstract geometric visuals and unrelated color pulses.",
    "Base story transcript:",
    transcript,
  ].join("\n");
}

function runCommand(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: "pipe", cwd });
    let stderr = "";

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}. ${stderr}`));
    });
  });
}

function normalizeBase64(value: string): string {
  const commaIdx = value.indexOf(",");
  if (commaIdx >= 0 && value.slice(0, commaIdx).includes("base64")) {
    return value.slice(commaIdx + 1);
  }
  return value;
}

async function assembleVideo(jobId: string, videoBase64: string, narrationAudioBase64: string): Promise<string> {
  await mkdir(GENERATED_DIR, { recursive: true });
  const rawVideoPath = path.join(GENERATED_DIR, `${jobId}-veo.mp4`);
  const narrationPath = path.join(GENERATED_DIR, `${jobId}-narration.mp3`);
  const outputPath = path.join(GENERATED_DIR, `${jobId}.mp4`);
  await writeFile(rawVideoPath, Buffer.from(normalizeBase64(videoBase64), "base64"));
  await writeFile(narrationPath, Buffer.from(normalizeBase64(narrationAudioBase64), "base64"));

  await runCommand("ffmpeg", [
    "-y",
    "-i",
    rawVideoPath,
    "-i",
    narrationPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    outputPath,
  ]);

  const baseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3001"}`;
  return `${baseUrl.replace(/\/$/, "")}/generated/${jobId}.mp4`;
}

/**
 * Strict stack pipeline orchestration:
 * - ElevenLabs STT for transcription (record branch) — language tag from response
 * - K2 Think primary + Gemini 2.5 Pro fallback for cleanup/planning/rewrite
 * - Imagen 3 primary + FLUX.1 schnell fallback for images
 * - Gemini 2.5 native multimodal audio for narration + ambient
 * - Veo3 for video generation
 * - Google TTS for narration
 * - FFmpeg for muxing
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
    buildFallbackDirectorPrompt(cleanTranscript.text, cleanTranscript.language ?? languageTag, job.filters);

  console.log("[pipeline][cleanup]", id, {
    provider: cleanTranscript.provider,
    cleanTranscript: cleanTranscript.text,
    directorPrompt,
  });

  setStage(id, "planning");
  const scenePlan = await planScenes({
    transcript: cleanTranscript.text,
    filters: job.filters,
    language: cleanTranscript.language ?? languageTag,
    directorPrompt,
  });

  console.log("[pipeline][plan]", id, {
    provider: scenePlan.provider,
    scenePrompts: scenePlan.scenes.map((scene) => ({
      id: scene.id,
      prompt: scene.prompt,
    })),
  });

  setStage(id, "rewriting");
  const rewritten = await rewriteStory({
    transcript: cleanTranscript.text,
    filters: job.filters,
    language: cleanTranscript.language ?? languageTag,
    directorPrompt,
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

  setStage(id, "generating_video");
  const video = await generateVideo({
    directorPrompt,
    scenes: scenePlan.scenes,
    script: rewritten.script,
    filters: job.filters,
  });

  setStage(id, "assembling");
  const videoUrl = await assembleVideo(id, video.videoBase64, narration.audioBase64);

  updateJob(id, {
    stage: "ready",
    result: {
      transcript: transcript.text,
      cleanTranscript: cleanTranscript.text,
      language: cleanTranscript.language,
      directorPrompt,
      rawModelJson: cleanTranscript.rawModelJson,
      videoUrl,
    },
  });
  console.log("[pipeline]", id, {
    imageCount: images.imageUrls.length,
    narrationBytes: narration.audioBase64.length,
    ambientBytes: ambient.audioBase64.length,
    videoProvider: video.provider,
    videoUrl,
  });
}
