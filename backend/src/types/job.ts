import type { StoryFilters } from "./filters.js";

export type JobStage =
  | "queued"
  | "transcribing"
  | "cleaning"
  | "generating_video"
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
    /** K2-produced director prompt */
    directorPrompt?: string;
    /** Data URL safe to render directly in browser video tag */
    videoDataUrl?: string;
    /** MIME type returned by Veo generation */
    videoMimeType?: string;
    /** Video provider/model metadata */
    videoProvider?: string;
    videoModel?: string;
    /** K2 parse payload (JSON object) for debugging */
    rawModelJson?: Record<string, unknown>;
  };
}
