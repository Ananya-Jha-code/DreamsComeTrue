"use client";
import React from "react";

// Deterministic star positions — index-based, no layout shift
const STARS = Array.from({ length: 30 }, (_, i) => ({
  left:     ((i * 37 + 11) % 97) + 1.5,
  top:      ((i * 53 + 7)  % 85) + 2,
  delay:    (i * 0.31) % 4,
  duration: 2.5 + (i * 0.17) % 2,
  size:     i % 5 === 0 ? 2.5 : i % 3 === 0 ? 2 : 1.5,
}));

// One global <style> with ALL shared keyframes — no per-component injection
const GLOBAL_KEYFRAMES = `
  @keyframes twinkle {
    0%, 100% { opacity: 0.2; transform: scale(1); }
    50%       { opacity: 1;   transform: scale(1.4); }
  }
  @keyframes wordFloat {
    0%   { opacity: 0;    transform: translate(-50%, 0vh); }
    8%   { opacity: 1;    transform: translate(-50%, -3vh); }
    88%  { opacity: 0.85; transform: translate(-50%, -48vh); }
    100% { opacity: 0;    transform: translate(-50%, -56vh); }
  }
  @keyframes wordFadeOut {
    0%   { opacity: 1; filter: blur(0px);  transform: translate(-50%, var(--word-y, -10vh)); }
    60%  { opacity: 0; filter: blur(6px);  transform: translate(-50%, var(--word-y, -10vh)) scale(0.9); }
    100% { opacity: 0; }
  }
  @keyframes constDraw {
    from { stroke-dashoffset: var(--dashlen, 100); }
    to   { stroke-dashoffset: 0; }
  }
  @keyframes constFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes dotFill {
    0%   { box-shadow: 0 0 4px rgba(251,191,36,0.3); }
    50%  { box-shadow: 0 0 14px rgba(251,191,36,0.95), 0 0 28px rgba(251,191,36,0.5); }
    100% { box-shadow: 0 0 6px rgba(251,191,36,0.5); }
  }
  @keyframes fireflyRise {
    0%   { transform: translate(0, 0) scale(1);   opacity: 1; }
    100% { transform: translate(var(--fdx, 0px), var(--fdy, -80px)) scale(0); opacity: 0; }
  }
  @keyframes flameFlicker {
    0%,100% { transform: scaleX(1)    scaleY(1)    rotate(0deg); }
    25%     { transform: scaleX(1.05) scaleY(0.97) rotate(1deg); }
    50%     { transform: scaleX(0.95) scaleY(1.04) rotate(-1deg); }
    75%     { transform: scaleX(1.03) scaleY(0.98) rotate(0.5deg); }
  }
  @keyframes flameGlow {
    0%,100% { opacity: 0.55; transform: scale(1); }
    50%     { opacity: 1;    transform: scale(1.18); }
  }
  @keyframes flareOut {
    0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.9; }
    100% { transform: translate(-50%,-50%) scale(3.5); opacity: 0; }
  }
  @keyframes hintFade {
    0%, 60% { opacity: 0.35; }
    100%    { opacity: 0; }
  }
  @keyframes screenBrighten {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

export default function SkyBackground() {
  return (
    <>
      <style>{GLOBAL_KEYFRAMES}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 25%, #0e0b30 0%, #070318 55%, #030110 100%)",
          zIndex: 0,
        }}
      >
        {STARS.map((s, i) => (
          <div
            key={i}
            style={{
              position:     "absolute",
              left:         `${s.left}%`,
              top:          `${s.top}%`,
              width:        `${s.size}px`,
              height:       `${s.size}px`,
              borderRadius: "50%",
              background:   "#fff",
              animation:    `twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
            }}
          />
        ))}
      </div>
    </>
  );
}
