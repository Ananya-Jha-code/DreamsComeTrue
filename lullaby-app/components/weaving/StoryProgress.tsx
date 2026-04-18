"use client";
import React, { useEffect, useState } from "react";

interface StoryProgressProps {
  completedScenes: number;
  totalScenes:     number;
  isComplete?:     boolean;
}

const STATUS_PHASES = [
  "listening to your voice",
  "finding your characters",
  "weaving the words",
  "shaping the story",
  "finishing the tale",
];

export default function StoryProgress({
  completedScenes,
  totalScenes,
  isComplete = false,
}: StoryProgressProps) {
  const [dotCount, setDotCount] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);

  // Animated ellipsis
  useEffect(() => {
    const id = setInterval(() => setDotCount(d => (d + 1) % 4), 500);
    return () => clearInterval(id);
  }, []);

  // Advance status text with scenes
  useEffect(() => {
    if (isComplete) {
      setPhaseIdx(STATUS_PHASES.length);
      return;
    }
    setPhaseIdx(Math.min(completedScenes, STATUS_PHASES.length - 1));
  }, [completedScenes, isComplete]);

  const statusText = isComplete
    ? "your story is ready"
    : STATUS_PHASES[phaseIdx];
  const dots = isComplete ? "" : "·".repeat(dotCount);

  return (
    <div
      style={{
        position:      "absolute",
        bottom:        "5.5%",
        left:          "50%",
        transform:     "translateX(-50%)",
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           "0.75rem",
        zIndex:        5,
        pointerEvents: "none",
      }}
    >
      {/* Page indicators */}
      {totalScenes > 0 && (
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
          {Array.from({ length: totalScenes }).map((_, i) => {
            const filled = i < completedScenes;
            const justFilled = i === completedScenes - 1;
            return (
              <div
                key={i}
                style={{
                  width:        "26px",
                  height:       "5px",
                  borderRadius: "3px",
                  background:   filled
                    ? "rgba(251,191,36,0.9)"
                    : "rgba(255,255,255,0.12)",
                  transition:   "background 0.5s ease",
                  animation:    justFilled
                    ? "dotFill 1.2s ease-in-out 2"
                    : undefined,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Status text */}
      <div
        style={{
          fontFamily:  "var(--font-cormorant), serif",
          fontSize:    "0.78rem",
          letterSpacing: "0.13em",
          color:       isComplete
            ? "rgba(255,230,150,0.85)"
            : "rgba(255,255,255,0.42)",
          fontStyle:   "italic",
          minHeight:   "1.2em",
          transition:  "color 0.6s ease",
        }}
      >
        {statusText}{dots}
      </div>
    </div>
  );
}
