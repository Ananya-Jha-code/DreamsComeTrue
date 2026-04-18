"use client";
import React, { useEffect, useRef, useState } from "react";
import { WordEntry } from "../WeavingScreen";

interface WordParticlesProps {
  words:          WordEntry[];
  rewriteStarted: boolean;
  reformedWords:  string[];
}

interface Particle {
  id:      string;
  text:    string;
  leftPct: number;   // % offset from center (negative = left)
  animKey: number;   // changing this re-triggers animation
  dur:     number;   // animation duration ms
}

let seed = 0;

function makeLeftPct(i: number, salt: number): number {
  return ((i * 37 + salt * 11) % 60) - 30;
}

export default function WordParticles({
  words,
  rewriteStarted,
  reformedWords,
}: WordParticlesProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const transcriptStartedRef = useRef(false);
  const rewriteStartedRef    = useRef(false);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // ── Transcript word reveal ────────────────────────────────────────────────
  useEffect(() => {
    if (!words.length || transcriptStartedRef.current) return;
    transcriptStartedRef.current = true;

    words.forEach((word, i) => {
      const t = setTimeout(() => {
        setParticles(prev => {
          const p: Particle = {
            id:      `t-${i}`,
            text:    word.text,
            leftPct: makeLeftPct(i, 1),
            animKey: ++seed,
            dur:     5800 + (i % 4) * 700,
          };
          return [...prev.filter(x => x.id !== p.id), p].slice(-20);
        });
      }, word.timestamp);
      timersRef.current.push(t);
    });

    return clearTimers;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  // ── Rewrite → swap to reformed words ────────────────────────────────────
  useEffect(() => {
    if (!rewriteStarted || rewriteStartedRef.current || !reformedWords.length)
      return;
    rewriteStartedRef.current = true;

    clearTimers();

    // Small pause so the user sees the "shimmer" gap
    const t0 = setTimeout(() => setParticles([]), 300);
    timersRef.current.push(t0);

    reformedWords.slice(0, 20).forEach((text, i) => {
      const t = setTimeout(() => {
        setParticles(prev => {
          const p: Particle = {
            id:      `r-${i}`,
            text,
            leftPct: makeLeftPct(i, 7),
            animKey: ++seed,
            dur:     6500 + (i % 4) * 600,
          };
          return [...prev, p].slice(-20);
        });
      }, 500 + i * 80);
      timersRef.current.push(t);
    });

    return clearTimers;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewriteStarted, reformedWords]);

  return (
    <div
      style={{
        position:       "absolute",
        inset:          0,
        pointerEvents:  "none",
        zIndex:         3,
      }}
    >
      {particles.map(p => (
        <div
          key={`${p.id}-${p.animKey}`}
          style={{
            position:    "absolute",
            top:         "78%",
            left:        `calc(50% + ${p.leftPct * 0.55}%)`,
            fontFamily:  "var(--font-cormorant), serif",
            fontSize:    "0.95rem",
            fontStyle:   "italic",
            color:       p.id.startsWith("r-")
              ? "rgba(251,231,180,0.92)"
              : "rgba(255,255,255,0.78)",
            textShadow:  "0 0 10px rgba(251,191,36,0.5)",
            willChange:  "transform, opacity",
            animation:   `wordFloat ${p.dur}ms ease-out forwards`,
            whiteSpace:  "nowrap",
          }}
        >
          {p.text}
        </div>
      ))}
    </div>
  );
}
