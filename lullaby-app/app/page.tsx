"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_FILTERS = {
  visualStyle: "watercolor",
  narratorVoice: "warm_mother",
  readingLevel: "early_reader",
  tone: "cozy",
  pacing: "unhurried",
};

export default function Home() {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = (reader.result as string).split(",")[1];
        setStatus("Transcribing…");
        try {
          const res = await fetch("/api/process-recording", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: b64, mimeType: "audio/webm", filters: DEFAULT_FILTERS }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          sessionStorage.setItem("lullaby_transcript", data.cleanTranscript ?? data.transcript);
          sessionStorage.setItem("lullaby_director_prompt", data.directorPrompt);
          sessionStorage.setItem("lullaby_filters", JSON.stringify(DEFAULT_FILTERS));
          router.push("/weaving");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Something went wrong");
          setStatus(null);
        }
      };
      reader.readAsDataURL(blob);
    };
    rec.start(250);
    mediaRef.current = rec;
    setRecording(true);
  }, [router]);

  const stop = useCallback(() => {
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
    setStatus("Processing…");
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-7xl mb-8 select-none">🌙</div>
      <h1 className="text-3xl md:text-4xl text-center tracking-tight mb-3">
        Tell a story. Watch it become a film.
      </h1>
      <p className="text-center text-sm max-w-md mb-12 opacity-60">
        Tap to record your story. Lullaby will weave it into a film.
      </p>

      {status ? (
        <p className="text-sm opacity-70">{status}</p>
      ) : recording ? (
        <button onClick={stop}
          className="w-20 h-20 rounded-full bg-red-600/80 hover:bg-red-500 border-4 border-red-300/40 flex items-center justify-center transition-colors">
          <span className="w-7 h-7 rounded-sm bg-white" />
        </button>
      ) : (
        <button onClick={start}
          className="w-20 h-20 rounded-full bg-white/10 hover:bg-white/20 border border-white/30 flex items-center justify-center transition-colors">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="11" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="9" y1="22" x2="15" y2="22" />
          </svg>
        </button>
      )}

      {error && <p className="mt-6 text-red-400 text-sm text-center max-w-sm">{error}</p>}
    </div>
  );
}
