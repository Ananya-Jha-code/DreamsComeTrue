"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface Firefly {
  id:  number;
  x:   number;
  y:   number;
  dx:  number;
  dy:  number;
}

let ffId = 0;

export default function FireflyBurst() {
  const [fireflies, setFireflies] = useState<Firefly[]>([]);
  const [showHint,  setShowHint]  = useState(true);
  const hintRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    hintRef.current = setTimeout(() => setShowHint(false), 6000);
    return () => { if (hintRef.current) clearTimeout(hintRef.current); };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setShowHint(false);
    if (hintRef.current) clearTimeout(hintRef.current);

    const count = 3 + Math.floor(Math.random() * 3); // 3–5
    const batch: Firefly[] = Array.from({ length: count }, () => ({
      id:  ffId++,
      x:   e.clientX,
      y:   e.clientY,
      dx:  (Math.random() - 0.5) * 90,
      dy:  -55 - Math.random() * 65,
    }));

    setFireflies(prev => [...prev, ...batch].slice(-15));

    // Remove batch after animation completes
    setTimeout(() => {
      const ids = new Set(batch.map(f => f.id));
      setFireflies(prev => prev.filter(f => !ids.has(f.id)));
    }, 1100);
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset:    0,
        zIndex:   1,
        cursor:   "crosshair",
      }}
      onClick={handleClick}
    >
      {/* Hint */}
      {showHint && (
        <div
          style={{
            position:      "absolute",
            bottom:        "17%",
            left:          "50%",
            transform:     "translateX(-50%)",
            fontFamily:    "var(--font-caveat), cursive",
            fontSize:      "0.75rem",
            color:         "rgba(255,255,255,0.28)",
            pointerEvents: "none",
            animation:     "hintFade 6s ease-out forwards",
            whiteSpace:    "nowrap",
            userSelect:    "none",
          }}
        >
          tap the sky ✦
        </div>
      )}

      {/* Firefly particles */}
      {fireflies.map(f => (
        <div
          key={f.id}
          style={{
            position:      "fixed",
            left:          f.x,
            top:           f.y,
            width:         "5px",
            height:        "5px",
            borderRadius:  "50%",
            background:    "rgba(251,191,36,0.95)",
            boxShadow:     "0 0 6px rgba(251,191,36,0.8), 0 0 12px rgba(251,191,36,0.4)",
            pointerEvents: "none",
            willChange:    "transform, opacity",
            // CSS custom properties for animation
            ...({ "--fdx": `${f.dx}px`, "--fdy": `${f.dy}px` } as React.CSSProperties),
            animation:     "fireflyRise 1s ease-out forwards",
          }}
        />
      ))}
    </div>
  );
}
