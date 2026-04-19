import { setStage, updateJob } from "../store/jobsStore.js";
import {
  cleanupTranscript,
  generateIllustrationFromPrompt,
  transcribeWhisper,
} from "../services/mlServiceClient.js";
import type { JobRecord } from "../types/job.js";

const FILTER_LABELS: Record<string, Record<string, string>> = {
  visualStyle: {
    watercolor: "Watercolor Storybook",
    pixar: "Pixar-like 3D",
    ghibli: "Studio Ghibli",
    paper_cutout: "Paper Cutout",
    charcoal: "Charcoal Sketch",
    crayon: "Crayon Drawing",
  },
  narratorVoice: {
    warm_mother: "Warm Mother",
    wise_grandfather: "Wise Grandfather",
    playful_sister: "Playful Sister",
    gentle_father: "Gentle Father",
    mysterious_narrator: "Mysterious Narrator",
    kid_narrator: "Kid Narrator",
  },
  readingLevel: {
    toddler: "Toddler",
    early_reader: "Early Reader",
    grade_school: "Grade School",
    advanced: "Advanced",
  },
  tone: {
    cozy: "Cozy",
    adventurous: "Adventurous",
    whimsical: "Whimsical",
    mysterious: "Mysterious",
    tender: "Tender",
  },
  pacing: {
    unhurried: "Unhurried",
    natural: "Natural",
    brisk: "Brisk",
  },
};

function labelFilter(key: keyof typeof FILTER_LABELS, value: string): string {
  return FILTER_LABELS[key][value] ?? value;
}

function splitParagraphs(text: string): string[] {
  const cleaned = text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (cleaned.length > 1) {
    return cleaned;
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length <= 2) {
    return [text.trim()].filter(Boolean);
  }

  const targetCount = Math.min(6, Math.max(3, Math.round(sentences.length / 2)));
  const paragraphs: string[] = [];
  const chunkSize = Math.max(1, Math.ceil(sentences.length / targetCount));
  for (let index = 0; index < sentences.length; index += chunkSize) {
    paragraphs.push(sentences.slice(index, index + chunkSize).join(" ").trim());
  }
  return paragraphs.filter(Boolean);
}

function deriveAudioDurationSeconds(transcript: {
  text: string;
  words: Array<{ word: string; start: number; end: number }>;
}): number {
  const wordEnds = transcript.words
    .map((w) => Number(w.end))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (wordEnds.length > 0) {
    return Math.max(...wordEnds);
  }

  // Fallback when STT does not return timings: estimate from speaking rate.
  const wordCount = transcript.text.trim().split(/\s+/).filter(Boolean).length;
  const wordsPerSecond = 2.4;
  return Math.max(6, wordCount / wordsPerSecond);
}

/**
 * Strict stack pipeline orchestration:
 * - ElevenLabs STT for transcription (record branch) — language tag from response
 * - K2 Think for cleanup + paragraph planning
 * - FLUX.1-schnell on Together for picture-book page illustrations
 */
export async function runPipeline(job: JobRecord, audioBuffer?: Buffer): Promise<void> {
  const { id } = job;
  const rawAudioBase64 = audioBuffer?.toString("base64");

  setStage(id, "transcribing");
  const transcript = await transcribeWhisper({
    audioBase64: rawAudioBase64,
    mimeType: "audio/webm",
  } as { audioBase64?: string; mimeType: string });
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

  console.log("[pipeline][cleanup]", id, {
    provider: cleanTranscript.provider,
    cleanTranscript: cleanTranscript.text,
    bookTitle: cleanTranscript.bookTitle,
    paragraphCount: cleanTranscript.pictureBookParagraphs.length,
  });

  setStage(id, "generating_pages");
  const bookTitle = cleanTranscript.bookTitle?.trim() || "My Picture Book";
  const paragraphs =
    cleanTranscript.pictureBookParagraphs.length > 0
      ? cleanTranscript.pictureBookParagraphs
      : splitParagraphs(cleanTranscript.text);

  const pages: Array<{
    index: number;
    paragraph: string;
    imageDataUrl: string;
    imageMimeType: string;
    imageProvider: string;
    imageModel: string;
    imagePrompt: string;
  }> = [];

  for (const [index, paragraph] of paragraphs.entries()) {
    const imagePrompt = [
      `Illustrate page ${index + 1} of ${paragraphs.length} for a children's picture book titled "${bookTitle}".`,
      `Paragraph: ${paragraph}`,
      `Global style: ${labelFilter("visualStyle", job.filters.visualStyle)}.`,
      `Narration feel: ${labelFilter("narratorVoice", job.filters.narratorVoice)}.`,
      `Reading level: ${labelFilter("readingLevel", job.filters.readingLevel)}.`,
      `Tone: ${labelFilter("tone", job.filters.tone)}.`,
      `Pacing: ${labelFilter("pacing", job.filters.pacing)}.`,
      "Compose as a full-page storybook illustration with strong foreground, middle ground, and background depth.",
      "Keep characters visually consistent across pages and avoid any text, letters, words, numbers, captions, frames, speech bubbles, signs, labels, logos, or watermarks.",
      "The page should feel warm, readable, and directly connected to the paragraph.",
    ].join("\n");

    const illustration = await generateIllustrationFromPrompt({
      prompt: imagePrompt,
      aspectRatio: "3:4",
    });
    pages.push({
      index,
      paragraph,
      imageDataUrl: `data:${illustration.mimeType};base64,${illustration.imageBase64}`,
      imageMimeType: illustration.mimeType,
      imageProvider: illustration.provider,
      imageModel: illustration.model,
      imagePrompt,
    });
    console.log("[pipeline][page]", id, {
      page: index + 1,
      provider: illustration.provider,
      model: illustration.model,
    });

    updateJob(id, {
      result: {
        bookTitle,
        pictureBookParagraphs: paragraphs,
        pages: [...pages],
      },
    });
  }

  updateJob(id, {
    stage: "ready",
    result: {
      transcript: transcript.text,
      cleanTranscript: cleanTranscript.text,
      language: cleanTranscript.language,
      bookTitle,
      pictureBookParagraphs: paragraphs,
      pages,
      rawModelJson: cleanTranscript.rawModelJson,
    },
  });
  console.log("[pipeline]", id, {
    language: cleanTranscript.language,
    paragraphCount: paragraphs.length,
    pagesGenerated: pages.length,
  });
}
