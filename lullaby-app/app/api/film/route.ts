// app/api/film/route.ts
// POST /api/film
//
// Accepts the scene plan from Stage 3 (K2 Think output), runs Stage 4
// (Gemini image generation), and streams progress + final film data back
// to the client as newline-delimited JSON.
//
// Stream event shapes:
//   { type: "progress", scene: number, total: number }
//   { type: "done",     film: <enriched scene plan with base64 images> }
//   { type: "error",    message: string }

import { NextRequest } from "next/server";

// Stage 4 is a CommonJS module — import via require in a server context
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runStage4 } = require("../../../lib/stage4");

export async function POST(req: NextRequest) {
  let scenePlan: unknown;

  try {
    scenePlan = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Stream NDJSON back so the UI can show live progress
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      const send = (obj: object) => {
        controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        const film = await runStage4(
          scenePlan,
          (sceneIndex: number, total: number) => {
            send({ type: "progress", scene: sceneIndex, total });
          }
        );

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
