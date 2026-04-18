"use client";

// app/weaving/page.tsx
//
// Shows the weaving loading screen while Veo generates video clips.
// Reads director_prompt from sessionStorage (written by K2 cleanup step).
// Pass ?mock=true for a self-contained demo with no backend.

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import WeavingScreen, { WordEntry } from "@/components/WeavingScreen";

// ─── Mock data ────────────────────────────────────────────────────────────

const MOCK_WORDS: WordEntry[] = [
  "Once", "upon", "a", "time", "in", "a", "land", "of",
  "whispering", "trees", "and", "silver", "rivers",
  "a", "child", "named", "Elara", "discovered",
  "a", "glowing", "feather", "beneath", "the", "old", "oak",
].map((text, i) => ({ text, timestamp: 500 + i * 280 }));

const MOCK_REFORMED_WORDS = [
  "Once", "upon", "a", "time", "amid", "the", "singing", "forest",
  "and", "moonlit", "streams", "Elara", "found",
  "a", "radiant", "feather", "beneath", "the", "ancient", "oak",
];

const MOCK_TOTAL_SCENES = 3;

function useMockMode(enabled: boolean) {
  const [words, setWords]                     = useState<WordEntry[]>([]);
  const [rewriteStarted, setRewriteStarted]   = useState(false);
  const [reformedWords, setReformedWords]     = useState<string[]>([]);
  const [characters, setCharacters]           = useState<string[]>([]);
  const [totalScenes]                         = useState(MOCK_TOTAL_SCENES);
  const [completedScenes, setCompletedScenes] = useState(0);
  const [done, setDone]                       = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const after = (ms: number, fn: () => void) => {
      const t = setTimeout(fn, ms); timers.current.push(t);
    };
    after(500,   () => setWords(MOCK_WORDS));
    after(4000,  () => setCharacters(["Elara"]));
    after(7000,  () => { setRewriteStarted(true); setReformedWords(MOCK_REFORMED_WORDS); });
    [12000, 22000, 32000].forEach((ms, i) => after(ms, () => setCompletedScenes(i + 1)));
    after(33000, () => setDone(true));
    return () => timers.current.forEach(clearTimeout);
  }, [enabled]);

  return { words, rewriteStarted, reformedWords, characters, totalScenes, completedScenes, done };
}

// ─── Real pipeline: director_prompt → Veo videos ─────────────────────────

function useVideoPipeline(enabled: boolean) {
  const [words, setWords]                     = useState<WordEntry[]>([]);
  const [rewriteStarted, setRewriteStarted]   = useState(false);
  const [reformedWords, setReformedWords]     = useState<string[]>([]);
  const [characters]                          = useState<string[]>([]);
  const [totalScenes, setTotalScenes]         = useState(0);
  const [completedScenes, setCompletedScenes] = useState(0);
  const [done, setDone]                       = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const directorPrompt  = sessionStorage.getItem("lullaby_director_prompt");
    const cleanTranscript = sessionStorage.getItem("lullaby_transcript") ?? "";
    const filtersRaw      = sessionStorage.getItem("lullaby_filters");
    let   filters: Record<string, string> = {};
    try { if (filtersRaw) filters = JSON.parse(filtersRaw); } catch { /* defaults */ }

    if (!directorPrompt) {
      setError("No story found. Please go back and record your story.");
      return;
    }

    // Show transcript words immediately on the loading screen
    const transcriptWords = cleanTranscript.trim().split(/\s+/).filter(Boolean).slice(0, 30);
    setWords(transcriptWords.map((text, i) => ({ text, timestamp: 300 + i * 220 })));

    // Show reformed words from the director prompt intro
    const directorSnippet = directorPrompt.replace(/\n+/g, " ").trim().split(/\s+/).slice(0, 20);
    setTimeout(() => {
      setRewriteStarted(true);
      setReformedWords(directorSnippet);
    }, 3000);

    let aborted = false;

    (async () => {
      try {
        const res = await fetch("/api/generate-video", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            director_prompt:  directorPrompt,
            clean_transcript: cleanTranscript,
            filters,
          }),
        });

        if (!res.body) throw new Error("No response stream");

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let   buffer  = "";

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone || aborted) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let ev: Record<string, unknown>;
            try { ev = JSON.parse(line); } catch { continue; }

            if (ev.type === "progress") {
              const total = (ev.total as number) ?? 0;
              if (totalScenes === 0) setTotalScenes(total);
              if (ev.status === "done") setCompletedScenes(n => n + 1);
            } else if (ev.type === "done") {
              const scenes = ev.scenes as Array<{
                video: { data: string; mimeType: string } | null;
                caption: string;
              }>;

              const film = { scenes };

              // Store film — try sessionStorage, fall back to window global
              try {
                sessionStorage.setItem("lullaby_film", JSON.stringify(film));
              } catch {
                // Videos too large for sessionStorage — use in-memory global
                (window as unknown as Record<string, unknown>).__lullaby_film = film;
              }
              // Always keep full in-memory too (film page checks this first)
              if (typeof window !== "undefined") {
                (window as unknown as Record<string, unknown>).__lullaby_film = film;
              }

              setDone(true);
            } else if (ev.type === "error") {
              setError((ev.message as string) ?? "Video generation failed");
            }
          }
        }
      } catch (err) {
        if (!aborted) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => { aborted = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { words, rewriteStarted, reformedWords, characters, totalScenes, completedScenes, done, error };
}

// ─── Page ─────────────────────────────────────────────────────────────────

function WeavingPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const isMock = params.get("mock") === "true";

  const mock = useMockMode(isMock);
  const real = useVideoPipeline(!isMock);

  const state = isMock ? mock : real;

  const handleComplete = useCallback(() => {
    if (!isMock) router.push("/film");
  }, [isMock, router]);

  // Navigate as soon as videos are ready
  useEffect(() => {
    if (!isMock && real.done) router.push("/film");
  }, [isMock, real.done, router]);

  if (!isMock && real.error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center px-8">
        <div className="text-center max-w-sm">
          <p className="text-red-400 text-sm mb-4">{real.error}</p>
          <a href="/" className="text-white/40 text-xs underline">Start over</a>
        </div>
      </div>
    );
  }

  return (
    <>
      {isMock && (
        <div className="fixed top-3 right-3 z-50 bg-yellow-400/90 text-black text-xs font-mono px-2 py-1 rounded pointer-events-none">
          MOCK MODE
        </div>
      )}
      <WeavingScreen
        words={state.words}
        rewriteStarted={state.rewriteStarted}
        reformedWords={state.reformedWords}
        characters={state.characters}
        totalScenes={state.totalScenes || MOCK_TOTAL_SCENES}
        completedScenes={state.completedScenes}
        onComplete={handleComplete}
      />
    </>
  );
}

export default function WeavingPage() {
  return (
    <Suspense>
      <WeavingPageInner />
    </Suspense>
  );
}
