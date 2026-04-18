"use client";

// /test-video — full pipeline test: director_prompt → Veo video + TTS audio

import { useState, useRef } from "react";

const DEFAULT_PROMPT = `Lullaby — director brief.

Story Overview
A small grey rabbit named Pip discovers a glowing river stone that grants one wish. She uses it to bring warmth to a cold winter forest.

Character Design
Pip: small grey rabbit, round fluffy body, soft white belly, large amber eyes, no clothing.

Visual Style
Soft watercolor illustration, children's book aesthetic, painterly washes, warm paper texture, Beatrix Potter style.

Color Palette
Muted blues and greys for the forest, warm amber and gold around Pip and the glowing stone.

Scene Guidance
Scene 1: Pip sits at the edge of a frozen river in a winter forest, snow gently falling. She looks down at a glowing amber stone half-buried in the snow. Wide establishing shot, Pip small in frame, vast white forest behind her.
Scene 2: Close-up on Pip's face, eyes wide with wonder, golden light from the stone reflected on her fur. Tight close-up, soft bokeh background.
Scene 3: The forest fills with warm golden light radiating from the stone. Snow melts, flowers bloom. Pip sits in the center amazed. Slow zoom out as the world transforms around her.

Emotion and Tone
Warm, gentle wonder. A quiet miracle in a cold world.

Pacing
Unhurried. Let each image breathe.`;

const DEFAULT_TRANSCRIPT = "Pip the little grey rabbit sat by the frozen river. She found a glowing stone buried in the snow. She held it close and wished for warmth. Golden light spread through the whole forest. The snow melted and flowers bloomed all around her.";

const VOICE_OPTIONS = [
  { value: "warm_mother",        label: "Warm Mother" },
  { value: "wise_grandfather",   label: "Wise Grandfather" },
  { value: "playful_sister",     label: "Playful Sister" },
  { value: "gentle_father",      label: "Gentle Father" },
  { value: "mysterious_narrator",label: "Mysterious Narrator" },
  { value: "kid_narrator",       label: "Kid Narrator" },
];

function base64ToObjectURL(data: string, mimeType: string): string {
  const bytes = atob(data);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: mimeType }));
}

interface Scene {
  videoUrl:  string;
  audioUrl:  string;
  caption:   string;
  hasVideo:  boolean;
  hasAudio:  boolean;
}

