import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FILTER_CONFIG, defaultFilters, getFilterLabel } from "../filters";
import type { StoryFilters } from "../types/job";

const AXIS_META: Record<string, { emoji: string; color: string; glow: string; bg: string; border: string; desc: string }> = {
  visualStyle:   { emoji:"🎨", color:"#f472b6", glow:"rgba(244,114,182,.25)", bg:"rgba(244,114,182,.06)", border:"rgba(244,114,182,.25)", desc:"How your storybook will look" },
  narratorVoice: { emoji:"🎙️", color:"#60a5fa", glow:"rgba(96,165,250,.25)",  bg:"rgba(96,165,250,.06)",  border:"rgba(96,165,250,.25)",  desc:"Who tells your story" },
  readingLevel:  { emoji:"📖", color:"#34d399", glow:"rgba(52,211,153,.25)",  bg:"rgba(52,211,153,.06)",  border:"rgba(52,211,153,.25)",  desc:"Vocabulary & complexity" },
  tone:          { emoji:"🌙", color:"#a78bfa", glow:"rgba(167,139,250,.25)", bg:"rgba(167,139,250,.06)", border:"rgba(167,139,250,.25)", desc:"Emotional feel of the pages" },
  pacing:        { emoji:"⏱️", color:"#fb923c", glow:"rgba(251,146,60,.25)",  bg:"rgba(251,146,60,.06)",  border:"rgba(251,146,60,.25)",  desc:"Rhythm of narration & shots" },
};

// ─── VISUAL STYLE thumbnails ───────────────────────────────────────────────
const VISUAL_THUMBS: Record<string, React.FC> = {
  watercolor: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs>
        <filter id="wc-b1"><feGaussianBlur stdDeviation="8"/></filter>
        <filter id="wc-b2"><feGaussianBlur stdDeviation="12"/></filter>
      </defs>
      <rect width="200" height="110" fill="#d8e8f5"/>
      <ellipse cx="55" cy="48" rx="55" ry="44" fill="#b8d4f5" opacity="0.7" filter="url(#wc-b2)"/>
      <ellipse cx="140" cy="60" rx="65" ry="48" fill="#e8b4d8" opacity="0.6" filter="url(#wc-b2)"/>
      <ellipse cx="165" cy="25" rx="40" ry="35" fill="#a8d8c8" opacity="0.65" filter="url(#wc-b1)"/>
      <ellipse cx="30" cy="90" rx="45" ry="30" fill="#f5d0a0" opacity="0.55" filter="url(#wc-b1)"/>
      <ellipse cx="100" cy="35" rx="35" ry="28" fill="#d8b0f0" opacity="0.45" filter="url(#wc-b1)"/>
      <circle cx="158" cy="22" r="14" fill="#fdf4c0" opacity="0.9" filter="url(#wc-b1)"/>
      <circle cx="158" cy="22" r="10" fill="#fdeea0" opacity="0.95"/>
      <circle cx="28" cy="16" r="1.8" fill="white" opacity="0.8"/>
      <circle cx="68" cy="10" r="1.3" fill="white" opacity="0.7"/>
      <circle cx="115" cy="14" r="1.5" fill="white" opacity="0.6"/>
      <ellipse cx="100" cy="108" rx="130" ry="22" fill="#c8b090" opacity="0.3" filter="url(#wc-b1)"/>
      <ellipse cx="22" cy="74" rx="14" ry="20" fill="#78b88a" opacity="0.55" filter="url(#wc-b1)"/>
      <ellipse cx="178" cy="78" rx="12" ry="17" fill="#78b88a" opacity="0.5" filter="url(#wc-b1)"/>
    </svg>
  ),
  pixar: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs>
        <radialGradient id="px-bg" cx="50%" cy="35%" r="60%"><stop offset="0%" stopColor="#1a3060"/><stop offset="100%" stopColor="#060c18"/></radialGradient>
        <radialGradient id="px-sp" cx="38%" cy="33%" r="60%"><stop offset="0%" stopColor="#90c8ff"/><stop offset="45%" stopColor="#3a7bd5"/><stop offset="100%" stopColor="#0d2d6e"/></radialGradient>
        <radialGradient id="px-gw" cx="50%" cy="40%" r="55%"><stop offset="0%" stopColor="#4a90e8" stopOpacity="0.5"/><stop offset="100%" stopColor="#060c18" stopOpacity="0"/></radialGradient>
      </defs>
      <rect width="200" height="110" fill="url(#px-bg)"/>
      <rect width="200" height="110" fill="url(#px-gw)"/>
      <circle cx="18" cy="10" r="0.9" fill="white" opacity="0.9"/><circle cx="45" cy="7" r="0.6" fill="white" opacity="0.7"/>
      <circle cx="90" cy="14" r="1.1" fill="white" opacity="0.8"/><circle cx="130" cy="6" r="0.8" fill="white" opacity="0.6"/>
      <circle cx="170" cy="11" r="1" fill="white" opacity="0.9"/><circle cx="60" cy="22" r="0.6" fill="white" opacity="0.5"/>
      <ellipse cx="100" cy="112" rx="44" ry="12" fill="#000" opacity="0.35"/>
      <circle cx="100" cy="64" r="38" fill="url(#px-sp)"/>
      <ellipse cx="89" cy="55" rx="10" ry="7" fill="white" opacity="0.22" transform="rotate(-25,89,55)"/>
      <ellipse cx="88" cy="64" rx="6.5" ry="7.5" fill="#0a1e40"/><ellipse cx="113" cy="64" rx="6.5" ry="7.5" fill="#0a1e40"/>
      <circle cx="89.5" cy="62" r="2.2" fill="white" opacity="0.9"/><circle cx="114.5" cy="62" r="2.2" fill="white" opacity="0.9"/>
      <path d="M90 74 Q100 82 112 74" stroke="#0a1e40" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M70 48 Q66 64 72 82" stroke="#a0d0ff" strokeWidth="1.2" fill="none" opacity="0.4" strokeLinecap="round"/>
    </svg>
  ),
  ghibli: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <rect width="200" height="110" fill="#b8e0f5"/>
      <ellipse cx="46" cy="24" rx="32" ry="14" fill="white" opacity="0.88"/><ellipse cx="58" cy="19" rx="24" ry="13" fill="white" opacity="0.92"/><ellipse cx="34" cy="22" rx="19" ry="11" fill="white" opacity="0.82"/>
      <ellipse cx="148" cy="17" rx="38" ry="15" fill="white" opacity="0.82"/><ellipse cx="163" cy="12" rx="28" ry="13" fill="white" opacity="0.88"/>
      <ellipse cx="46" cy="110" rx="90" ry="50" fill="#8dc870"/><ellipse cx="170" cy="110" rx="70" ry="42" fill="#6eb058"/>
      <ellipse cx="100" cy="100" rx="120" ry="30" fill="#a8d880"/><rect x="0" y="86" width="200" height="24" fill="#78b850"/>
      <ellipse cx="18" cy="70" rx="14" ry="20" fill="#4a8a3a"/><rect x="15" y="82" width="5" height="15" fill="#6a4a2a"/>
      <rect x="98" y="38" width="6" height="62" fill="#5a3a1a"/>
      <ellipse cx="101" cy="34" rx="27" ry="30" fill="#3a6830"/><ellipse cx="87" cy="42" rx="15" ry="20" fill="#4a7838"/><ellipse cx="116" cy="44" rx="14" ry="18" fill="#3a6828"/>
      <rect x="130" y="72" width="22" height="16" fill="#f0e0c0"/><polygon points="126,72 141,61 154,72" fill="#c87050"/>
      <rect x="137" y="80" width="6" height="10" fill="#8a6040"/>
      <circle cx="175" cy="20" r="11" fill="#ffe880" opacity="0.92"/>
    </svg>
  ),
  paper_cutout: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs>
        <filter id="pc-s1"><feDropShadow dx="1.5" dy="1.5" stdDeviation="1.5" floodColor="#8a7050" floodOpacity="0.3"/></filter>
        <filter id="pc-s2"><feDropShadow dx="2.5" dy="2.5" stdDeviation="2" floodColor="#8a7050" floodOpacity="0.25"/></filter>
      </defs>
      <rect width="200" height="110" fill="#f5f0e8"/>
      <rect x="0" y="0" width="200" height="68" fill="#d0e8f8" filter="url(#pc-s1)"/>
      <circle cx="158" cy="26" r="20" fill="#ffd060" filter="url(#pc-s1)"/>
      <rect x="18" y="16" width="56" height="20" fill="white" rx="10" filter="url(#pc-s1)"/>
      <rect x="34" y="11" width="42" height="18" fill="white" rx="9"/>
      <rect x="108" y="20" width="46" height="17" fill="white" rx="8" filter="url(#pc-s1)"/>
      <ellipse cx="100" cy="104" rx="130" ry="38" fill="#a8c870" filter="url(#pc-s2)"/>
      <ellipse cx="34" cy="108" rx="68" ry="34" fill="#78a850" filter="url(#pc-s1)"/>
      <rect x="87" y="64" width="32" height="28" fill="#f0c8a0" filter="url(#pc-s1)"/>
      <polygon points="82,64 103,48 124,65" fill="#e07050" filter="url(#pc-s1)"/>
      <rect x="97" y="77" width="10" height="15" fill="#c09060"/>
      <rect x="40" y="66" width="5" height="26" fill="#8a6030"/>
      <polygon points="30,66 42,45 55,66" fill="#5a9040"/><polygon points="33,56 42,38 52,56" fill="#4a8030"/>
      <rect x="0" y="90" width="200" height="20" fill="#6a9830" filter="url(#pc-s2)"/>
      <circle cx="22" cy="92" r="3" fill="#f05050"/><circle cx="178" cy="93" r="3" fill="#f0a030"/>
    </svg>
  ),
  charcoal: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><filter id="cs-r"><feGaussianBlur stdDeviation="0.5"/></filter><filter id="cs-s"><feGaussianBlur stdDeviation="3"/></filter></defs>
      <rect width="200" height="110" fill="#181818"/>
      <circle cx="160" cy="24" r="20" fill="#3a3a3a" filter="url(#cs-s)"/><circle cx="160" cy="24" r="15" fill="#6a6a6a" filter="url(#cs-r)"/><circle cx="160" cy="24" r="10" fill="#aaaaaa"/>
      <ellipse cx="154" cy="20" rx="5" ry="4" fill="#d0d0d0" opacity="0.5"/>
      <g stroke="#262626" strokeWidth="0.8" opacity="0.7">
        <line x1="0" y1="12" x2="48" y2="10"/><line x1="0" y1="17" x2="42" y2="15"/>
        <line x1="55" y1="8" x2="100" y2="10"/><line x1="58" y1="13" x2="103" y2="15"/>
        <line x1="0" y1="30" x2="60" y2="28"/><line x1="70" y1="24" x2="118" y2="26"/>
      </g>
      <g stroke="#303030" strokeWidth="0.6" opacity="0.5">
        <line x1="8" y1="42" x2="12" y2="70"/><line x1="14" y1="40" x2="18" y2="68"/><line x1="20" y1="44" x2="24" y2="72"/>
      </g>
      <ellipse cx="100" cy="118" rx="140" ry="46" fill="#242424" filter="url(#cs-r)"/>
      <ellipse cx="30" cy="112" rx="68" ry="36" fill="#2c2c2c" filter="url(#cs-r)"/>
      <rect x="97" y="50" width="5" height="52" fill="#444" filter="url(#cs-r)"/>
      <ellipse cx="100" cy="42" rx="24" ry="27" fill="#333" filter="url(#cs-r)"/><ellipse cx="88" cy="48" rx="14" ry="18" fill="#3c3c3c" filter="url(#cs-r)"/><ellipse cx="113" cy="50" rx="12" ry="16" fill="#333" filter="url(#cs-r)"/>
      <g stroke="#505050" strokeWidth="0.7" opacity="0.7">
        <line x1="84" y1="33" x2="94" y2="50"/><line x1="88" y1="30" x2="98" y2="47"/>
        <line x1="108" y1="35" x2="118" y2="52"/><line x1="105" y1="31" x2="113" y2="47"/>
      </g>
      <ellipse cx="90" cy="37" rx="7" ry="5" fill="white" opacity="0.1" filter="url(#cs-r)"/>
      <rect x="0" y="96" width="200" height="14" fill="#141414" opacity="0.8"/>
      <circle cx="24" cy="13" r="1.1" fill="white" opacity="0.7"/><circle cx="62" cy="7" r="0.8" fill="white" opacity="0.5"/><circle cx="118" cy="17" r="1" fill="white" opacity="0.6"/>
    </svg>
  ),
  crayon: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><filter id="cr-w"><feTurbulence type="turbulence" baseFrequency="0.85,0.45" numOctaves="4" seed="3"/><feDisplacementMap in="SourceGraphic" scale="1.2" xChannelSelector="R" yChannelSelector="G"/></filter></defs>
      <rect width="200" height="110" fill="#fff9f0"/>
      <rect x="0" y="0" width="200" height="72" fill="#87ceeb" opacity="0.72" filter="url(#cr-w)"/>
      <g stroke="#6ab8d8" strokeWidth="4" opacity="0.28" strokeLinecap="round">
        <line x1="0" y1="10" x2="72" y2="8"/><line x1="80" y1="5" x2="132" y2="7"/>
        <line x1="8" y1="20" x2="62" y2="18"/><line x1="120" y1="14" x2="195" y2="12"/>
      </g>
      <circle cx="38" cy="27" r="19" fill="#ffec40" filter="url(#cr-w)"/><circle cx="38" cy="27" r="14" fill="#ffd820"/>
      <g stroke="#ffd820" strokeWidth="3" strokeLinecap="round" opacity="0.7">
        <line x1="38" y1="4" x2="38" y2="0"/><line x1="51" y1="11" x2="55" y2="8"/>
        <line x1="57" y1="27" x2="62" y2="27"/><line x1="38" y1="50" x2="38" y2="54"/>
        <line x1="25" y1="11" x2="21" y2="8"/><line x1="19" y1="27" x2="14" y2="27"/>
      </g>
      <ellipse cx="136" cy="21" rx="29" ry="13" fill="white" filter="url(#cr-w)" opacity="0.9"/>
      <ellipse cx="148" cy="16" rx="21" ry="12" fill="white" opacity="0.95"/>
      <rect x="0" y="62" width="200" height="48" fill="#5cc840" filter="url(#cr-w)"/>
      <g stroke="#48a030" strokeWidth="4.5" opacity="0.38" strokeLinecap="round">
        <line x1="0" y1="72" x2="60" y2="70"/><line x1="68" y1="67" x2="130" y2="69"/><line x1="148" y1="72" x2="200" y2="70"/>
      </g>
      <rect x="88" y="62" width="32" height="30" fill="#e87858" filter="url(#cr-w)"/>
      <polygon points="82,63 104,46 126,64" fill="#c04030" filter="url(#cr-w)"/>
      <rect x="98" y="76" width="10" height="16" fill="#c07040"/>
      <rect x="170" y="60" width="7" height="38" fill="#8a5020"/>
      <circle cx="173" cy="52" r="20" fill="#48c030" filter="url(#cr-w)"/>
      <circle cx="16" cy="84" r="4.5" fill="#f06080"/><rect x="14" y="87" width="3" height="12" fill="#48a030"/>
      <circle cx="188" cy="82" r="4.5" fill="#f0a030"/><rect x="186" y="85" width="3" height="13" fill="#48a030"/>
    </svg>
  ),
};

