import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_TOKEN       = process.env.ML_SERVICE_TOKEN || "dev-token";

export async function POST(req: NextRequest) {
  const { audioBase64, mimeType = "audio/webm", filters = {} } = await req.json();

  // 1. Gemini transcription
  const gRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: "Transcribe this audio exactly as spoken. Return only the transcription, nothing else." },
          { inline_data: { mime_type: mimeType, data: audioBase64 } },
        ]}],
      }),
    }
  );
  if (!gRes.ok) return NextResponse.json({ error: `Transcription failed: ${await gRes.text()}` }, { status: 502 });
  const gJson = await gRes.json();
  const transcript: string = gJson?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  // 2. K2 Think cleanup → director_prompt
  const k2Res = await fetch(`${ML_SERVICE_URL}/v1/cleanup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-ml-token": ML_TOKEN },
    body: JSON.stringify({ transcript, filters }),
  });
  if (!k2Res.ok) return NextResponse.json({ error: `K2 cleanup failed: ${await k2Res.text()}` }, { status: 502 });
  const k2 = await k2Res.json();

  return NextResponse.json({
    transcript,
    cleanTranscript: k2.text,
    directorPrompt:  k2.directorPrompt,
  });
}
