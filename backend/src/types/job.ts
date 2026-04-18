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
    videoUrl?: string;
  };
}