// ─── NARRATOR VOICE thumbnails ─────────────────────────────────────────────
const NARRATOR_THUMBS: Record<string, React.FC> = {
  warm_mother: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><radialGradient id="nm-bg" cx="50%" cy="60%" r="70%"><stop offset="0%" stopColor="#2a1a0e"/><stop offset="100%" stopColor="#120a04"/></radialGradient></defs>
      <rect width="200" height="110" fill="url(#nm-bg)"/>
      {/* Warm firelight glow */}
      <ellipse cx="100" cy="95" rx="70" ry="30" fill="#f0820a" opacity="0.18"/>
      <ellipse cx="100" cy="100" rx="50" ry="20" fill="#f5a030" opacity="0.22"/>
      {/* Mother silhouette */}
      <ellipse cx="100" cy="44" rx="18" ry="20" fill="#c8784a"/>
      {/* Hair */}
      <ellipse cx="100" cy="30" rx="20" ry="14" fill="#5a2e10"/>
      <ellipse cx="84" cy="38" rx="8" ry="16" fill="#5a2e10"/>
      <ellipse cx="116" cy="38" rx="8" ry="16" fill="#5a2e10"/>
      {/* Body / holding baby */}
      <ellipse cx="100" cy="78" rx="28" ry="20" fill="#c8784a"/>
      {/* Baby bundle */}
      <ellipse cx="100" cy="72" rx="14" ry="10" fill="#f0e0d0"/>
      <ellipse cx="100" cy="67" rx="7" ry="7" fill="#e8b090"/>
      {/* Warm sparkles */}
      <circle cx="40" cy="20" r="1.5" fill="#f5c060" opacity="0.7"/>
      <circle cx="160" cy="15" r="1.2" fill="#f5c060" opacity="0.6"/>
      <circle cx="170" cy="40" r="1" fill="#f5c060" opacity="0.5"/>
      <circle cx="30" cy="50" r="1.3" fill="#f5a030" opacity="0.6"/>
      {/* Halo / warmth ring */}
      <circle cx="100" cy="40" r="32" fill="none" stroke="#f0a030" strokeWidth="0.5" opacity="0.3"/>
      <circle cx="100" cy="40" r="42" fill="none" stroke="#f0a030" strokeWidth="0.3" opacity="0.15"/>
    </svg>
  ),
  wise_grandfather: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><radialGradient id="wg-bg" cx="40%" cy="40%" r="70%"><stop offset="0%" stopColor="#1a1e2e"/><stop offset="100%" stopColor="#0a0c14"/></radialGradient></defs>
      <rect width="200" height="110" fill="url(#wg-bg)"/>
      {/* Stars / night library */}
      <circle cx="20" cy="12" r="1" fill="white" opacity="0.6"/><circle cx="50" cy="8" r="0.8" fill="white" opacity="0.5"/>
      <circle cx="150" cy="10" r="1.2" fill="white" opacity="0.7"/><circle cx="180" cy="20" r="0.9" fill="white" opacity="0.5"/>
      <circle cx="80" cy="18" r="0.7" fill="white" opacity="0.4"/>
      {/* Bookshelf silhouette */}
      <rect x="0" y="70" width="200" height="40" fill="#1e1408"/>
      <rect x="10" y="55" width="8" height="20" fill="#8b4513"/><rect x="20" y="58" width="6" height="17" fill="#4a6fa5"/>
      <rect x="28" y="52" width="9" height="23" fill="#8b1a1a"/><rect x="39" y="56" width="7" height="19" fill="#2d6a2d"/>
      <rect x="148" y="54" width="8" height="21" fill="#7a3a00"/><rect x="158" y="57" width="7" height="18" fill="#3a3a8b"/>
      <rect x="167" y="53" width="9" height="22" fill="#6b2222"/><rect x="178" y="55" width="8" height="20" fill="#1a5a1a"/>
      {/* Grandfather silhouette */}
      <ellipse cx="100" cy="50" rx="16" ry="18" fill="#d4b896"/>
      {/* White hair */}
      <ellipse cx="100" cy="36" rx="17" ry="11" fill="#e8e8e8"/>
      <ellipse cx="85" cy="42" rx="6" ry="12" fill="#e0e0e0"/>
      <ellipse cx="115" cy="42" rx="6" ry="12" fill="#e0e0e0"/>
      {/* Glasses */}
      <circle cx="94" cy="50" r="5" fill="none" stroke="#c0a060" strokeWidth="1.2"/>
      <circle cx="106" cy="50" r="5" fill="none" stroke="#c0a060" strokeWidth="1.2"/>
      <line x1="99" y1="50" x2="101" y2="50" stroke="#c0a060" strokeWidth="1"/>
      {/* Body */}
      <rect x="82" y="64" width="36" height="22" rx="4" fill="#3a3a5a"/>
      {/* Pipe smoke */}
      <path d="M120 58 Q125 50 122 42 Q119 34 124 28" stroke="#aaaaaa" strokeWidth="1" fill="none" opacity="0.4" strokeLinecap="round"/>
      <circle cx="124" cy="26" r="3" fill="#aaaaaa" opacity="0.2"/>
    </svg>
  ),
  playful_sister: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><radialGradient id="ps-bg" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#1a0a2e"/><stop offset="100%" stopColor="#0a0518"/></radialGradient></defs>
      <rect width="200" height="110" fill="url(#ps-bg)"/>
      {/* Confetti / sparkles everywhere */}
      <circle cx="20" cy="15" r="3" fill="#f472b6" opacity="0.8"/>
      <rect x="45" y="10" width="5" height="5" fill="#60a5fa" opacity="0.7" transform="rotate(30,47,12)"/>
      <circle cx="80" cy="8" r="2.5" fill="#fbbf24" opacity="0.8"/>
      <rect x="110" y="12" width="4" height="4" fill="#34d399" opacity="0.7" transform="rotate(20,112,14)"/>
      <circle cx="150" cy="9" r="3" fill="#f472b6" opacity="0.7"/>
      <rect x="170" y="15" width="5" height="5" fill="#a78bfa" opacity="0.8" transform="rotate(45,172,17)"/>
      <circle cx="35" cy="85" r="2" fill="#60a5fa" opacity="0.6"/>
      <circle cx="165" cy="90" r="2.5" fill="#fbbf24" opacity="0.7"/>
      <rect x="185" y="70" width="4" height="4" fill="#f472b6" opacity="0.6" transform="rotate(15,187,72)"/>
      {/* Sister silhouette - ponytail, energetic pose */}
      <ellipse cx="100" cy="48" rx="17" ry="19" fill="#f0b090"/>
      {/* Hair with ponytail */}
      <ellipse cx="100" cy="34" rx="18" ry="12" fill="#c06030"/>
      <ellipse cx="83" cy="42" rx="7" ry="14" fill="#c06030"/>
      <ellipse cx="118" cy="38" rx="7" ry="12" fill="#c06030"/>
      {/* Ponytail */}
      <path d="M116 34 Q130 28 128 20" stroke="#c06030" strokeWidth="6" fill="none" strokeLinecap="round"/>
      {/* Big smile */}
      <path d="M91 54 Q100 62 109 54" stroke="#a06040" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* Eyes wide */}
      <ellipse cx="93" cy="48" rx="4" ry="4.5" fill="#3a2010"/>
      <ellipse cx="107" cy="48" rx="4" ry="4.5" fill="#3a2010"/>
      <circle cx="94.5" cy="46.5" r="1.5" fill="white" opacity="0.9"/>
      <circle cx="108.5" cy="46.5" r="1.5" fill="white" opacity="0.9"/>
      {/* Body with dress */}
      <polygon points="78,68 100,64 122,68 118,92 82,92" fill="#f472b6"/>
      {/* Star wand */}
      <line x1="120" y1="65" x2="150" y2="35" stroke="#fbbf24" strokeWidth="2"/>
      <polygon points="155,28 158,36 166,36 160,41 162,49 155,44 148,49 150,41 144,36 152,36" fill="#fbbf24" opacity="0.9"/>
    </svg>
  ),
  gentle_father: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><radialGradient id="gf-bg" cx="50%" cy="40%" r="70%"><stop offset="0%" stopColor="#0e1a10"/><stop offset="100%" stopColor="#060c08"/></radialGradient></defs>
      <rect width="200" height="110" fill="url(#gf-bg)"/>
      {/* Forest / nature background */}
      <ellipse cx="30" cy="110" rx="35" ry="50" fill="#1a3a1a"/>
      <ellipse cx="170" cy="110" rx="35" ry="50" fill="#1a3a1a"/>
      <ellipse cx="100" cy="110" rx="60" ry="40" fill="#234a23"/>
      {/* Fireflies */}
      <circle cx="25" cy="45" r="2" fill="#c8f060" opacity="0.7"/>
      <circle cx="175" cy="35" r="1.8" fill="#c8f060" opacity="0.6"/>
      <circle cx="50" cy="25" r="1.5" fill="#d0f070" opacity="0.5"/>
      <circle cx="160" cy="60" r="2" fill="#c8f060" opacity="0.65"/>
      <circle cx="140" cy="20" r="1.5" fill="#d0f070" opacity="0.5"/>
      {/* Father silhouette */}
      <ellipse cx="100" cy="46" rx="18" ry="20" fill="#c8906a"/>
      {/* Short hair */}
      <ellipse cx="100" cy="32" rx="19" ry="11" fill="#3a2010"/>
      <ellipse cx="83" cy="38" rx="7" ry="10" fill="#3a2010"/>
      {/* Gentle expression */}
      <path d="M92 54 Q100 60 108 54" stroke="#8a5030" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="93" cy="47" rx="3.5" ry="3.5" fill="#2a1a08"/>
      <ellipse cx="107" cy="47" rx="3.5" ry="3.5" fill="#2a1a08"/>
      <circle cx="94" cy="46" r="1.2" fill="white" opacity="0.8"/>
      <circle cx="108" cy="46" r="1.2" fill="white" opacity="0.8"/>
      {/* Body / flannel shirt */}
      <rect x="80" y="62" width="40" height="24" rx="4" fill="#4a6a3a"/>
      {/* Child on shoulders (small head) */}
      <ellipse cx="100" cy="22" rx="10" ry="11" fill="#e8b090"/>
      <ellipse cx="100" cy="14" rx="11" ry="7" fill="#5a3010"/>
      <ellipse cx="100" cy="22" rx="2.5" ry="3" fill="#2a1a08"/>
      <path d="M95 27 Q100 31 105 27" stroke="#8a5030" strokeWidth="1" fill="none" strokeLinecap="round"/>
      {/* Arms up holding child */}
      <path d="M82 70 Q70 50 90 28" stroke="#c8906a" strokeWidth="8" fill="none" strokeLinecap="round"/>
      <path d="M118 70 Q130 50 110 28" stroke="#c8906a" strokeWidth="8" fill="none" strokeLinecap="round"/>
    </svg>
  ),
  mysterious_narrator: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs>
        <radialGradient id="mn-bg" cx="50%" cy="50%" r="60%"><stop offset="0%" stopColor="#0e0a1e"/><stop offset="100%" stopColor="#040208"/></radialGradient>
        <radialGradient id="mn-orb" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#7030f0" stopOpacity="0.8"/><stop offset="100%" stopColor="#300860" stopOpacity="0"/></radialGradient>
      </defs>
      <rect width="200" height="110" fill="url(#mn-bg)"/>
      {/* Mystical orb glow */}
      <circle cx="100" cy="55" r="45" fill="url(#mn-orb)"/>
      {/* Floating particles */}
      <circle cx="30" cy="20" r="1.5" fill="#9060f0" opacity="0.7"/>
      <circle cx="170" cy="15" r="1.2" fill="#b080ff" opacity="0.6"/>
      <circle cx="45" cy="75" r="1.8" fill="#7040d0" opacity="0.65"/>
      <circle cx="160" cy="80" r="1.5" fill="#9060f0" opacity="0.7"/>
      <circle cx="80" cy="10" r="1" fill="#c090ff" opacity="0.5"/>
      <circle cx="130" cy="90" r="1.3" fill="#8050e0" opacity="0.6"/>
      {/* Hooded figure */}
      {/* Cape */}
      <ellipse cx="100" cy="80" rx="40" ry="30" fill="#1a0a30"/>
      {/* Hood */}
      <ellipse cx="100" cy="48" rx="22" ry="28" fill="#1a0a30"/>
      <ellipse cx="100" cy="38" rx="18" ry="20" fill="#120820"/>
      {/* Glowing eyes only */}
      <ellipse cx="93" cy="48" rx="4" ry="3" fill="#7030f0" opacity="0.9"/>
      <ellipse cx="107" cy="48" rx="4" ry="3" fill="#7030f0" opacity="0.9"/>
      <ellipse cx="93" cy="48" rx="2" ry="1.5" fill="#c090ff"/>
      <ellipse cx="107" cy="48" rx="2" ry="1.5" fill="#c090ff"/>
      {/* Crystal ball */}
      <circle cx="100" cy="60" r="12" fill="none" stroke="#7030f0" strokeWidth="0.8" opacity="0.6"/>
      <circle cx="100" cy="60" r="8" fill="#200840" opacity="0.9"/>
      <circle cx="100" cy="60" r="5" fill="#5020a0" opacity="0.7"/>
      <circle cx="97" cy="57" r="2" fill="#c090ff" opacity="0.5"/>
      {/* Swirling magic lines */}
      <path d="M60 30 Q80 20 100 30 Q120 40 140 30" stroke="#7030f0" strokeWidth="0.8" fill="none" opacity="0.4" strokeLinecap="round"/>
      <path d="M55 85 Q80 95 100 85 Q120 75 145 85" stroke="#7030f0" strokeWidth="0.8" fill="none" opacity="0.3" strokeLinecap="round"/>
    </svg>
  ),
  kid_narrator: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><radialGradient id="kn-bg" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#0a1e30"/><stop offset="100%" stopColor="#050f18"/></radialGradient></defs>
      <rect width="200" height="110" fill="url(#kn-bg)"/>
      {/* Dreamy bedroom ceiling — glow-in-dark stars */}
      <circle cx="30" cy="15" r="2" fill="#a0e0ff" opacity="0.5"/>
      <circle cx="60" cy="8" r="1.5" fill="#c0f0ff" opacity="0.6"/>
      <circle cx="100" cy="12" r="1.8" fill="#a0e0ff" opacity="0.55"/>
      <circle cx="140" cy="7" r="1.5" fill="#c0f0ff" opacity="0.5"/>
      <circle cx="170" cy="14" r="2" fill="#a0e0ff" opacity="0.55"/>
      <circle cx="185" cy="30" r="1.2" fill="#c0f0ff" opacity="0.4"/>
      <circle cx="15" cy="40" r="1.5" fill="#a0e0ff" opacity="0.45"/>
      {/* Star shapes */}
      <path d="M80 22 L81.5 26 L86 26 L82.5 28.5 L84 33 L80 30 L76 33 L77.5 28.5 L74 26 L78.5 26 Z" fill="#ffd060" opacity="0.5"/>
      <path d="M155 25 L156 28 L159 28 L156.5 30 L157.5 33 L155 31.5 L152.5 33 L153.5 30 L151 28 L154 28 Z" fill="#ffd060" opacity="0.4"/>
      {/* Bed / pillow */}
      <rect x="30" y="75" width="140" height="35" rx="6" fill="#1a3050"/>
      <ellipse cx="100" cy="75" rx="70" ry="10" fill="#2a4060"/>
      {/* Pillow */}
      <ellipse cx="100" cy="72" rx="35" ry="10" fill="#e8e0f0"/>
      {/* Kid lying down */}
      <ellipse cx="100" cy="66" rx="16" ry="16" fill="#f0c090"/>
      {/* Hair tousled */}
      <ellipse cx="100" cy="54" rx="17" ry="11" fill="#5a3010"/>
      <ellipse cx="86" cy="60" rx="6" ry="10" fill="#5a3010"/>
      <ellipse cx="114" cy="60" rx="6" ry="10" fill="#5a3010"/>
      {/* Sleepy eyes half closed */}
      <path d="M91 66 Q96 63 101 66" stroke="#3a2010" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M99 66 Q104 63 109 66" stroke="#3a2010" strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Cozy smile */}
      <path d="M94 73 Q100 77 106 73" stroke="#a06040" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* Teddy bear peeking */}
      <ellipse cx="148" cy="70" rx="12" ry="13" fill="#a06030"/>
      <ellipse cx="141" cy="63" rx="5" ry="5" fill="#a06030"/>
      <ellipse cx="155" cy="63" rx="5" ry="5" fill="#a06030"/>
      <ellipse cx="144" cy="69" rx="2" ry="2" fill="#6a3010"/>
      <ellipse cx="152" cy="69" rx="2" ry="2" fill="#6a3010"/>
      <ellipse cx="148" cy="73" rx="4" ry="3" fill="#8a4820"/>
    </svg>
  ),
};

