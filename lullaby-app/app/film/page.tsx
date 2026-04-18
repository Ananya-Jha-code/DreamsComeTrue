"use client";

// app/film/page.tsx
// Plays Veo video clips with Google TTS narration audio per scene.
// Audio drives scene advancement. Falls back to timer if no audio.
// Pass ?mock=true for built-in demo.

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface MediaBlob { data: string; mimeType: string; }

interface FilmScene {
  caption: string;
  video:   MediaBlob | null;
  audio:   MediaBlob | null;
}

interface Film { scenes: FilmScene[]; }

// ── Mock ─────────────────────────────────────────────────────────────────────

const MOCK_FILM: Film = {
  scenes: [
    { video: null, audio: null, caption: "Once there was a child who found a glowing feather beneath the old oak." },
    { video: null, audio: null, caption: "She carried it through the singing forest, where moonlit streams guided her path." },
    { video: null, audio: null, caption: "And when she returned home, the feather lit up her whole room with warmth." },
  ],
};

// ── Helper ────────────────────────────────────────────────────────────────────

function toObjectURL(blob: MediaBlob): string {
  const bytes = atob(blob.data);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: blob.mimeType }));
}

// ── Player ────────────────────────────────────────────────────────────────────

function FilmPlayer({ film }: { film: Film }) {
  const [index, setIndex]   = useState(0);
  const [visible, setVisible] = useState(true);
  const [ended, setEnded]   = useState(false);

  const videoRef   = useRef<HTMLVideoElement>(null);
  const audioRef   = useRef<HTMLAudioElement>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoBlobRef = useRef<string | null>(null);
  const audioBlobRef = useRef<string | null>(null);

  const scene = film.scenes[index];

  // Estimate duration from caption word count (~130 wpm) for timer fallback
  const estimatedDuration = Math.max(
    6,
    Math.ceil((scene.caption.split(/\s+/).length / 130) * 60)
  );

  // ── advance ────────────────────────────────────────────────────────────────
  const advance = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; }
    setVisible(false);
    setTimeout(() => {
      if (index < film.scenes.length - 1) { setIndex(i => i + 1); setVisible(true); }
      else setEnded(true);
    }, 500);
  }, [index, film.scenes.length]);

  // ── Load media blobs when scene changes ────────────────────────────────────
  useEffect(() => {
    // Revoke previous blobs
    if (videoBlobRef.current) URL.revokeObjectURL(videoBlobRef.current);
    if (audioBlobRef.current) URL.revokeObjectURL(audioBlobRef.current);
    videoBlobRef.current = null;
    audioBlobRef.current = null;

    if (scene.video?.data) {
      videoBlobRef.current = toObjectURL(scene.video);
      if (videoRef.current) {
        videoRef.current.src = videoBlobRef.current;
        videoRef.current.load();
        videoRef.current.play().catch(() => {});
      }
    } else if (videoRef.current) {
      videoRef.current.src = "";
    }

    if (scene.audio?.data) {
      audioBlobRef.current = toObjectURL(scene.audio);
    }

    return () => {
      if (videoBlobRef.current) URL.revokeObjectURL(videoBlobRef.current);
      if (audioBlobRef.current) URL.revokeObjectURL(audioBlobRef.current);
    };
  }, [scene]);

  // ── Play narration audio; audio.onended drives advancement ────────────────
  useEffect(() => {
    if (ended) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (audioBlobRef.current) {
      audio.src = audioBlobRef.current;
      audio.onended = advance;
      audio.play().catch(() => {
        // Autoplay blocked — fall back to timer
        timerRef.current = setTimeout(advance, estimatedDuration * 1000);
      });
    } else {
      // No audio — use estimated duration as fallback
      timerRef.current = setTimeout(advance, estimatedDuration * 1000);
    }

    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      if (audio) { audio.onended = null; audio.pause(); }
    };
  }, [scene, advance, ended, estimatedDuration]);

  if (ended) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/40 text-sm tracking-widest uppercase mb-6">The End</p>
          <button
            onClick={() => { setIndex(0); setEnded(false); setVisible(true); }}
            className="text-white/60 text-xs border border-white/20 rounded-full px-5 py-2 hover:border-white/40 transition-colors"
          >
            Watch again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black select-none" onClick={advance}>

      {/* ── Video or dark fallback ─────────────────────────────────────────── */}
      <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: visible ? 1 : 0 }}>
        {scene.video ? (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay loop muted={false} playsInline
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-black" />
        )}
      </div>

      {/* ── Hidden narration audio ─────────────────────────────────────────── */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} style={{ display: "none" }} />

      {/* ── Gradient for subtitle legibility ──────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />

      {/* ── Subtitle / caption ────────────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 bottom-0 px-8 pb-12 transition-opacity duration-500"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <p className="text-white text-lg leading-relaxed text-center max-w-2xl mx-auto drop-shadow-lg">
          {scene.caption}
        </p>
      </div>

      {/* ── Scene dots ────────────────────────────────────────────────────── */}
      <div className="absolute top-6 inset-x-0 flex justify-center gap-2 pointer-events-none">
        {film.scenes.map((_, i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full transition-all duration-300"
            style={{
              background: i === index ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)",
              transform:  i === index ? "scale(1.4)" : "scale(1)",
            }}
          />
        ))}
      </div>

      <div className="absolute top-6 right-6 text-white/20 text-xs pointer-events-none">
        tap to advance
      </div>
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────

function Loading() {
  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="text-white/30 text-sm">Loading your film…</div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function FilmPageInner() {
  const params = useSearchParams();
  const isMock = params.get("mock") === "true";
  const [film, setFilm]   = useState<Film | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isMock) { setFilm(MOCK_FILM); return; }

    // Check window global first (written by weaving page — has full video+audio)
    const g = typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>).__lullaby_film
      : null;
    if (g) { setFilm(g as Film); return; }

    // Fall back to sessionStorage (video may be stripped if too large)
    const raw = sessionStorage.getItem("lullaby_film");
    if (raw) {
      try { setFilm(JSON.parse(raw)); return; } catch { /* fall through */ }
    }

    setError("No film found. Please go back and generate your story.");
  }, [isMock]);

  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center px-8">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <a href="/" className="text-white/40 text-xs underline">Start over</a>
        </div>
      </div>
    );
  }

  if (!film) return <Loading />;
  return <FilmPlayer film={film} />;
}

export default function FilmPage() {
  return <Suspense><FilmPageInner /></Suspense>;
}
