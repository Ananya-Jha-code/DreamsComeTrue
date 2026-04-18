"use client";

import React, { useEffect, useRef, useState } from "react";
import SkyBackground       from "./weaving/SkyBackground";
import FireflyBurst        from "./weaving/FireflyBurst";
import ConstellationMap    from "./weaving/ConstellationMap";
import WordParticles       from "./weaving/WordParticles";
import CandleSource        from "./weaving/CandleSource";
import StoryProgress       from "./weaving/StoryProgress";

export interface WordEntry  { text: string; timestamp: number; }

export interface WeavingScreenProps {
  words?:           WordEntry[];
  rewriteStarted?:  boolean;
  reformedWords?:   string[];
  characters?:      string[];
  totalScenes?:     number;
  completedScenes?: number;
  onComplete?:      () => void;
}

export default function WeavingScreen({
  words           = [],
  rewriteStarted  = false,
  reformedWords   = [],
  characters      = [],
  totalScenes     = 5,
  completedScenes = 0,
  onComplete,
}: WeavingScreenProps) {
  const [fadingOut,   setFadingOut]   = useState(false);
  const [brightening, setBrightening] = useState(false);
  const [flare,       setFlare]       = useState(false);

  const prevCharsLen  = useRef(characters.length);
  const prevCompleted = useRef(completedScenes);
  const isComplete    = totalScenes > 0 && completedScenes >= totalScenes;

  // ── Candle flare on new character discovery ──────────────────────────────
  useEffect(() => {
    if (characters.length > prevCharsLen.current) {
      setFlare(true);
      const t = setTimeout(() => setFlare(false), 700);
      prevCharsLen.current = characters.length;
      return () => clearTimeout(t);
    }
    prevCharsLen.current = characters.length;
  }, [characters]);

  // ── Assembly complete → brighten → fade → onComplete ────────────────────
  useEffect(() => {
    if (!isComplete) return;
    if (prevCompleted.current >= totalScenes) return;
    prevCompleted.current = completedScenes;

    const t1 = setTimeout(() => setBrightening(true), 1200);
    const t2 = setTimeout(() => setFadingOut(true),   2000);
    const t3 = setTimeout(() => onComplete?.(),        2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  return (
    <div
      style={{
        position:   "relative",
        width:      "100%",
        height:     "100vh",
        overflow:   "hidden",
        opacity:    fadingOut ? 0 : 1,
        transition: fadingOut ? "opacity 0.8s ease" : undefined,
      }}
    >
      {/* z:0 — night sky + all global keyframes */}
      <SkyBackground />

      {/* z:1 — firefly tap handler (covers full screen) */}
      <FireflyBurst />

      {/* z:2 — constellations (SVG + name labels) */}
      <ConstellationMap characters={characters} />

      {/* z:3 — words floating up from candle */}
      <WordParticles
        words={words}
        rewriteStarted={rewriteStarted}
        reformedWords={reformedWords}
      />

      {/* z:4 — candle at bottom-center (~78% from top) */}
      <div
        style={{
          position:      "absolute",
          top:           "78%",
          left:          "50%",
          transform:     "translate(-50%, -50%)",
          zIndex:        4,
          pointerEvents: "none",
        }}
      >
        <CandleSource flare={flare} />
      </div>

      {/* z:5 — page indicators + status text */}
      <StoryProgress
        completedScenes={completedScenes}
        totalScenes={totalScenes}
        isComplete={isComplete}
      />

      {/* Assembly-complete brightening overlay */}
      {brightening && (
        <div
          style={{
            position:      "absolute",
            inset:         0,
            background:    "rgba(255,240,200,0.18)",
            animation:     "screenBrighten 0.8s ease-out forwards",
            pointerEvents: "none",
            zIndex:        10,
          }}
        />
      )}
    </div>
  );
}
