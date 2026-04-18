// app/api/generate-video/route.ts
// POST /api/generate-video
//
// director_prompt (from K2 cleanup) → scene extraction → parallel per scene:
//   Veo text-to-video  +  Google TTS narration
//
// Input:  { director_prompt, clean_transcript?, filters? }
// Stream: NDJSON
//   { type: "progress", scene: N, total: N, status: "generating"|"done" }
//   { type: "done", scenes: [{ video, audio, caption }] }
//   { type: "error", message }

import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateSceneTTS } = require("../../../lib/stage5_tts");

const GEMINI_API_KEY  = process.env.GEMINI_API_KEY || "";
const VEO_URL         = "https://generativelanguage.googleapis.com/v1beta/models/veo-3.0-fast-generate-001:predictLongRunning";
const OPERATIONS_BASE = "https://generativelanguage.googleapis.com/v1beta";

const POLL_MS   = 5000;
const MAX_POLLS = 72; // 6 min max

// ── Scene extraction from K2 director_prompt ─────────────────────────────────
// K2 always includes a "Scene Guidance" section with numbered scenes.

function extractScenes(directorPrompt: string): string[] {
  // Match the Scene Guidance block
  const guidanceMatch = directorPrompt.match(
    /Scene Guidance[\s\S]*?(?=\n(?:Emotion|Pacing|Visual Consistency|Video Model|$))/i
  );
  if (guidanceMatch) {
    const block      = guidanceMatch[0];
    const sceneBlocks = block.split(/\n(?=Scene \d)/i).slice(1);
    if (sceneBlocks.length >= 2) {
      return sceneBlocks.slice(0, 5).map(s =>
        s.replace(/^Scene \d+:?\s*/i, "").trim().slice(0, 500)
      );
    }
  }
  // Fallback: three equal chunks
  const text  = directorPrompt.trim();
  const chunk = Math.floor(text.length / 3);
  return [text.slice(0, chunk), text.slice(chunk, chunk * 2), text.slice(chunk * 2)]
    .map(s => s.trim()).filter(Boolean);
}

// Build a tight Veo prompt: visual style + character + the scene beat
function buildVeoPrompt(sceneText: string, styleCtx: string): string {
  return `${styleCtx}\n\n${sceneText}`.replace(/\s+/g, " ").trim().slice(0, 800);
}

function extractStyleContext(directorPrompt: string): string {
  const vs = directorPrompt.match(/Visual Style[\s\S]{0,350}/i)?.[0] ?? "";
  const cd = directorPrompt.match(/Character Design[\s\S]{0,250}/i)?.[0] ?? "";
  return `${vs} ${cd}`.replace(/\s+/g, " ").trim().slice(0, 400);
}

// Split clean_transcript into N segments (one per scene)
function splitTranscript(transcript: string, n: number): string[] {
  const words        = transcript.trim().split(/\s+/).filter(Boolean);
  const wordsPerScene = Math.ceil(words.length / n);
  return Array.from({ length: n }, (_, i) =>
    words.slice(i * wordsPerScene, (i + 1) * wordsPerScene).join(" ")
  );
}

// ── Veo text-to-video ────────────────────────────────────────────────────────

async function generateVideoClip(prompt: string): Promise<{ data: string; mimeType: string }> {
  const submitRes = await fetch(VEO_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      instances:  [{ prompt }],
      parameters: { aspectRatio: "16:9", durationSeconds: 6 },
    }),
  });
  if (!submitRes.ok) {
    const txt = await submitRes.text();
    throw new Error(`Veo submit ${submitRes.status}: ${txt.slice(0, 300)}`);
  }

  const { name: opName } = (await submitRes.json()) as { name?: string };
  if (!opName) throw new Error("Veo returned no operation name");

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_MS));

    const pollRes = await fetch(
      `${OPERATIONS_BASE}/${opName}?key=${GEMINI_API_KEY}`,
      { headers: { "x-goog-api-key": GEMINI_API_KEY } }
    );
    if (!pollRes.ok) throw new Error(`Veo poll ${pollRes.status}`);

    const op = (await pollRes.json()) as {
      done?: boolean; error?: unknown;
      response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[] } };
    };

    if (!op.done) continue;
    if (op.error)  throw new Error(`Veo failed: ${JSON.stringify(op.error)}`);

    const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) throw new Error("Veo done but no video URI");

    const dlUri = uri.includes("?") ? `${uri}&key=${GEMINI_API_KEY}` : `${uri}?key=${GEMINI_API_KEY}`;
    const dlRes = await fetch(dlUri, { redirect: "follow" });
    if (!dlRes.ok) throw new Error(`Video download ${dlRes.status}`);

    return { mimeType: "video/mp4", data: Buffer.from(await dlRes.arrayBuffer()).toString("base64") };
  }
  throw new Error("Veo timed out");
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    director_prompt?:  string;
    clean_transcript?: string;
    filters?:          Record<string, string>;
  };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { director_prompt, clean_transcript = "", filters = {} } = body;
  if (!director_prompt)
    return Response.json({ error: "director_prompt required" }, { status: 400 });

  const narratorVoice = filters.narrator_voice ?? "warm_mother";
  const sceneTexts    = extractScenes(director_prompt);
  const styleCtx      = extractStyleContext(director_prompt);
  const total         = sceneTexts.length;
  const narrations    = splitTranscript(clean_transcript, total);

  const stream = new ReadableStream({
    async start(controller) {
      const enc  = new TextEncoder();
      const send = (obj: object) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      try {
        const results = await Promise.all(
          sceneTexts.map(async (sceneText, i) => {
            send({ type: "progress", scene: i + 1, total, status: "generating" });

            const narrationText = narrations[i] ?? "";
            const veoPrompt     = buildVeoPrompt(sceneText, styleCtx);

            // Video + TTS run in parallel for each scene
            const [videoResult, audioResult] = await Promise.allSettled([
              generateVideoClip(veoPrompt),
              narrationText
                ? generateSceneTTS(narrationText, narratorVoice)
                : Promise.resolve(null),
            ]);

            if (videoResult.status === "rejected")
              console.error(`[scene ${i + 1}] video failed:`, videoResult.reason);
            if (audioResult.status === "rejected")
              console.error(`[scene ${i + 1}] TTS failed:`, audioResult.reason);

            send({ type: "progress", scene: i + 1, total, status: "done" });

            return {
              caption: narrationText,
              video: videoResult.status === "fulfilled" ? videoResult.value : null,
              audio: audioResult.status === "fulfilled" ? audioResult.value : null,
            };
          })
        );

        send({ type: "done", scenes: results });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
