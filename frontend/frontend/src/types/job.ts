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

export interface StoryFilters {
  visualStyle: string;
  narratorVoice: string;
  readingLevel: string;
  tone: string;
  pacing: string;
}

export interface JobRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  stage: JobStage;
  filters: StoryFilters;
  error?: string;
  result?: {
    transcript?: string;
    cleanTranscript?: string;
    videoUrl?: string;
  };
}
