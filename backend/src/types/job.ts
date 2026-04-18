import type { StoryFilters } from "./filters.js";

export type JobStage =
  | "queued"
  | "transcribing"
  | "cleaning"
  | "planning"
  | "rewriting"
  | "generating_images"
  | "generating_audio"
  | "assembling"
  | "ready"
  | "failed";

export interface JobRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  stage: JobStage;
  filters: StoryFilters;
  error?: string;
  /** Populated as the pipeline runs */
  result?: {
    transcript?: string;
    cleanTranscript?: string;
    /** BCP-47 / ISO from STT + cleanup */
    language?: string;
    /** K2-produced brief for downstream scene plan + rewrite */
    directorPrompt?: string;
    /** K2 parse payload (JSON object) for debugging / downstream */
    rawModelJson?: Record<string, unknown>;
    videoUrl?: string;
  };
}