// ─── READING LEVEL thumbnails ──────────────────────────────────────────────
const READING_THUMBS: Record<string, React.FC> = {
  toddler: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <rect width="200" height="110" fill="#1a0a2e"/>
      {/* Big bold simple shapes — toddler book style */}
      <circle cx="50" cy="45" r="30" fill="#f472b6" opacity="0.9"/>
      <circle cx="150" cy="55" r="28" fill="#60a5fa" opacity="0.9"/>
      <rect x="75" y="25" width="50" height="50" rx="12" fill="#fbbf24" opacity="0.85"/>
      {/* Big simple letters */}
      <text x="35" y="53" fontFamily="Arial" fontSize="28" fontWeight="900" fill="white" opacity="0.9">A</text>
      <text x="135" y="62" fontFamily="Arial" fontSize="28" fontWeight="900" fill="white" opacity="0.9">B</text>
      <text x="85" y="58" fontFamily="Arial" fontSize="28" fontWeight="900" fill="#1a0a2e">C</text>
      {/* Stars */}
      <circle cx="20" cy="15" r="2" fill="#fbbf24" opacity="0.7"/>
      <circle cx="180" cy="12" r="2.5" fill="#f472b6" opacity="0.7"/>
      <circle cx="100" cy="95" r="2" fill="#60a5fa" opacity="0.6"/>
      {/* Ground */}
      <ellipse cx="100" cy="105" rx="120" ry="20" fill="#2a1a40"/>
    </svg>
  ),
  early_reader: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><radialGradient id="er-bg" cx="50%" cy="40%" r="70%"><stop offset="0%" stopColor="#0e1e0e"/><stop offset="100%" stopColor="#060c06"/></radialGradient></defs>
      <rect width="200" height="110" fill="url(#er-bg)"/>
      {/* Open book in a garden */}
      <ellipse cx="100" cy="100" rx="120" ry="30" fill="#1a3a1a"/>
      {/* Open book */}
      <path d="M40 70 Q100 60 160 70 L165 90 Q100 82 35 90 Z" fill="#f5edd8"/>
      <line x1="100" y1="61" x2="100" y2="89" stroke="#c8b888" strokeWidth="1.5"/>
      {/* Text lines on pages */}
      <line x1="50" y1="72" x2="90" y2="70" stroke="#a09060" strokeWidth="1" opacity="0.6"/>
      <line x1="50" y1="77" x2="88" y2="75" stroke="#a09060" strokeWidth="1" opacity="0.6"/>
      <line x1="50" y1="82" x2="85" y2="80" stroke="#a09060" strokeWidth="1" opacity="0.6"/>
      <line x1="110" y1="72" x2="150" y2="70" stroke="#a09060" strokeWidth="1" opacity="0.6"/>
      <line x1="110" y1="77" x2="148" y2="75" stroke="#a09060" strokeWidth="1" opacity="0.6"/>
      <line x1="110" y1="82" x2="145" y2="80" stroke="#a09060" strokeWidth="1" opacity="0.6"/>
      {/* Simple flowers around */}
      <circle cx="30" cy="65" r="5" fill="#f472b6" opacity="0.8"/>
      <circle cx="30" cy="65" r="2.5" fill="#fbbf24"/>
      <rect x="28" y="68" width="3" height="12" fill="#4a8a3a"/>
      <circle cx="170" cy="62" r="5" fill="#60a5fa" opacity="0.8"/>
      <circle cx="170" cy="62" r="2.5" fill="#fbbf24"/>
      <rect x="168" y="65" width="3" height="12" fill="#4a8a3a"/>
      {/* Butterfly */}
      <ellipse cx="100" cy="45" rx="12" ry="8" fill="#f472b6" opacity="0.7" transform="rotate(-20,100,45)"/>
      <ellipse cx="116" cy="45" rx="10" ry="7" fill="#f472b6" opacity="0.6" transform="rotate(20,116,45)"/>
      <line x1="100" y1="38" x2="116" y2="52" stroke="#5a2a40" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Sparkles */}
      <circle cx="50" cy="20" r="1.5" fill="#fbbf24" opacity="0.7"/>
      <circle cx="155" cy="18" r="1.2" fill="#fbbf24" opacity="0.6"/>
      <circle cx="180" cy="40" r="1" fill="#34d399" opacity="0.5"/>
    </svg>
  ),
  grade_school: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><radialGradient id="gs-bg" cx="50%" cy="30%" r="70%"><stop offset="0%" stopColor="#101830"/><stop offset="100%" stopColor="#060c18"/></radialGradient></defs>
      <rect width="200" height="110" fill="url(#gs-bg)"/>
      {/* Adventure map vibes */}
      {/* Compass rose */}
      <circle cx="155" cy="30" r="20" fill="none" stroke="#c9a84c" strokeWidth="0.8" opacity="0.6"/>
      <circle cx="155" cy="30" r="3" fill="#c9a84c" opacity="0.8"/>
      <line x1="155" y1="12" x2="155" y2="48" stroke="#c9a84c" strokeWidth="1" opacity="0.7"/>
      <line x1="137" y1="30" x2="173" y2="30" stroke="#c9a84c" strokeWidth="1" opacity="0.7"/>
      <polygon points="155,12 158,20 155,18 152,20" fill="#c9a84c" opacity="0.9"/>
      <text x="152" y="10" fontFamily="Arial" fontSize="7" fill="#c9a84c" opacity="0.8">N</text>
      {/* Map terrain lines */}
      <path d="M20 85 Q40 70 60 80 Q80 90 100 75 Q120 60 140 72" stroke="#3a5a3a" strokeWidth="2" fill="none" opacity="0.6"/>
      <path d="M20 95 Q50 80 80 88 Q110 96 140 85 Q160 78 180 90" stroke="#3a5a3a" strokeWidth="1.5" fill="none" opacity="0.5"/>
      {/* Mountain silhouettes */}
      <polygon points="30,80 55,45 80,80" fill="#2a3a2a" opacity="0.8"/>
      <polygon points="55,80 80,50 105,80" fill="#1e2e1e" opacity="0.7"/>
      {/* Dotted path / trail */}
      <path d="M20 90 Q60 70 100 75 Q140 80 180 65" stroke="#c9a84c" strokeWidth="1.5" fill="none" strokeDasharray="4,4" opacity="0.6"/>
      {/* X marks the spot */}
      <line x1="176" y1="61" x2="184" y2="69" stroke="#e07050" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="184" y1="61" x2="176" y2="69" stroke="#e07050" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Stars */}
      <circle cx="25" cy="15" r="1" fill="white" opacity="0.5"/>
      <circle cx="70" cy="10" r="1.2" fill="white" opacity="0.4"/>
      <circle cx="120" cy="8" r="0.9" fill="white" opacity="0.5"/>
    </svg>
  ),
  advanced: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><radialGradient id="adv-bg" cx="50%" cy="50%" r="60%"><stop offset="0%" stopColor="#08101e"/><stop offset="100%" stopColor="#020608"/></radialGradient></defs>
      <rect width="200" height="110" fill="url(#adv-bg)"/>
      {/* Deep cosmos / philosophical */}
      {/* Galaxy swirl */}
      <path d="M100 55 Q120 30 150 40 Q170 48 160 70 Q148 90 120 85 Q95 80 85 60 Q78 42 100 35 Q125 28 140 50" stroke="#4a6090" strokeWidth="0.8" fill="none" opacity="0.5"/>
      <path d="M100 55 Q80 35 55 45 Q38 55 50 78 Q62 98 90 90 Q108 84 110 65" stroke="#4a6090" strokeWidth="0.6" fill="none" opacity="0.35"/>
      {/* Stars dense */}
      <circle cx="20" cy="12" r="1.2" fill="white" opacity="0.7"/><circle cx="45" cy="8" r="0.8" fill="white" opacity="0.5"/>
      <circle cx="75" cy="15" r="1" fill="white" opacity="0.6"/><circle cx="110" cy="7" r="1.3" fill="white" opacity="0.8"/>
      <circle cx="145" cy="12" r="0.9" fill="white" opacity="0.5"/><circle cx="175" cy="9" r="1.1" fill="white" opacity="0.6"/>
      <circle cx="188" cy="28" r="0.8" fill="white" opacity="0.4"/>
      <circle cx="30" cy="35" r="0.9" fill="white" opacity="0.4"/><circle cx="15" cy="60" r="1" fill="white" opacity="0.5"/>
      <circle cx="185" cy="55" r="1.2" fill="white" opacity="0.5"/><circle cx="190" cy="75" r="0.8" fill="white" opacity="0.4"/>
      {/* Nebula colors */}
      <ellipse cx="100" cy="55" rx="40" ry="30" fill="#1a0a30" opacity="0.5"/>
      <ellipse cx="80" cy="45" rx="25" ry="20" fill="#0a1a2e" opacity="0.6"/>
      <ellipse cx="120" cy="65" rx="22" ry="18" fill="#0e0a20" opacity="0.5"/>
      {/* Bright stars */}
      <circle cx="100" cy="55" r="3" fill="#c0d0ff" opacity="0.9"/>
      <circle cx="60" cy="40" r="2" fill="#d0e0ff" opacity="0.7"/>
      <circle cx="145" cy="35" r="2.5" fill="#e0eaff" opacity="0.8"/>
      <circle cx="155" cy="70" r="1.8" fill="#c0d0ff" opacity="0.7"/>
      {/* Owl silhouette */}
      <ellipse cx="100" cy="78" rx="12" ry="14" fill="#1e1428"/>
      <ellipse cx="100" cy="67" rx="11" ry="11" fill="#1e1428"/>
      <ellipse cx="93" cy="62" rx="5" ry="6" fill="#2a1e38"/>
      <ellipse cx="107" cy="62" rx="5" ry="6" fill="#2a1e38"/>
      <ellipse cx="93" cy="62" rx="3" ry="3" fill="#c9a84c" opacity="0.9"/>
      <ellipse cx="107" cy="62" rx="3" ry="3" fill="#c9a84c" opacity="0.9"/>
      <ellipse cx="93" cy="62" rx="1.5" ry="1.5" fill="#0a0810"/>
      <ellipse cx="107" cy="62" rx="1.5" ry="1.5" fill="#0a0810"/>
      <polygon points="97,68 100,72 103,68" fill="#c9a84c" opacity="0.8"/>
    </svg>
  ),
};

