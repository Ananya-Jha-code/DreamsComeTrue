import type { StoryFilters } from "./filters.js";

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
    /** Title chosen for the storybook */
    bookTitle?: string;
    /** Paragraphs that map to individual picture-book pages */
    pictureBookParagraphs?: string[];
    /** Generated picture-book pages */
    pages?: PictureBookPage[];
    /** K2 parse payload (JSON object) for debugging */
    rawModelJson?: Record<string, unknown>;
  };
}
