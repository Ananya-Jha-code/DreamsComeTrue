export type JobStage =
  | "queued"
  | "transcribing"
  | "cleaning"
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
    language?: string;
    directorPrompt?: string;
    rawModelJson?: Record<string, unknown>;
  };
}
