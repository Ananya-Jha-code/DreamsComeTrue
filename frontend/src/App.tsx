import { useCallback, useEffect, useState } from "react";
import { createJob, fetchHealth, getJob } from "./api/jobs";
import type { JobRecord, StoryFilters } from "./types/job";

const defaultFilters: StoryFilters = {
  visualStyle: "watercolor",
  narratorVoice: "warm_mother",
  readingLevel: "early_reader",
  tone: "cozy",
  pacing: "unhurried",
};

export default function App() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
  }, []);

  const pollJob = useCallback(async (id: string) => {
    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
      const j = await getJob(id);
      setJob(j);
      if (j.stage === "ready" || j.stage === "failed") break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }, []);

  const onUpload = async (file: File) => {
    setError(null);
    setJob(null);
    try {
      const { jobId } = await createJob(file, defaultFilters);
      await pollJob(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-16">
      <div className="text-6xl mb-8 select-none" aria-hidden>
        🌙
      </div>
      <h1 className="text-3xl md:text-4xl text-center text-amber-soft/95 tracking-tight mb-3">
        Tell a story. Watch it become a film.
      </h1>
      <p className="text-center text-amber-glow/70 text-sm max-w-md mb-12">
        Lullaby — HackPrinceton scaffold. Backend runs a stub pipeline; plug in Whisper,
        images, and Gemini next.
      </p>

      <div className="flex flex-wrap gap-3 justify-center mb-10">
        <span
          className={`rounded-full px-4 py-1.5 text-xs font-sans border ${
            apiOk === null
              ? "border-night-700 text-amber-glow/50"
              : apiOk
                ? "border-emerald-700/80 text-emerald-300/90"
                : "border-red-900/80 text-red-300/90"
          }`}
        >
          API {apiOk === null ? "…" : apiOk ? "connected" : "unreachable"}
        </span>
      </div>

      <label className="cursor-pointer rounded-full bg-amber-glow/15 hover:bg-amber-glow/25 border border-amber-glow/40 text-amber-soft px-8 py-3 text-sm font-sans tracking-wide transition-colors">
        Upload test audio
        <input
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = "";
          }}
        />
      </label>
      <p className="mt-3 text-xs text-amber-glow/45 font-sans">
        Sends <code className="text-amber-glow/70">POST /api/jobs</code> with field{" "}
        <code className="text-amber-glow/70">audio</code>
      </p>

      {error && (
        <p className="mt-6 text-red-300/90 text-sm font-sans max-w-md text-center">{error}</p>
      )}

      {job && (
        <div className="mt-10 w-full max-w-lg rounded-2xl border border-night-700 bg-night-800/80 p-6 font-sans text-sm">
          <p className="text-amber-glow/60 text-xs uppercase tracking-wider mb-2">Job</p>
          <p className="text-amber-soft/90 break-all mb-4">{job.id}</p>
          <p className="text-amber-glow/60 text-xs uppercase tracking-wider mb-1">Stage</p>
          <p className="text-xl text-amber-soft mb-4">{job.stage}</p>
          {job.error && <p className="text-red-300/90 text-xs">{job.error}</p>}
          {job.result?.transcript && (
            <p className="text-amber-glow/80 text-xs mt-4 leading-relaxed">{job.result.transcript}</p>
          )}
        </div>
      )}
    </div>
  );
}
