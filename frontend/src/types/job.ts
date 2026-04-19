export type JobStage =
  | "queued"
  | "transcribing"
  | "cleaning"
  | "generating_pages"
  | "ready"
  | "failed";

export interface PictureBookPage {
  index: number;
  paragraph: string;
  imageDataUrl: string;
  imageMimeType: string;
  imageProvider: string;
  imageModel: string;
  imagePrompt: string;
}

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
    bookTitle?: string;
    pictureBookParagraphs?: string[];
    pages?: PictureBookPage[];
    rawModelJson?: Record<string, unknown>;
  };
}
