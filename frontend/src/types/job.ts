export type JobStage =
  | "queued"
  | "transcribing"
  | "cleaning"
  | "generating_video"
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
    videoDataUrl?: string;
    videoMimeType?: string;
    videoProvider?: string;
    videoModel?: string;
    rawModelJson?: Record<string, unknown>;
  };
}