// ─── TONE thumbnails ────────────────────────────────────────────────────────
const TONE_THUMBS: Record<string, React.FC> = {
  cozy: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><radialGradient id="co-bg" cx="50%" cy="60%" r="70%"><stop offset="0%" stopColor="#1e0e04"/><stop offset="100%" stopColor="#0c0602"/></radialGradient></defs>
      <rect width="200" height="110" fill="url(#co-bg)"/>
      {/* Fireplace glow */}
      <ellipse cx="100" cy="100" rx="60" ry="25" fill="#e06010" opacity="0.25"/>
      <ellipse cx="100" cy="100" rx="35" ry="18" fill="#f08020" opacity="0.3"/>
      {/* Window with rain */}
      <rect x="68" y="15" width="64" height="52" rx="4" fill="#0a1828" opacity="0.9"/>
      <rect x="70" y="17" width="60" height="48" rx="3" fill="#0e2038"/>
      {/* Rain streaks */}
      <g stroke="#4a90c8" strokeWidth="0.8" opacity="0.5">
        <line x1="80" y1="22" x2="77" y2="36"/><line x1="90" y1="19" x2="87" y2="35"/>
        <line x1="100" y1="22" x2="97" y2="38"/><line x1="110" y1="20" x2="107" y2="36"/>
        <line x1="120" y1="23" x2="117" y2="37"/><line x1="85" y1="35" x2="82" y2="50"/>
        <line x1="95" y1="37" x2="92" y2="52"/><line x1="115" y1="36" x2="112" y2="50"/>
        <line x1="125" y1="35" x2="122" y2="49"/>
      </g>
      {/* Moon through rain */}
      <circle cx="120" cy="28" r="9" fill="#d0c890" opacity="0.4"/>
      {/* Window frame cross */}
      <line x1="100" y1="17" x2="100" y2="65" stroke="#1a3050" strokeWidth="2"/>
      <line x1="70" y1="41" x2="130" y2="41" stroke="#1a3050" strokeWidth="2"/>
      {/* Mug of hot cocoa */}
      <rect x="86" y="72" width="28" height="22" rx="3" fill="#6a3010"/>
      <path d="M114 78 Q122 78 122 85 Q122 92 114 92" stroke="#6a3010" strokeWidth="3" fill="none"/>
      <ellipse cx="100" cy="72" rx="14" ry="4" fill="#c86030"/>
      <ellipse cx="100" cy="70" rx="10" ry="3" fill="#f0e0c0"/>
      {/* Steam */}
      <path d="M93 69 Q91 62 93 55" stroke="#e8d0b0" strokeWidth="1.2" fill="none" opacity="0.5" strokeLinecap="round"/>
      <path d="M100 68 Q98 60 100 52" stroke="#e8d0b0" strokeWidth="1.2" fill="none" opacity="0.45" strokeLinecap="round"/>
      <path d="M107 69 Q105 61 107 54" stroke="#e8d0b0" strokeWidth="1.2" fill="none" opacity="0.5" strokeLinecap="round"/>
    </svg>
  ),
  adventurous: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><linearGradient id="adv-sky" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#050818"/><stop offset="60%" stopColor="#1a0e30"/><stop offset="100%" stopColor="#2a1a08"/></linearGradient></defs>
      <rect width="200" height="110" fill="url(#adv-sky)"/>
      {/* Stars */}
      <circle cx="15" cy="10" r="1" fill="white" opacity="0.7"/><circle cx="40" cy="6" r="0.8" fill="white" opacity="0.5"/>
      <circle cx="80" cy="12" r="1.2" fill="white" opacity="0.6"/><circle cx="120" cy="8" r="0.9" fill="white" opacity="0.5"/>
      <circle cx="170" cy="10" r="1.1" fill="white" opacity="0.7"/><circle cx="190" cy="25" r="0.8" fill="white" opacity="0.4"/>
      {/* Dragon silhouette flying */}
      <path d="M40 35 Q60 25 80 30 Q100 35 110 28 Q120 22 130 28 Q140 34 145 30" stroke="#c04020" strokeWidth="3" fill="none" strokeLinecap="round"/>
      {/* Dragon wings */}
      <path d="M70 30 Q65 15 55 18 Q62 25 70 30" fill="#a03018" opacity="0.8"/>
      <path d="M90 29 Q88 12 78 15 Q83 22 90 29" fill="#a03018" opacity="0.7"/>
      {/* Dragon head */}
      <ellipse cx="145" cy="29" rx="10" ry="7" fill="#c04020"/>
      <path d="M152 26 L160 20" stroke="#c04020" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="148" cy="27" r="2" fill="#ff4000" opacity="0.8"/>
      {/* Fire breath */}
      <path d="M155 27 Q168 22 178 18 Q172 25 180 30 Q168 28 155 27" fill="#f08020" opacity="0.7"/>
      <path d="M158 26 Q170 21 176 24" stroke="#f0c020" strokeWidth="1.5" fill="none" opacity="0.6"/>
      {/* Mountain peaks */}
      <polygon points="0,110 40,55 80,110" fill="#1a1028"/>
      <polygon points="40,110 80,50 120,110" fill="#140e20"/>
      <polygon points="100,110 140,58 180,110" fill="#1a1028"/>
      <polygon points="150,110 185,62 200,110" fill="#100c1e"/>
      {/* Snow caps */}
      <polygon points="40,55 50,65 30,65" fill="white" opacity="0.7"/>
      <polygon points="80,50 90,62 70,62" fill="white" opacity="0.65"/>
      <polygon points="140,58 150,68 130,68" fill="white" opacity="0.7"/>
    </svg>
  ),
  whimsical: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><radialGradient id="wh-bg" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#0a0520"/><stop offset="100%" stopColor="#040210"/></radialGradient></defs>
      <rect width="200" height="110" fill="url(#wh-bg)"/>
      {/* Floating mushrooms / fairyland */}
      {/* Giant glowing mushroom */}
      <ellipse cx="100" cy="62" rx="35" ry="18" fill="#c060d0" opacity="0.85"/>
      <ellipse cx="100" cy="62" rx="28" ry="14" fill="#d070e0"/>
      {/* Spots */}
      <circle cx="88" cy="58" r="4" fill="white" opacity="0.5"/>
      <circle cx="102" cy="55" r="5" fill="white" opacity="0.45"/>
      <circle cx="114" cy="60" r="3.5" fill="white" opacity="0.5"/>
      <circle cx="95" cy="66" r="3" fill="white" opacity="0.4"/>
      {/* Mushroom stem */}
      <rect x="92" y="72" width="16" height="25" rx="5" fill="#f0d8f0"/>
      {/* Glow under cap */}
      <ellipse cx="100" cy="72" rx="30" ry="8" fill="#c060d0" opacity="0.3"/>
      {/* Small mushrooms */}
      <ellipse cx="40" cy="85" rx="14" ry="8" fill="#f472b6" opacity="0.8"/>
      <circle cx="36" cy="83" r="2.5" fill="white" opacity="0.5"/>
      <circle cx="43" cy="81" r="2" fill="white" opacity="0.45"/>
      <rect x="36" y="88" width="8" height="14" rx="3" fill="#f0d0e8"/>
      <ellipse cx="162" cy="82" rx="14" ry="8" fill="#60a5fa" opacity="0.8"/>
      <circle cx="158" cy="80" r="2.5" fill="white" opacity="0.5"/>
      <circle cx="166" cy="78" r="2" fill="white" opacity="0.45"/>
      <rect x="157" y="85" width="9" height="14" rx="3" fill="#c0d8f0"/>
      {/* Fireflies / fairies */}
      <circle cx="25" cy="30" r="2.5" fill="#c8f060" opacity="0.8"/>
      <circle cx="175" cy="25" r="2.5" fill="#60f0d0" opacity="0.8"/>
      <circle cx="50" cy="15" r="2" fill="#f0c060" opacity="0.7"/>
      <circle cx="155" cy="40" r="2" fill="#f060c0" opacity="0.7"/>
      <circle cx="130" cy="15" r="1.8" fill="#c8f060" opacity="0.65"/>
      {/* Stars */}
      <circle cx="70" cy="10" r="1.2" fill="white" opacity="0.5"/>
      <circle cx="140" cy="8" r="1" fill="white" opacity="0.4"/>
    </svg>
  ),
  mysterious: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs>
        <radialGradient id="mys-bg" cx="50%" cy="40%" r="60%"><stop offset="0%" stopColor="#0a0e18"/><stop offset="100%" stopColor="#020406"/></radialGradient>
        <filter id="mys-f"><feGaussianBlur stdDeviation="4"/></filter>
      </defs>
      <rect width="200" height="110" fill="url(#mys-bg)"/>
      {/* Fog wisps */}
      <ellipse cx="30" cy="85" rx="50" ry="20" fill="#1a2030" opacity="0.8" filter="url(#mys-f)"/>
      <ellipse cx="160" cy="90" rx="55" ry="18" fill="#1a2030" opacity="0.7" filter="url(#mys-f)"/>
      <ellipse cx="100" cy="95" rx="80" ry="22" fill="#242838" opacity="0.6" filter="url(#mys-f)"/>
      {/* Dark forest */}
      <rect x="0" y="60" width="200" height="50" fill="#080c10"/>
      {/* Tree silhouettes */}
      <rect x="15" y="35" width="6" height="40" fill="#0c1018"/>
      <ellipse cx="18" cy="32" rx="14" ry="18" fill="#0c1018"/>
      <rect x="35" y="42" width="5" height="33" fill="#0e1218"/>
      <ellipse cx="37" cy="39" rx="11" ry="15" fill="#0e1218"/>
      <rect x="160" y="38" width="6" height="37" fill="#0c1018"/>
      <ellipse cx="163" cy="35" rx="13" ry="17" fill="#0c1018"/>
      <rect x="178" y="44" width="5" height="31" fill="#0e1218"/>
      <ellipse cx="180" cy="41" rx="10" ry="14" fill="#0e1218"/>
      {/* Moon — big and eerie */}
      <circle cx="100" cy="30" r="24" fill="#c8c890" opacity="0.12" filter="url(#mys-f)"/>
      <circle cx="100" cy="30" r="18" fill="#d8d8a0" opacity="0.25"/>
      <circle cx="100" cy="30" r="14" fill="#e8e8b8" opacity="0.5"/>
      {/* Moon craters */}
      <circle cx="95" cy="26" r="3" fill="#d0d090" opacity="0.4"/>
      <circle cx="106" cy="32" r="2" fill="#d0d090" opacity="0.3"/>
      {/* Single lantern on path */}
      <rect x="97" y="75" width="6" height="10" rx="1" fill="#c9a84c" opacity="0.7"/>
      <circle cx="100" cy="80" r="4" fill="#f0c040" opacity="0.5" filter="url(#mys-f)"/>
      <line x1="100" y1="75" x2="100" y2="70" stroke="#8a6a28" strokeWidth="1.5"/>
      {/* Winding path */}
      <path d="M80 110 Q90 95 100 90 Q110 85 115 110" stroke="#1a2030" strokeWidth="3" fill="none" opacity="0.6"/>
      {/* Stars barely visible */}
      <circle cx="30" cy="12" r="0.8" fill="white" opacity="0.4"/>
      <circle cx="170" cy="8" r="0.9" fill="white" opacity="0.35"/>
      <circle cx="60" cy="18" r="0.7" fill="white" opacity="0.3"/>
    </svg>
  ),
  tender: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs>
        <radialGradient id="tn-bg" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#1e0818"/><stop offset="100%" stopColor="#0c0408"/></radialGradient>
        <filter id="tn-glow"><feGaussianBlur stdDeviation="5"/></filter>
      </defs>
      <rect width="200" height="110" fill="url(#tn-bg)"/>
      {/* Petal rain */}
      <ellipse cx="35" cy="25" rx="6" ry="3" fill="#f472b6" opacity="0.5" transform="rotate(-30,35,25)"/>
      <ellipse cx="70" cy="15" rx="5" ry="2.5" fill="#f9a8d4" opacity="0.45" transform="rotate(20,70,15)"/>
      <ellipse cx="130" cy="20" rx="5" ry="2.5" fill="#f472b6" opacity="0.5" transform="rotate(-15,130,20)"/>
      <ellipse cx="165" cy="30" rx="6" ry="3" fill="#f9a8d4" opacity="0.4" transform="rotate(25,165,30)"/>
      <ellipse cx="50" cy="60" rx="4" ry="2" fill="#f472b6" opacity="0.35" transform="rotate(10,50,60)"/>
      <ellipse cx="155" cy="55" rx="5" ry="2.5" fill="#f9a8d4" opacity="0.4" transform="rotate(-20,155,55)"/>
      <ellipse cx="20" cy="80" rx="4" ry="2" fill="#f472b6" opacity="0.3" transform="rotate(15,20,80)"/>
      <ellipse cx="178" cy="75" rx="5" ry="2.5" fill="#f9a8d4" opacity="0.35" transform="rotate(-10,178,75)"/>
      {/* Glowing heart */}
      <ellipse cx="100" cy="50" rx="35" ry="30" fill="#c0304a" opacity="0.12" filter="url(#tn-glow)"/>
      <path d="M100 65 Q70 48 70 36 Q70 24 82 24 Q90 24 100 34 Q110 24 118 24 Q130 24 130 36 Q130 48 100 65 Z" fill="#e0405a" opacity="0.85"/>
      <path d="M100 62 Q75 47 76 37 Q77 28 84 27 Q91 27 100 37" fill="#f06070" opacity="0.4"/>
      {/* Floating smaller hearts */}
      <path d="M45 30 Q38 24 38 20 Q38 15 42 15 Q45 15 45 19 Q45 15 48 15 Q52 15 52 20 Q52 24 45 30 Z" fill="#f472b6" opacity="0.6"/>
      <path d="M158 38 Q152 33 152 29 Q152 25 155 25 Q158 25 158 28 Q158 25 161 25 Q164 25 164 29 Q164 33 158 38 Z" fill="#f472b6" opacity="0.55"/>
      {/* Stars / sparkles */}
      <circle cx="25" cy="15" r="1.5" fill="#f9a8d4" opacity="0.7"/>
      <circle cx="175" cy="12" r="1.3" fill="#f9a8d4" opacity="0.65"/>
      <circle cx="100" cy="10" r="1.2" fill="#f472b6" opacity="0.6"/>
    </svg>
  ),
};

