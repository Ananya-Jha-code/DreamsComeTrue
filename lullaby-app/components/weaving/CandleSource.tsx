"use client";
import React, { useEffect, useState } from "react";

interface CandleSourceProps {
  flare?: boolean;
}

export default function CandleSource({ flare = false }: CandleSourceProps) {
  const [showFlare, setShowFlare] = useState(false);

  useEffect(() => {
    if (!flare) return;
    setShowFlare(true);
    const t = setTimeout(() => setShowFlare(false), 700);
    return () => clearTimeout(t);
  }, [flare]);

  return (
    <div
      style={{
        position:       "relative",
        width:          "32px",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        pointerEvents:  "none",
      }}
    >
      {/* Ambient warm glow */}
      <div
        style={{
          position:     "absolute",
          top:          "-28px",
          left:         "50%",
          width:        "72px",
          height:       "72px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(251,191,36,0.32) 0%, transparent 70%)",
          animation:    "flameGlow 2.2s ease-in-out infinite",
          transform:    "translateX(-50%)",
        }}
      />

      {/* Character-discovery flare burst */}
      {showFlare && (
        <div
          style={{
            position:     "absolute",
            top:          "-14px",
            left:         "50%",
            width:        "64px",
            height:       "64px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(251,191,36,0.9) 0%, transparent 70%)",
            animation:    "flareOut 0.7s ease-out forwards",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Outer flame */}
      <div
        style={{
          position:     "relative",
          width:        "18px",
          height:       "28px",
          borderRadius: "50% 50% 35% 35% / 60% 60% 40% 40%",
          background:
            "radial-gradient(ellipse at 50% 70%, rgba(251,191,36,0.92) 0%, rgba(245,124,0,0.82) 50%, transparent 100%)",
          animation:    "flameFlicker 1.3s ease-in-out infinite",
          zIndex:       2,
        }}
      >
        {/* Inner core */}
        <div
          style={{
            position:     "absolute",
            bottom:       "4px",
            left:         "50%",
            transform:    "translateX(-50%)",
            width:        "8px",
            height:       "16px",
            borderRadius: "50% 50% 30% 30% / 50% 50% 50% 50%",
            background:
              "radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.95) 0%, rgba(255,230,100,0.8) 50%, transparent 100%)",
            animation:    "flameFlicker 0.9s ease-in-out 0.1s infinite",
          }}
        />
      </div>

      {/* Wick */}
      <div
        style={{
          width:      "2px",
          height:     "6px",
          background: "linear-gradient(to bottom, #555, #333)",
          zIndex:     1,
        }}
      />

      {/* Wax body */}
      <div
        style={{
          width:      "20px",
          height:     "34px",
          borderRadius: "2px 2px 4px 4px",
          background:
            "linear-gradient(135deg, #e8d5b0 0%, #f5e6c8 40%, #ede0c4 100%)",
          boxShadow:
            "inset -2px 0 4px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.3)",
        }}
      />

      {/* Base plate */}
      <div
        style={{
          width:        "28px",
          height:       "4px",
          borderRadius: "2px",
          background:
            "linear-gradient(to right, #b7791f, #f59e0b, #d97706)",
          boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
}
