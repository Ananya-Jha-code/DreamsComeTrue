"use client";
import React, { useEffect, useState } from "react";

interface ConstellationMapProps {
  characters: string[];
}

// Four quadrant centers (% of viewport)
const QUADRANTS = [
  { x: 20, y: 22 },  // top-left
  { x: 78, y: 22 },  // top-right
  { x: 18, y: 62 },  // bottom-left
  { x: 80, y: 62 },  // bottom-right
] as const;

// Node offsets per pattern — kept small so aspect-ratio stretch is tolerable
// Each pattern has 6 nodes; lines connect consecutive pairs
type Point = [number, number];
const PATTERNS: Point[][] = [
  [[-3,-6],[0,-9],[3,-6],[2,-1],[-2,-1],[0,4]],
  [[-5,-3],[0,-9],[5,-3],[0,0],[-3,5],[3,5]],
  [[0,-7],[5,-2],[4,5],[-4,5],[-5,-2],[0,3]],
  [[-7,-2],[-3,-7],[0,-8],[3,-7],[7,-2],[0,2]],
];

export default function ConstellationMap({ characters }: ConstellationMapProps) {
  const [shown, setShown] = useState<boolean[]>([false, false, false, false]);

  useEffect(() => {
    characters.forEach((_, i) => {
      if (i < 4) {
        setShown(prev => {
          if (prev[i]) return prev;
          const next = [...prev] as boolean[];
          next[i] = true;
          return next;
        });
      }
    });
  }, [characters]);

  return (
    <>
      {/* SVG layer — lines + dot nodes */}
      <svg
        style={{
          position:        "absolute",
          inset:           0,
          width:           "100%",
          height:          "100%",
          zIndex:          2,
          pointerEvents:   "none",
          overflow:        "visible",
        }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {QUADRANTS.map((q, qi) => {
          if (!shown[qi]) return null;
          const pts = PATTERNS[qi % PATTERNS.length];

          return (
            <g key={qi}>
              {/* Lines between consecutive nodes */}
              {pts.slice(0, -1).map((a, li) => {
                const b   = pts[li + 1];
                const x1  = q.x + a[0];
                const y1  = q.y + a[1];
                const x2  = q.x + b[0];
                const y2  = q.y + b[1];
                const len = Math.hypot(x2 - x1, y2 - y1) + 0.01;
                return (
                  <line
                    key={li}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="rgba(251,191,36,0.55)"
                    strokeWidth="0.22"
                    strokeLinecap="round"
                    strokeDasharray={len}
                    strokeDashoffset={len}
                    style={{
                      animation: `constDraw 0.7s ease-out ${li * 110}ms forwards`,
                    }}
                  />
                );
              })}

              {/* Node dots */}
              {pts.map((pt, pi) => (
                <circle
                  key={pi}
                  cx={q.x + pt[0]}
                  cy={q.y + pt[1]}
                  r="0.55"
                  fill="rgba(251,191,36,0.88)"
                  style={{
                    opacity:   0,
                    animation: `constFadeIn 0.3s ease-out ${pi * 70}ms forwards`,
                  }}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {/* HTML labels — avoid SVG text aspect-ratio distortion */}
      {QUADRANTS.map((q, qi) => {
        if (!shown[qi] || !characters[qi]) return null;
        return (
          <div
            key={`label-${qi}`}
            style={{
              position:    "absolute",
              left:        `${q.x}%`,
              top:         `calc(${q.y}% + 9%)`,
              transform:   "translateX(-50%)",
              fontFamily:  "var(--font-caveat), cursive",
              fontSize:    "0.78rem",
              color:       "rgba(255,230,150,0.72)",
              pointerEvents: "none",
              zIndex:      2,
              whiteSpace:  "nowrap",
              opacity:     0,
              animation:   "constFadeIn 0.9s ease-out 700ms forwards",
            }}
          >
            {characters[qi]}
          </div>
        );
      })}
    </>
  );
}