// ─── PACING thumbnails ──────────────────────────────────────────────────────
const PACING_THUMBS: Record<string, React.FC> = {
  unhurried: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs>
        <radialGradient id="un-bg" cx="50%" cy="40%" r="70%"><stop offset="0%" stopColor="#0a1428"/><stop offset="100%" stopColor="#040810"/></radialGradient>
        <filter id="un-blur"><feGaussianBlur stdDeviation="6"/></filter>
      </defs>
      <rect width="200" height="110" fill="url(#un-bg)"/>
      {/* Calm water / reflection */}
      <rect x="0" y="65" width="200" height="45" fill="#060e1c"/>
      {/* Moon reflection */}
      <ellipse cx="100" cy="88" rx="12" ry="4" fill="#d8c870" opacity="0.25" filter="url(#un-blur)"/>
      {/* Gentle waves */}
      <path d="M0 68 Q25 65 50 68 Q75 71 100 68 Q125 65 150 68 Q175 71 200 68" stroke="#1a3050" strokeWidth="1.5" fill="none" opacity="0.7"/>
      <path d="M0 74 Q30 70 60 74 Q90 78 120 74 Q150 70 180 74 Q190 76 200 74" stroke="#1a3050" strokeWidth="1" fill="none" opacity="0.5"/>
      {/* Moon */}
      <circle cx="100" cy="30" r="20" fill="#e8d870" opacity="0.15" filter="url(#un-blur)"/>
      <circle cx="100" cy="30" r="16" fill="#e8d870" opacity="0.4"/>
      <circle cx="100" cy="30" r="13" fill="#f0e890"/>
      {/* Soft glow */}
      <circle cx="100" cy="30" r="25" fill="#f0e890" opacity="0.08" filter="url(#un-blur)"/>
      {/* Distant mountain silhouette */}
      <path d="M0 65 Q40 45 70 65 Q100 80 130 58 Q155 42 200 65" fill="#0a1420" opacity="0.9"/>
      {/* A single boat */}
      <path d="M82 68 Q100 64 118 68 L116 72 L84 72 Z" fill="#1a2e48"/>
      <line x1="100" y1="64" x2="100" y2="52" stroke="#2a4060" strokeWidth="1.5"/>
      <path d="M100 52 L118 62 L100 64 Z" fill="#2a4060" opacity="0.7"/>
      {/* Stars */}
      <circle cx="22" cy="14" r="1.2" fill="white" opacity="0.5"/>
      <circle cx="55" cy="8" r="0.9" fill="white" opacity="0.4"/>
      <circle cx="145" cy="10" r="1.1" fill="white" opacity="0.5"/>
      <circle cx="178" cy="16" r="0.8" fill="white" opacity="0.4"/>
    </svg>
  ),
  natural: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><linearGradient id="na-sky" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#0e1e38"/><stop offset="100%" stopColor="#1a3050"/></linearGradient></defs>
      <rect width="200" height="110" fill="url(#na-sky)"/>
      {/* Golden hour horizon */}
      <rect x="0" y="65" width="200" height="45" fill="#1a2e10"/>
      <ellipse cx="100" cy="65" rx="200" ry="20" fill="#c87820" opacity="0.3"/>
      <ellipse cx="100" cy="65" rx="150" ry="12" fill="#f09030" opacity="0.2"/>
      {/* Sun setting */}
      <circle cx="100" cy="64" r="18" fill="#f0a020" opacity="0.7"/>
      <circle cx="100" cy="64" r="12" fill="#f8c030"/>
      {/* Birds in flight — natural rhythm */}
      <path d="M30 28 Q35 24 40 28" stroke="#c8d8e8" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M50 20 Q56 15 62 20" stroke="#c8d8e8" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M70 26 Q75 22 80 26" stroke="#c8d8e8" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M130 22 Q136 17 142 22" stroke="#c8d8e8" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M150 30 Q155 25 160 30" stroke="#c8d8e8" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M170 20 Q176 15 182 20" stroke="#c8d8e8" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* Tree silhouettes */}
      <rect x="20" y="45" width="5" height="30" fill="#0e1e08"/>
      <ellipse cx="22" cy="42" rx="14" ry="18" fill="#0e1e08"/>
      <rect x="174" y="48" width="5" height="27" fill="#0e1e08"/>
      <ellipse cx="176" cy="45" rx="13" ry="16" fill="#0e1e08"/>
      {/* Gentle hill */}
      <ellipse cx="100" cy="110" rx="150" ry="45" fill="#1a3010"/>
      {/* Stars barely visible */}
      <circle cx="160" cy="10" r="1" fill="white" opacity="0.4"/>
      <circle cx="40" cy="8" r="0.8" fill="white" opacity="0.3"/>
    </svg>
  ),
  brisk: () => (
    <svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",display:"block"}}>
      <defs><linearGradient id="br-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#050818"/><stop offset="100%" stopColor="#180510"/></linearGradient></defs>
      <rect width="200" height="110" fill="url(#br-bg)"/>
      {/* Speed lines — motion blur effect */}
      <g stroke="#1a2a50" strokeWidth="1" opacity="0.7">
        <line x1="0" y1="20" x2="180" y2="18"/><line x1="0" y1="28" x2="160" y2="26"/>
        <line x1="20" y1="36" x2="200" y2="34"/><line x1="0" y1="44" x2="140" y2="42"/>
        <line x1="40" y1="52" x2="200" y2="50"/><line x1="0" y1="60" x2="170" y2="58"/>
        <line x1="10" y1="68" x2="200" y2="66"/><line x1="0" y1="76" x2="150" y2="74"/>
      </g>
      <g stroke="#2a3a70" strokeWidth="0.6" opacity="0.5">
        <line x1="0" y1="24" x2="120" y2="22"/><line x1="60" y1="32" x2="200" y2="30"/>
        <line x1="0" y1="56" x2="90" y2="54"/><line x1="100" y1="64" x2="200" y2="62"/>
      </g>
      {/* Lightning bolt */}
      <polygon points="108,12 95,50 103,50 92,98 122,48 111,48 125,12" fill="#f0c020" opacity="0.9"/>
      <polygon points="108,12 95,50 103,50 92,98 122,48 111,48 125,12" fill="none" stroke="#fff080" strokeWidth="1" opacity="0.6"/>
      {/* Glow around bolt */}
      <polygon points="108,12 95,50 103,50 92,98 122,48 111,48 125,12" fill="#f0c020" opacity="0.15" filter="url(#un-blur)"/>
      {/* Stars streaking */}
      <line x1="170" y1="15" x2="185" y2="12" stroke="white" strokeWidth="1.5" opacity="0.7"/>
      <line x1="20" y1="85" x2="38" y2="82" stroke="white" strokeWidth="1.2" opacity="0.6"/>
      <line x1="155" y1="80" x2="175" y2="77" stroke="white" strokeWidth="1.2" opacity="0.65"/>
      <circle cx="186" cy="12" r="1.5" fill="white" opacity="0.9"/>
      <circle cx="38" cy="82" r="1.2" fill="white" opacity="0.7"/>
      <circle cx="175" cy="77" r="1.2" fill="white" opacity="0.7"/>
    </svg>
  ),
};