export default function TestVideoPage() {
  const [prompt, setPrompt]         = useState(DEFAULT_PROMPT);
  const [transcript, setTranscript] = useState(DEFAULT_TRANSCRIPT);
  const [voice, setVoice]           = useState("warm_mother");
  const [log, setLog]               = useState<string[]>([]);
  const [running, setRunning]       = useState(false);
  const [scenes, setScenes]         = useState<Scene[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const blobUrls = useRef<string[]>([]);

  const addLog = (msg: string) =>
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const run = async () => {
    blobUrls.current.forEach(u => URL.revokeObjectURL(u));
    blobUrls.current = [];
    setScenes([]);
    setLog([]);
    setError(null);
    setRunning(true);

    addLog(`director_prompt: ${prompt.length} chars`);
    addLog(`transcript: ${transcript.length} chars`);
    addLog(`narrator_voice: ${voice}`);
    addLog("Calling /api/generate-video …");

    try {
      const res = await fetch("/api/generate-video", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          director_prompt:  prompt,
          clean_transcript: transcript,
          filters:          { narrator_voice: voice },
        }),
      });

      addLog(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No stream body");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: Record<string, unknown>;
          try { ev = JSON.parse(line); } catch { continue; }

          if (ev.type === "progress") {
            const badge = ev.status === "done" ? "✅" : "⏳";
            addLog(`${badge} Scene ${ev.scene}/${ev.total}: ${ev.status}`);
          } else if (ev.type === "done") {
            type RawScene = {
              video: { data: string; mimeType: string } | null;
              audio: { data: string; mimeType: string } | null;
              caption: string;
            };
            const raw = (ev.scenes as RawScene[]);
            addLog(`All ${raw.length} scenes received — building blob URLs`);

            const built: Scene[] = raw.map((s, i) => {
              let videoUrl = "", audioUrl = "";

              if (s.video?.data) {
                videoUrl = base64ToObjectURL(s.video.data, s.video.mimeType);
                blobUrls.current.push(videoUrl);
                addLog(`  Scene ${i + 1} video: ${(s.video.data.length / 1024).toFixed(0)} KB ✅`);
              } else {
                addLog(`  Scene ${i + 1} video: none ⚠️`);
              }

              if (s.audio?.data) {
                audioUrl = base64ToObjectURL(s.audio.data, s.audio.mimeType);
                blobUrls.current.push(audioUrl);
                addLog(`  Scene ${i + 1} audio (${voice}): ${(s.audio.data.length / 1024).toFixed(0)} KB ✅`);
              } else {
                addLog(`  Scene ${i + 1} audio: none ⚠️`);
              }

              return {
                videoUrl, audioUrl,
                caption:  s.caption,
                hasVideo: !!s.video?.data,
                hasAudio: !!s.audio?.data,
              };
            });

            setScenes(built);
            addLog(`✅ Done — ${built.filter(s => s.hasVideo).length} video(s), ${built.filter(s => s.hasAudio).length} audio(s)`);
          } else if (ev.type === "error") {
            addLog(`❌ ${ev.message}`);
            setError(ev.message as string);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`❌ ${msg}`);
      setError(msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-mono">
      <div className="max-w-4xl mx-auto space-y-6">

        <div>
          <h1 className="text-lg font-semibold">Lullaby Pipeline Test</h1>
          <p className="text-zinc-500 text-xs mt-1">
            director_prompt + transcript + voice → Veo video + Google TTS audio
          </p>
        </div>

        {/* Reference video */}
        <div className="border border-green-800 rounded p-4 bg-zinc-900">
          <div className="text-xs text-green-400 font-semibold mb-2">
            ✅ Reference video (already generated from Veo — pipeline confirmed working)
          </div>
          <video src="/test_video.mp4" controls autoPlay loop
            className="w-full rounded" style={{ maxHeight: 300 }} />
        </div>

        {/* Inputs */}
        <div className="space-y-4 border border-zinc-700 rounded p-4">
          <div className="text-xs text-zinc-400 font-semibold">LIVE TEST INPUTS</div>

          <div>
            <label className="text-xs text-zinc-500 block mb-1">
              director_prompt from K2 ({prompt.length} chars)
            </label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              rows={10}
              className="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-xs text-zinc-200 resize-y focus:outline-none focus:border-zinc-500" />
          </div>

          <div>
            <label className="text-xs text-zinc-500 block mb-1">
              clean_transcript (narration text for TTS)
            </label>
            <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
              rows={3}
              className="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-xs text-zinc-200 resize-y focus:outline-none focus:border-zinc-500" />
          </div>

          <div>
            <label className="text-xs text-zinc-500 block mb-1">narrator_voice</label>
            <select value={voice} onChange={e => setVoice(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-white focus:outline-none">
              {VOICE_OPTIONS.map(v => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>

          <button onClick={run} disabled={running}
            className="bg-white text-black text-sm font-medium px-6 py-2 rounded disabled:opacity-40 hover:bg-zinc-200 transition-colors">
            {running ? "⏳ Generating (30–90s)…" : "▶ Generate Video + Audio"}
          </button>
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded p-3 max-h-52 overflow-y-auto">
            <div className="text-xs text-zinc-600 mb-1">Live log</div>
            {log.map((line, i) => (
              <div key={i} className={`text-xs ${
                line.includes("❌") ? "text-red-400" :
                line.includes("✅") ? "text-green-400" :
                line.includes("⏳") ? "text-yellow-400" :
                "text-zinc-400"}`}>
                {line}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-950 border border-red-800 rounded p-3 text-xs text-red-300">
            <div className="font-semibold mb-1">Error</div>
            <div>{error}</div>
            {(error.includes("quota") || error.includes("RESOURCE_EXHAUSTED")) && (
              <div className="mt-2 text-red-400">
                ⚠️ Quota exceeded — check{" "}
                <a href="https://ai.dev/rate-limit" target="_blank" className="underline" rel="noreferrer">
                  ai.dev/rate-limit
                </a>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {scenes.length > 0 && (
          <div className="space-y-6">
            <div className="text-xs text-green-400 font-semibold">
              ✅ {scenes.filter(s => s.hasVideo).length}/{scenes.length} videos · {scenes.filter(s => s.hasAudio).length}/{scenes.length} audio tracks
            </div>
            {scenes.map((s, i) => (
              <div key={i} className="border border-zinc-700 rounded p-4 space-y-3">
                <div className="text-xs text-zinc-500 font-semibold">Scene {i + 1}</div>

                {s.hasVideo ? (
                  <video src={s.videoUrl} controls autoPlay
                    className="w-full rounded border border-zinc-800" style={{ maxHeight: 400 }} />
                ) : (
                  <div className="h-24 flex items-center justify-center bg-zinc-900 rounded text-zinc-600 text-xs">
                    No video generated
                  </div>
                )}

                {s.hasAudio && (
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Narration audio ({voice})</div>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio src={s.audioUrl} controls className="w-full" />
                  </div>
                )}

                {s.caption && (
                  <p className="text-zinc-400 text-xs leading-relaxed border-l-2 border-zinc-700 pl-3">
                    {s.caption}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="text-xs text-zinc-700 border-t border-zinc-800 pt-4 space-y-0.5">
          <div>Route: POST /api/generate-video</div>
          <div>Video: veo-3.0-fast-generate-001 (text-to-video, 6s, 16:9)</div>
          <div>Audio: Google TTS REST API (narrator_voice filter)</div>
          <div>Both run in parallel per scene</div>
        </div>
      </div>
    </div>
  );
}
