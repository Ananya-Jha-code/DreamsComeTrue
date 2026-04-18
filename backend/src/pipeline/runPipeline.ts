import { setStage, updateJob } from "../store/jobsStore.js";
import type { JobRecord } from "../types/job.js";

/**
 * Placeholder async pipeline. Replace with Whisper → cleanup → plan → rewrite
 * → images → Gemini audio → FFmpeg.
 */
export async function runPipelineStub(job: JobRecord): Promise<void> {
  const { id } = job;

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  setStage(id, "transcribing");
  await delay(400);

  setStage(id, "cleaning");
  await delay(300);

  setStage(id, "planning");
  await delay(300);

  setStage(id, "rewriting");
  await delay(300);

  setStage(id, "generating_images");
  await delay(500);

  setStage(id, "generating_audio");
  await delay(400);

  setStage(id, "assembling");
  await delay(300);

  updateJob(id, {
    stage: "ready",
    result: {
      transcript: "(stub) Your story will appear here after Whisper runs.",
      cleanTranscript: "(stub) Cleaned transcript after artifact removal.",
      videoUrl: undefined,
    },
  });
}