// Map axis key -> thumbnail lookup
const ALL_THUMBS: Record<string, Record<string, React.FC>> = {
  visualStyle: VISUAL_THUMBS,
  narratorVoice: NARRATOR_THUMBS,
  readingLevel: READING_THUMBS,
  tone: TONE_THUMBS,
  pacing: PACING_THUMBS,
};

export default function PickerPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<StoryFilters>(defaultFilters);
  const [openAxis, setOpenAxis] = useState<keyof StoryFilters | null>("visualStyle");
  const [mounted, setMounted] = useState(false);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef   = useRef<HTMLDivElement>(null);
  const mxRef = useRef(0), myRef = useRef(0), rxRef = useRef(0), ryRef = useRef(0);

  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { mxRef.current = e.clientX; myRef.current = e.clientY; };
    document.addEventListener("mousemove", onMove);
    let raf: number;
    const tick = () => {
      if (cursorRef.current) { cursorRef.current.style.left = mxRef.current-4+"px"; cursorRef.current.style.top = myRef.current-4+"px"; }
      rxRef.current += (mxRef.current-rxRef.current-17)*0.1;
      ryRef.current += (myRef.current-ryRef.current-17)*0.1;
      if (ringRef.current) { ringRef.current.style.left = rxRef.current+"px"; ringRef.current.style.top = ryRef.current+"px"; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { document.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, []);

  const currentIdx = FILTER_CONFIG.findIndex(a => a.key === openAxis);

  const goNext = () => {
    if (currentIdx < FILTER_CONFIG.length - 1) {
      setOpenAxis(FILTER_CONFIG[currentIdx + 1].key);
    } else {
      navigate("/record", { state: { filters } });
    }
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="pk-cursor" ref={cursorRef} />
      <div className="pk-ring"   ref={ringRef} />

      <div className="pk-page">
        <div className="pk-orb pk-orb1" />
        <div className="pk-orb pk-orb2" />
        <div className="pk-orb pk-orb3" />

        <div className="pk-layout">
          <aside className={`pk-sidebar ${mounted ? "pk-sidebar-in" : ""}`}>
            <button className="pk-back" onClick={() => navigate("/")} type="button">← Back</button>

            <div style={{marginBottom:"2.5rem"}}>
              <p className="pk-step-label">Step 1 of 2</p>
              <h1 className="pk-heading">Choose your <em>version</em></h1>
              <p className="pk-sub">Every axis shapes your storybook. Pick one per row — or keep the defaults and begin immediately.</p>
            </div>

            <div className="pk-progress">
              {FILTER_CONFIG.map((axis) => {
                const meta = AXIS_META[axis.key];
                const isOpen = openAxis === axis.key;
                return (
                  <button key={axis.key} className={`pk-prog-item ${isOpen ? "pk-prog-active" : ""}`}
                    style={{"--dot-color": meta.color} as React.CSSProperties}
                    onClick={() => setOpenAxis(isOpen ? null : axis.key)} type="button">
                    <span className="pk-prog-dot" />
                    <span className="pk-prog-label">{axis.title}</span>
                    <span className="pk-prog-val">{getFilterLabel(axis.key, filters[axis.key])}</span>
                  </button>
                );
              })}
            </div>

            <div className="pk-summary">
              <p className="pk-summary-label">Current Configuration</p>
              <p className="pk-summary-text">{FILTER_CONFIG.map(a => getFilterLabel(a.key, filters[a.key])).join(" · ")}</p>
            </div>
          </aside>

          <main className="pk-main">
            {FILTER_CONFIG.map((axis, axisIdx) => {
              const meta = AXIS_META[axis.key];
              const isOpen = openAxis === axis.key;
              const isLast = axisIdx === FILTER_CONFIG.length - 1;
              const thumbMap = ALL_THUMBS[axis.key];

              return (
                <div key={axis.key}
                  className={`pk-card ${isOpen ? "pk-card-open" : "pk-card-closed"} ${mounted ? "pk-card-mounted" : ""}`}
                  style={{"--card-color": meta.color,"--card-glow": meta.glow,"--card-bg": meta.bg,"--card-border": meta.border, animationDelay:`${axisIdx*0.08}s`} as React.CSSProperties}>

                  <button className="pk-card-header" onClick={() => setOpenAxis(isOpen ? null : axis.key)} type="button">
                    <div className="pk-card-left">
                      <span className="pk-card-emoji">{meta.emoji}</span>
                      <div>
                        <p className="pk-card-axis">{axis.title}</p>
                        <p className="pk-card-value">{getFilterLabel(axis.key, filters[axis.key])}</p>
                      </div>
                    </div>
                    <div className="pk-card-right">
                      <span className="pk-card-desc">{meta.desc}</span>
                      <span className={`pk-chevron ${isOpen ? "pk-chevron-open" : ""}`}>›</span>
                    </div>
                  </button>

                  <div className={`pk-options-wrap ${isOpen ? "pk-options-open" : ""}`}>
                    <div className="pk-options-grid pk-options-grid-visual">
                      {axis.options.map((opt, optIdx) => {
                        const selected = filters[axis.key] === opt.value;
                        const Thumb = thumbMap?.[opt.value];
                        return (
                          <button key={opt.value}
                            className={`pk-option pk-option-visual ${selected ? "pk-option-on" : ""}`}
                            style={{animationDelay: isOpen ? `${optIdx*0.04}s` : "0s"} as React.CSSProperties}
                            onClick={() => {
                              setFilters(prev => ({...prev, [axis.key]: opt.value}));
                              setTimeout(() => { if (!isLast) setOpenAxis(FILTER_CONFIG[axisIdx+1].key); }, 320);
                            }} type="button">
                            {Thumb ? (
                              <>
                                <div className="pk-thumb-wrap"><Thumb />{selected && <div className="pk-thumb-check">✓</div>}</div>
                                <span className="pk-opt-label pk-opt-label-visual">{opt.label}</span>
                              </>
                            ) : (
                              <>
                                <span className="pk-opt-emoji">✦</span>
                                <span className="pk-opt-label">{opt.label}</span>
                                {selected && <span className="pk-opt-check">✓</span>}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="pk-card-footer">
                      <button className="pk-next-btn" onClick={goNext} type="button">
                        <span>{isLast ? "Continue to Record" : `Next: ${FILTER_CONFIG[axisIdx+1]?.title}`}</span>
                        <span className="pk-next-arrow">→</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </main>
        </div>
      </div>
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Instrument+Sans:wght@300;400;500&display=swap');

@keyframes pk-up    { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
@keyframes pk-in    { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
@keyframes pk-opt-in{ from{opacity:0;transform:translateY(10px) scale(.96)} to{opacity:1;transform:translateY(0) scale(1)} }
@keyframes pk-orb1  { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,-30px) scale(1.1)} }
@keyframes pk-orb2  { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-30px,20px) scale(.9)} }
@keyframes pk-orb3  { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,40px)} }

body { cursor:none!important; margin:0; }
.pk-cursor { position:fixed;width:8px;height:8px;background:#c9a84c;border-radius:50%;pointer-events:none;z-index:9999;mix-blend-mode:screen; }
.pk-ring   { position:fixed;width:34px;height:34px;border:1px solid rgba(201,168,76,.35);border-radius:50%;pointer-events:none;z-index:9998; }

.pk-page {
  font-family:'Instrument Sans',sans-serif;font-weight:300;
  background:linear-gradient(145deg,#0c1525 0%,#070c17 55%,#0d1020 100%);
  color:#e8dfd0;min-height:100vh;position:relative;overflow:hidden;
}
.pk-orb { position:fixed;border-radius:50%;filter:blur(80px);pointer-events:none;z-index:0; }
.pk-orb1 { width:500px;height:500px;background:rgba(167,139,250,.06);top:-100px;right:-100px;animation:pk-orb1 12s ease-in-out infinite; }
.pk-orb2 { width:400px;height:400px;background:rgba(96,165,250,.05);bottom:-80px;left:-80px;animation:pk-orb2 10s ease-in-out infinite; }
.pk-orb3 { width:300px;height:300px;background:rgba(244,114,182,.04);top:50%;left:50%;animation:pk-orb3 14s ease-in-out infinite; }

.pk-layout { display:grid;grid-template-columns:320px 1fr;min-height:100vh;position:relative;z-index:1; }

.pk-sidebar {
  padding:2.5rem 2rem;border-right:1px solid rgba(232,223,208,.06);
  background:rgba(8,12,22,.5);backdrop-filter:blur(12px);
  display:flex;flex-direction:column;
  opacity:0;transform:translateX(-16px);transition:opacity .6s ease,transform .6s ease;
  position:sticky;top:0;height:100vh;overflow-y:auto;
}
.pk-sidebar-in { opacity:1;transform:translateX(0); }
.pk-back { background:none;border:none;color:rgba(232,223,208,.3);font-family:'Instrument Sans',sans-serif;font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;cursor:none;margin-bottom:2.5rem;padding:0;transition:color .2s; }
.pk-back:hover { color:rgba(232,223,208,.7); }
.pk-step-label { font-size:.6rem;letter-spacing:.35em;text-transform:uppercase;color:#c9a84c;margin-bottom:.75rem; }
.pk-heading { font-family:'Cormorant Garamond',serif;font-size:2.4rem;font-weight:400;line-height:1.1;color:#e8dfd0;margin:0 0 .75rem; }
.pk-heading em { font-style:italic;color:#c9a84c; }
.pk-sub { font-size:.8rem;line-height:1.7;color:rgba(232,223,208,.38);margin-bottom:0; }

.pk-progress { display:flex;flex-direction:column;gap:.5rem;margin-bottom:2rem; }
.pk-prog-item { display:flex;align-items:center;gap:.75rem;background:none;border:none;padding:.6rem .75rem;border-radius:10px;cursor:none;text-align:left;transition:background .25s; }
.pk-prog-item:hover { background:rgba(232,223,208,.04); }
.pk-prog-active { background:rgba(232,223,208,.06)!important; }
.pk-prog-dot { width:8px;height:8px;border-radius:50%;background:var(--dot-color);flex-shrink:0;transition:box-shadow .3s; }
.pk-prog-active .pk-prog-dot { box-shadow:0 0 0 3px rgba(255,255,255,.1),0 0 12px var(--dot-color); }
.pk-prog-label { font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:rgba(232,223,208,.4);flex:1; }
.pk-prog-val { font-family:'Cormorant Garamond',serif;font-size:.9rem;color:rgba(232,223,208,.6);font-style:italic; }
.pk-prog-active .pk-prog-label { color:var(--dot-color); }
.pk-prog-active .pk-prog-val   { color:#e8dfd0; }

.pk-summary { margin-top:auto;padding:1.25rem;background:rgba(201,168,76,.05);border:1px solid rgba(201,168,76,.12);border-radius:14px; }
.pk-summary-label { font-size:.58rem;letter-spacing:.3em;text-transform:uppercase;color:#c9a84c;margin-bottom:.6rem; }
.pk-summary-text  { font-family:'Cormorant Garamond',serif;font-size:.95rem;font-style:italic;color:rgba(232,223,208,.6);line-height:1.6; }

.pk-main { padding:3rem 2.5rem;display:flex;flex-direction:column;gap:1rem;overflow-y:auto; }

.pk-card {
  border:1px solid rgba(232,223,208,.08);border-radius:18px;
  background:rgba(12,20,38,.6);backdrop-filter:blur(8px);
  overflow:hidden;transition:border-color .3s ease,box-shadow .3s ease;opacity:0;
}
.pk-card-mounted { animation:pk-up 0.5s ease forwards; }
.pk-card-open {
  border-color:var(--card-border)!important;
  box-shadow:0 0 0 1px var(--card-border),0 8px 40px var(--card-glow),inset 0 0 40px var(--card-bg);
}
.pk-card-open .pk-card-header { background:var(--card-bg); }

.pk-card-header { width:100%;display:flex;align-items:center;justify-content:space-between;padding:1.25rem 1.5rem;background:none;border:none;cursor:none;text-align:left;transition:background .3s ease; }
.pk-card-header:hover { background:rgba(232,223,208,.03); }
.pk-card-left  { display:flex;align-items:center;gap:1rem; }
.pk-card-right { display:flex;align-items:center;gap:1rem; }
.pk-card-emoji { font-size:1.8rem;filter:drop-shadow(0 2px 8px rgba(0,0,0,.5));transition:transform .3s ease; }
.pk-card-open .pk-card-emoji { transform:scale(1.15) rotate(-5deg); }
.pk-card-axis  { font-size:.58rem;letter-spacing:.3em;text-transform:uppercase;color:var(--card-color);margin-bottom:.25rem; }
.pk-card-value { font-family:'Cormorant Garamond',serif;font-size:1.3rem;color:#e8dfd0; }
.pk-card-desc  { font-size:.72rem;color:rgba(232,223,208,.28);letter-spacing:.04em; }
.pk-chevron { font-size:1.4rem;color:rgba(232,223,208,.25);transition:transform .35s cubic-bezier(.4,0,.2,1),color .3s; }
.pk-chevron-open { transform:rotate(90deg);color:var(--card-color); }

.pk-options-wrap { max-height:0;overflow:hidden;transition:max-height .5s cubic-bezier(.4,0,.2,1),opacity .4s ease,padding .4s ease;opacity:0;padding:0 1.5rem; }
.pk-options-open { max-height:800px;opacity:1;padding:0 1.5rem 1.5rem; }

.pk-options-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:.6rem;margin-bottom:1.25rem; }
.pk-options-grid-visual { grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.75rem; }

.pk-option {
  display:flex;align-items:center;gap:.65rem;
  padding:.85rem 1rem;border-radius:12px;
  border:1px solid rgba(232,223,208,.1);
  background:rgba(8,12,22,.5);
  color:rgba(232,223,208,.6);font-family:'Instrument Sans',sans-serif;font-size:.82rem;
  cursor:none;text-align:left;position:relative;overflow:hidden;
  transition:all .25s ease;opacity:0;
}
.pk-options-open .pk-option { animation:pk-opt-in .4s ease forwards; }
.pk-option:hover { border-color:var(--card-border);background:var(--card-bg);color:#e8dfd0;transform:translateY(-2px); }
.pk-option-on {
  border-color:var(--card-color)!important;background:var(--card-bg)!important;color:#e8dfd0!important;
  box-shadow:0 0 20px var(--card-glow),inset 0 0 20px var(--card-bg);
}
.pk-option-on::before { content:'';position:absolute;inset:0;background:linear-gradient(135deg,var(--card-bg),transparent);pointer-events:none; }

.pk-option-visual { flex-direction:column;align-items:stretch;padding:0;gap:0;border-radius:14px;overflow:hidden; }
.pk-option-visual:hover { transform:translateY(-4px);box-shadow:0 8px 32px var(--card-glow); }

.pk-thumb-wrap { width:100%;aspect-ratio:16/9;overflow:hidden;position:relative; }
.pk-thumb-wrap svg { width:100%;height:100%;display:block; }

.pk-thumb-check {
  position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:50%;
  background:var(--card-color);display:flex;align-items:center;justify-content:center;
  font-size:.65rem;color:#0c1525;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.4);
}

.pk-opt-label-visual {
  display:block;padding:.6rem .85rem .7rem;font-size:.78rem;font-weight:400;
  color:rgba(232,223,208,.7);background:rgba(8,12,22,.6);
  text-align:left;border-top:1px solid rgba(232,223,208,.08);transition:color .2s;
}
.pk-option-visual:hover .pk-opt-label-visual { color:#e8dfd0; }
.pk-option-on .pk-opt-label-visual { color:var(--card-color)!important;border-top-color:var(--card-border); }

.pk-opt-emoji { font-size:1.2rem;flex-shrink:0; }
.pk-opt-label { flex:1;font-weight:400; }
.pk-opt-check { font-size:.75rem;color:var(--card-color);font-weight:600;margin-left:auto;flex-shrink:0; }

.pk-card-footer { display:flex;justify-content:flex-end;margin-top:.5rem; }
.pk-next-btn {
  display:inline-flex;align-items:center;gap:.6rem;padding:.75rem 1.5rem;border-radius:100px;
  border:1px solid var(--card-border);background:var(--card-bg);color:var(--card-color);
  font-family:'Instrument Sans',sans-serif;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;
  cursor:none;transition:all .3s ease;
}
.pk-next-btn:hover { background:var(--card-color);color:#0c1525;transform:translateX(4px); }
.pk-next-arrow { transition:transform .3s; }
.pk-next-btn:hover .pk-next-arrow { transform:translateX(4px); }

@media(max-width:768px){
  .pk-layout{grid-template-columns:1fr}
  .pk-sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid rgba(232,223,208,.06)}
  .pk-options-grid-visual{grid-template-columns:1fr 1fr}
}
`;
