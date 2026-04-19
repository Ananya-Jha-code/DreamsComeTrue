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

function createFallbackPageImage(input: {
  title: string;
  paragraph: string;
  pageIndex: number;
  filters: JobRecord["filters"];
}): { imageDataUrl: string; mimeType: string; provider: string; model: string } {
  const visualStyle = labelFilter("visualStyle", input.filters.visualStyle);
  const tone = labelFilter("tone", input.filters.tone);
  const palette = {
    watercolor: ["#f7ede2", "#d8e8f5", "#f1c8a9"],
    pixar: ["#11224d", "#4a90e2", "#f7c948"],
    ghibli: ["#bfe3c0", "#7bbf6a", "#ffe8a3"],
    paper_cutout: ["#f2eadf", "#b9d6f2", "#e8b56b"],
    charcoal: ["#111111", "#404040", "#d9d9d9"],
    crayon: ["#fff3d6", "#8cd17d", "#f59ec4"],
  }[input.filters.visualStyle] ?? ["#f7ede2", "#d8e8f5", "#f1c8a9"];
  const safeText = input.paragraph
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 260);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette[0]}" />
          <stop offset="55%" stop-color="${palette[1]}" />
          <stop offset="100%" stop-color="${palette[2]}" />
        </linearGradient>
      </defs>
      <rect width="800" height="1000" fill="url(#bg)"/>
      <circle cx="640" cy="170" r="120" fill="#ffffff" opacity="0.18"/>
      <ellipse cx="400" cy="740" rx="330" ry="170" fill="#ffffff" opacity="0.18"/>
      <rect x="90" y="90" width="620" height="820" rx="36" fill="#fffaf3" opacity="0.82"/>
      <text x="140" y="180" font-family="Georgia, serif" font-size="42" fill="#2a241b">${input.title}</text>
      <text x="140" y="240" font-family="Arial, sans-serif" font-size="24" fill="#6d6456">Page ${input.pageIndex + 1} · ${visualStyle} · ${tone}</text>
      <text x="140" y="350" font-family="Georgia, serif" font-size="34" fill="#2a241b">
        ${safeText.slice(0, 58)}
      </text>
      <text x="140" y="395" font-family="Georgia, serif" font-size="34" fill="#2a241b">
        ${safeText.slice(58, 116)}
      </text>
      <text x="140" y="440" font-family="Georgia, serif" font-size="34" fill="#2a241b">
        ${safeText.slice(116, 174)}
      </text>
      <text x="140" y="485" font-family="Georgia, serif" font-size="34" fill="#2a241b">
        ${safeText.slice(174, 232)}
      </text>
      <rect x="140" y="580" width="520" height="280" rx="28" fill="#f3e6cf" opacity="0.9"/>
      <circle cx="270" cy="690" r="90" fill="#c67d4a" opacity="0.72"/>
      <circle cx="430" cy="670" r="120" fill="#6a8f54" opacity="0.68"/>
      <circle cx="555" cy="720" r="64" fill="#e5af5e" opacity="0.72"/>
      <text x="140" y="920" font-family="Arial, sans-serif" font-size="20" fill="#6d6456">Fallback illustration generated locally for ${visualStyle} style.</text>
    </svg>
  `;
  return {
    imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    mimeType: "image/svg+xml",
    provider: "local-svg-fallback",
    model: "storybook-fallback",
  };
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
 * - Imagen for picture-book page illustrations
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
      "Keep characters visually consistent across pages and avoid any text, captions, frames, or watermarks.",
      "The page should feel warm, readable, and directly connected to the paragraph.",
    ].join("\n");

    try {
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
    } catch (error) {
      const fallback = createFallbackPageImage({
        title: bookTitle,
        paragraph,
        pageIndex: index,
        filters: job.filters,
      });
      pages.push({
        index,
        paragraph,
        imageDataUrl: fallback.imageDataUrl,
        imageMimeType: fallback.mimeType,
        imageProvider: fallback.provider,
        imageModel: fallback.model,
        imagePrompt,
      });
      console.warn("[pipeline][page-fallback]", id, {
        page: index + 1,
        error: error instanceof Error ? error.message : String(error),
      });
    }

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
