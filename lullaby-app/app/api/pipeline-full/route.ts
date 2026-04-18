// app/api/pipeline-full/route.ts
// POST /api/pipeline-full
//
// Unified pipeline: scene plan → images → (video + TTS) → enriched film
//
// Input body:
//   { scene_plan: <stage3 JSON output>, filters: { narrator_voice, ... } }
//
// NDJSON stream events:
//   { type: "stage",          name: "images" }
//   { type: "scene_progress", scene: N, total: N, step: "image"|"video"|"tts" }
//   { type: "scene_complete", scene: N, total: N }
//   { type: "done",           film: { ...scenePlan, scenes: [enriched] } }
//   { type: "error",          message: string }

import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateSceneImage } = require("../../../lib/stage4");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateSceneTTS }   = require("../../../lib/stage5_tts");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateSceneVideo } = require("../../../lib/stage6_video");

export async function POST(req: NextRequest) {
  let body: { scene_plan: Record<string, unknown>; filters: Record<string, string> };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scene_plan, filters } = body;

  if (!scene_plan || !Array.isArray((scene_plan as { scenes?: unknown }).scenes)) {
    return Response.json({ error: "scene_plan with scenes[] required" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      function send(obj: object) {
        controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      }

      try {
        const scenes = (scene_plan as { scenes: Record<string, unknown>[] }).scenes;
        const total  = scenes.length;

        send({ type: "stage", name: "images" });

        // ── All scenes in parallel ─────────────────────────────────────
        const enrichedScenes = await Promise.all(
          scenes.map(async (scene) => {
            const idx = (scene.index as number) ?? 0;

            // ── Step A: generate still image ──────────────────────────
            send({ type: "scene_progress", scene: idx, total, step: "image" });

            let image: { mimeType: string; data: string };
            try {
              image = await generateSceneImage(scene);
            } catch (err) {
              console.error(`Image gen failed scene ${idx}:`, err);
              image = { mimeType: "image/png", data: "" }; // fallback: blank
            }

            // ── Step B: video + TTS in parallel ───────────────────────
            send({ type: "scene_progress", scene: idx, total, step: "video" });
            send({ type: "scene_progress", scene: idx, total, step: "tts" });

            const [videoResult, audioResult] = await Promise.allSettled([
              image.data
                ? generateSceneVideo(
                    image.data,
                    image.mimeType,
                    (scene.image_prompt as Record<string, string>)?.scene_description ?? "",
                    (scene.image_prompt as Record<string, string>)?.mood ?? ""
                  )
                : Promise.reject(new Error("no image to animate")),
              generateSceneTTS(
                (scene.narration_segment as string) ?? "",
                filters?.narrator_voice ?? "warm_mother"
              ),
            ]);

            const video = videoResult.status === "fulfilled" ? videoResult.value : undefined;
            const audio = audioResult.status === "fulfilled" ? audioResult.value : undefined;

            if (videoResult.status === "rejected") {
              console.error(`Video gen failed scene ${idx}:`, videoResult.reason);
            }
            if (audioResult.status === "rejected") {
              console.error(`TTS failed scene ${idx}:`, audioResult.reason);
            }

            send({ type: "scene_complete", scene: idx, total });

            return { ...scene, image, ...(video ? { video } : {}), ...(audio ? { audio } : {}) };
          })
        );

        const film = { ...scene_plan, scenes: enrichedScenes };
        send({ type: "done", film });
      } catch (err) {
        send({
          type:    "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
