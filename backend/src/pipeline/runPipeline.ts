import { setStage, updateJob } from "../store/jobsStore.js";
import {
  cleanupTranscript,
  generateIllustrationFromPrompt,
  transcribeWhisper,
} from "../services/mlServiceClient.js";
import type { JobRecord } from "../types/job.js";
import type { StoryFilters } from "../types/filters.js";

const FILTER_LABELS: Record<keyof StoryFilters, Record<string, string>> = {
  visualStyle: {
    watercolor: "Watercolor Storybook",
    pixar: "Pixar-like 3D",
    ghibli: "Studio Ghibli",
    paper_cutout: "Paper Cutout",
    charcoal: "Charcoal Sketch",
    crayon: "Crayon Drawing",
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
};

function labelFilter(key: keyof StoryFilters, value: StoryFilters[keyof StoryFilters]): string {
  const labelsForAxis = FILTER_LABELS[key];
  return labelsForAxis[value] ?? value;
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

function buildStoryContinuityBrief(input: {
  title: string;
  cleanTranscript: string;
  paragraphs: string[];
}): string {
  const transcriptSnippet = input.cleanTranscript.trim().slice(0, 1200);
  const openingSnippet = (input.paragraphs[0] ?? "").trim();

  return [
    `Story title: ${input.title}`,
    `Opening scene and likely protagonists: ${openingSnippet}`,
    `Whole-story continuity reference: ${transcriptSnippet}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildNoTextPrompt(basePrompt: string): string {
  return `${basePrompt}\nABSOLUTE RULE: zero readable text in the image. Do not render letters, numbers, words, labels, logos, signage, captions, UI text, speech bubbles, or watermarks. If an object would normally contain text (book cover, sign, poster, screen), keep it blank or unreadable.`;
}

function sanitizeForImagePrompt(input: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\b(kill|killed|killing|murder|murdered|blood|gore|dead|death|die|dies|shoot|shot|stab|weapon|gun|knife|war|bomb|explosion|suicide|self-harm)\b/gi, "danger"],
    [/\b(sexy|nude|naked|lingerie|seduce|erotic|sensual)\b/gi, "friendly"],
    [/\b(president|senate|election|campaign|protest|riot|terrorist|extremist)\b/gi, "community"],
    [/\s+/g, " "],
  ];

  let value = input;
  for (const [pattern, replacement] of replacements) {
    value = value.replace(pattern, replacement);
  }
  return value.trim();
}

function simplifySceneNarrative(paragraph: string): string {
  const sanitized = sanitizeForImagePrompt(paragraph);
  const sentences = sanitized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const compact = sentences.slice(0, 2).join(" ");
  return (compact || sanitized).slice(0, 320);
}

function detectProtagonistType(text: string): "vehicle" | "animal" | "robot" | "creature" | "person" {
  const source = text.toLowerCase();
  if (/\b(car|truck|train|bus|plane|airplane|ship|boat|rocket|vehicle)\b/.test(source)) {
    return "vehicle";
  }
  if (/\b(cat|dog|bear|fox|rabbit|bunny|bird|lion|tiger|wolf|mouse|horse|animal|puppy|kitten)\b/.test(source)) {
    return "animal";
  }
  if (/\b(robot|android|machine|mech)\b/.test(source)) {
    return "robot";
  }
  if (/\b(dragon|monster|giant|unicorn|fairy|wizard|alien|creature)\b/.test(source)) {
    return "creature";
  }
  return "person";
}

function buildCharacterAnchorBrief(openingParagraph: string): string {
  const protagonistType = detectProtagonistType(openingParagraph);

  if (protagonistType === "vehicle") {
    return [
      "Primary protagonist lock: same vehicle character in every page.",
      "Keep identical body shape, wheel size, face placement, and paint colors.",
      "Do not redesign model details between pages.",
    ].join(" ");
  }

  if (protagonistType === "animal") {
    return [
      "Primary protagonist lock: same animal character in every page.",
      "Keep identical species, fur pattern/colors, eye shape, and body proportions.",
      "Do not redesign or switch to another species.",
    ].join(" ");
  }

  if (protagonistType === "robot") {
    return [
      "Primary protagonist lock: same robot character in every page.",
      "Keep identical silhouette, head shape, panel layout, and core accent colors.",
      "Do not redesign mechanical parts between pages.",
    ].join(" ");
  }

  if (protagonistType === "creature") {
    return [
      "Primary protagonist lock: same fantasy creature character in every page.",
      "Keep identical species traits, horns/wings/tail shape, and color markings.",
      "Do not switch creature type or redesign signature features.",
    ].join(" ");
  }

  return [
    "Primary protagonist lock: same person character in every page.",
    "Keep identical face shape, hairstyle, outfit colors, and body proportions.",
    "Do not change age, identity, or wardrobe design between pages.",
  ].join(" ");
}

function isModerationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("invalid content detected") ||
    message.includes("flagged and rejected") ||
    message.includes("content moderation")
  );
}

function buildFluxDirectorPrompt(input: {
  pageIndex: number;
  pageCount: number;
  bookTitle: string;
  paragraph: string;
  continuityBrief: string;
  characterAnchorBrief: string;
  visualStyle: string;
  readingLevel: string;
  tone: string;
}): string {
  const pageNumber = input.pageIndex + 1;
  const safeParagraph = simplifySceneNarrative(input.paragraph);
  const safeContinuity = sanitizeForImagePrompt(input.continuityBrief).slice(0, 900);

  return [
    "ROLE: You are an art director generating one picture-book illustration for FLUX.2-pro.",
    `DELIVERABLE: Page ${pageNumber}/${input.pageCount} for the book \"${input.bookTitle}\".`,
    "PRIORITY ORDER: Safety constraints > continuity > scene accuracy > visual beauty.",
    "",
    "SCENE INPUT",
    `Page narrative: ${safeParagraph}`,
    "",
    "GLOBAL CONTINUITY CONTEXT",
    safeContinuity,
    "",
    "ART DIRECTION",
    `Style mode: ${input.visualStyle}`,
    `Audience reading level: ${input.readingLevel}`,
    `Story tone: ${input.tone}`,
    "Color and lighting should support tone while staying friendly and readable for children.",
    "",
    "SHOT DESIGN",
    "Use a full-page portrait composition suitable for a 3:4 picture-book page.",
    "Establish depth with foreground, midground, and background layers.",
    "Keep one clear focal action with strong silhouettes and expressive posing.",
    "Add environmental details that reinforce the scene action without clutter.",
    "",
    "CONTINUITY RULES",
    input.characterAnchorBrief,
    "Maintain the same protagonist identities, proportions, species/type, palette accents, and signature traits.",
    "Never swap protagonist type (for example: a talking vehicle remains a talking vehicle).",
    "If this page is action or travel focused, keep established protagonists visibly present unless the narrative explicitly removes them.",
    "Preserve world logic, setting materials, and recurring props from prior context.",
    "",
    "ABSOLUTE EXCLUSIONS",
    "No readable text in the image under any condition.",
    "Do not render letters, words, numbers, captions, signs, logos, labels, UI elements, speech bubbles, or watermarks.",
    "Do not include title text or typography anywhere on the page.",
    "If text-bearing objects appear, keep text areas blank, abstract, or unreadable.",
    "Avoid split panels, comic gutters, and collage layouts unless explicitly requested.",
  ].join("\n");
}

function buildSafeFallbackPrompt(input: {
  pageIndex: number;
  pageCount: number;
  paragraph: string;
  characterAnchorBrief: string;
  visualStyle: string;
}): string {
  const pageNumber = input.pageIndex + 1;
  const simpleScene = simplifySceneNarrative(input.paragraph);

  return [
    "Create a gentle children's picture-book illustration.",
    `Page ${pageNumber} of ${input.pageCount}.`,
    `Scene summary: ${simpleScene}`,
    `Style: ${input.visualStyle}.`,
    input.characterAnchorBrief,
    "Single clear focal subject, simple background, warm lighting, calm mood.",
    "No violence, no weapons, no politics, no suggestive content, no real public figures.",
    "No readable text in the image.",
  ].join("\n");
}

/**
 * Strict stack pipeline orchestration:
 * - ElevenLabs STT for transcription (record branch) — language tag from response
 * - K2 Think for cleanup + paragraph planning
 * - FLUX.2-pro on Together for picture-book page illustrations
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
  const continuityBrief = buildStoryContinuityBrief({
    title: bookTitle,
    cleanTranscript: cleanTranscript.text,
    paragraphs,
  });
  const characterAnchorBrief = buildCharacterAnchorBrief(paragraphs[0] ?? cleanTranscript.text);

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
    const baseImagePrompt = buildFluxDirectorPrompt({
      pageIndex: index,
      pageCount: paragraphs.length,
      bookTitle,
      paragraph,
      continuityBrief,
      characterAnchorBrief,
      visualStyle: labelFilter("visualStyle", job.filters.visualStyle),
      readingLevel: labelFilter("readingLevel", job.filters.readingLevel),
      tone: labelFilter("tone", job.filters.tone),
    });

    const imagePrompt = buildNoTextPrompt(baseImagePrompt);
    let usedPrompt = imagePrompt;
    let illustration;

    try {
      illustration = await generateIllustrationFromPrompt({
        prompt: imagePrompt,
        aspectRatio: "3:4",
      });
    } catch (error) {
      if (!isModerationError(error)) {
        throw error;
      }

      console.warn("[pipeline][page][moderation-retry]", id, {
        page: index + 1,
        reason: error instanceof Error ? error.message : String(error),
      });

      const fallbackPrompt = buildNoTextPrompt(
        buildSafeFallbackPrompt({
          pageIndex: index,
          pageCount: paragraphs.length,
          paragraph,
          characterAnchorBrief,
          visualStyle: labelFilter("visualStyle", job.filters.visualStyle),
        })
      );

      usedPrompt = fallbackPrompt;
      illustration = await generateIllustrationFromPrompt({
        prompt: fallbackPrompt,
        aspectRatio: "3:4",
      });
    }

    pages.push({
      index,
      paragraph,
      imageDataUrl: `data:${illustration.mimeType};base64,${illustration.imageBase64}`,
      imageMimeType: illustration.mimeType,
      imageProvider: illustration.provider,
      imageModel: illustration.model,
      imagePrompt: usedPrompt,
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
