import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";

/* ── Three.js Moon ─────────────────────────────────────────────────────────── */
function ThreeMoon() {
  const mountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = 360, H = 360;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    camera.position.z = 3.2;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMouse: { value: new THREE.Vector2(0, 0) } },
      vertexShader: `varying vec3 vNormal;varying vec2 vUv;void main(){vNormal=normalize(normalMatrix*normal);vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        uniform float uTime; uniform vec2 uMouse;
        varying vec3 vNormal; varying vec2 vUv;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
        float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.1;a*=.5;}return v;}
        void main(){
          vec3 base=vec3(.94,.88,.72),dark=vec3(.52,.45,.32),gold=vec3(.82,.64,.22);
          float n=fbm(vUv*6.+uTime*.01);
          float c=fbm(vUv*13.-.5)*fbm(vUv*8.+1.3);
          vec3 surf=mix(base,dark,c*.75+n*.12);
          float limb=pow(max(dot(vNormal,vec3(0,0,1)),0.),.45);
          surf*=mix(.25,1.,limb);
          vec3 ld=normalize(vec3(-.55+uMouse.x*.9,.4+uMouse.y*.4,.8));
          float diff=max(dot(vNormal,ld),0.);
          float spec=pow(max(dot(reflect(-ld,vNormal),vec3(0,0,1)),0.),22.)*.2;
          float rim=pow(1.-limb,3.);
          vec3 col=surf*(.1+diff*.9)+spec+gold*rim*diff*.85;
          col+=vec3(.75,.58,.18)*pow(1.-limb,4.)*.28;
          gl_FragColor=vec4(col,1.);
        }`,
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), mat);
    scene.add(moon);
    scene.add(new THREE.PointLight(0xffeebb, 2.5, 12).position.set(-2, 1.5, 3) && new THREE.PointLight(0xffeebb, 2.5, 12));
    scene.add(new THREE.AmbientLight(0x1a2040, 0.9));

    let mx = 0, my = 0;
    const onMouse = (e: MouseEvent) => { mx = (e.clientX / window.innerWidth) * 2 - 1; my = -((e.clientY / window.innerHeight) * 2 - 1); };
    window.addEventListener("mousemove", onMouse);
    const clock = new THREE.Clock();
    let raf: number;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      moon.rotation.y = t * 0.07 + mx * 0.28;
      moon.rotation.x = my * 0.16;
      moon.position.y = Math.sin(t * 0.45) * 0.07;
      (mat.uniforms.uTime as {value:number}).value = t;
      (mat.uniforms.uMouse as {value:THREE.Vector2}).value.set(mx, my);
      renderer.render(scene, camera);
    };
    animate();
    return () => { window.removeEventListener("mousemove", onMouse); cancelAnimationFrame(raf); renderer.dispose(); if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement); };
  }, []);
  return <div ref={mountRef} style={{ width:360, height:360, filter:"drop-shadow(0 0 50px rgba(201,168,76,.4)) drop-shadow(0 0 140px rgba(100,130,220,.12))", animation:"ll-float 6s ease-in-out infinite", marginBottom:"2rem", cursor:"none" }} />;
}

/* ── Landing Page ──────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const navigate = useNavigate();
  const starsRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef  = useRef<HTMLDivElement>(null);
  const mxRef = useRef(0), myRef = useRef(0), rxRef = useRef(0), ryRef = useRef(0);

  useEffect(() => {
    const c = starsRef.current; if (!c) return;
    for (let i = 0; i < 160; i++) {
      const s = document.createElement("div");
      const sz = Math.random() * 2.8 + 0.4;
      s.style.cssText = `position:absolute;width:${sz}px;height:${sz}px;background:white;border-radius:50%;top:${Math.random()*100}%;left:${Math.random()*100}%;animation:ll-twinkle ${3+Math.random()*5}s ease-in-out infinite;animation-delay:${Math.random()*7}s;opacity:0;--op:${0.1+Math.random()*0.6};`;
      c.appendChild(s);
    }
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { mxRef.current=e.clientX; myRef.current=e.clientY; };
    document.addEventListener("mousemove", onMove);
    let raf: number;
    const tick = () => {
      if (cursorRef.current) { cursorRef.current.style.left=mxRef.current-4+"px"; cursorRef.current.style.top=myRef.current-4+"px"; }
      rxRef.current += (mxRef.current-rxRef.current-16)*0.1;
      ryRef.current += (myRef.current-ryRef.current-16)*0.1;
      if (ringRef.current) { ringRef.current.style.left=rxRef.current+"px"; ringRef.current.style.top=ryRef.current+"px"; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { document.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll(".ll-reveal");
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => { if (e.isIntersecting) { setTimeout(() => e.target.classList.add("ll-visible"), i*80); obs.unobserve(e.target); } });
    }, { threshold: 0.1 });
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const nav = (path: string) => navigate(path);

  return (
    <>
      <style>{CSS}</style>
      <div className="ll-cursor" ref={cursorRef} />
      <div className="ll-ring"   ref={ringRef} />
      <div className="ll-stars"  ref={starsRef} />
      <div className="ll-page">

        {/* ── HERO ── */}
        <section className="ll-hero">
          <ThreeMoon />
          <p className="ll-eyebrow">HackPrinceton 2026</p>
          <h1 className="ll-title"><em>DreamsComeTrue</em></h1>
          <p className="ll-tagline">Tell a story.</p>
          <p className="ll-tagline ll-tagline-gold">Watch it become a picture book.</p>
          <p className="ll-sub">Speak once. Choose your style. We turn it into illustrated pages.</p>
          <button className="ll-btn" onClick={() => nav("/picker")}
            onMouseEnter={() => ringRef.current?.classList.add("ll-ring-big")}
            onMouseLeave={() => ringRef.current?.classList.remove("ll-ring-big")}>
            <span className="ll-dot" /> Begin
          </button>
          <div className="ll-scroll-hint"><div className="ll-scroll-line" /></div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="ll-section ll-how">
          <div className="ll-container">
            <h2 className="ll-h2 ll-reveal">Speak. We'll <em>handle</em> the rest.</h2>
            <div className="ll-steps">
              {[
                {n:"I",   title:"Set the scene",   desc:"Choose your visual style and reading level. Sensible defaults are ready."},
                {n:"II",  title:"Tell your story",  desc:"Speak naturally. Pause. Wander. We transcribe, clean artifacts, and find the story inside your words."},
                {n:"III", title:"Watch it weave",   desc:"Your words transform into page art — sketches bloom, spreads paint themselves."},
                {n:"IV",  title:"Storybook finish",  desc:"A fully narrated illustrated book. AI voice, AI visuals, and page-by-page pacing."},
              ].map(s => (
                <div className="ll-step ll-reveal" key={s.n}>
                  <div className="ll-step-num">{s.n}</div>
                  <div className="ll-step-title">{s.title}</div>
                  <div className="ll-step-desc">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="ll-divider" />

        {/* ── WATERCOLOR SHOWCASE ── */}
        <section className="ll-wc-section">
          <div className="ll-container">
            <div style={{textAlign:"center",marginBottom:"3.5rem"}}>
              <h2 className="ll-h2 ll-reveal" style={{textAlign:"center",marginBottom:".75rem",fontStyle:"normal"}}>Your story, painted many ways.</h2>
            </div>
            <div className="ll-wc-grid ll-reveal">
              {[
                {name:"Watercolor Storybook", emoji:"🎨", color:"from-rose-400 to-amber-300",   bg:"rgba(251,113,133,0.12)", border:"rgba(251,113,133,0.35)", desc:"Soft Beatrix Potter warmth"},
                {name:"Studio Ghibli",        emoji:"🌿", color:"from-emerald-400 to-teal-300",  bg:"rgba(52,211,153,0.12)",  border:"rgba(52,211,153,0.35)",  desc:"Hand-painted Miyazaki skies"},
                {name:"Pixar / 3D",           emoji:"✨", color:"from-blue-400 to-violet-300",   bg:"rgba(96,165,250,0.12)",  border:"rgba(96,165,250,0.35)",  desc:"Vibrant cinematic render"},
                {name:"Paper Cutout",         emoji:"✂️", color:"from-orange-400 to-yellow-300", bg:"rgba(251,146,60,0.12)",  border:"rgba(251,146,60,0.35)",  desc:"Layered stop-motion paper"},
                {name:"Charcoal Sketch",      emoji:"🖤", color:"from-slate-400 to-zinc-300",    bg:"rgba(148,163,184,0.12)", border:"rgba(148,163,184,0.35)", desc:"Moody dreamlike lines"},
                {name:"Crayon Drawing",       emoji:"🖍️", color:"from-pink-400 to-fuchsia-300",  bg:"rgba(244,114,182,0.12)", border:"rgba(244,114,182,0.35)", desc:"Joyful childlike scrawl"},
              ].map(s => (
                <div key={s.name} className="ll-wc-card" style={{"--card-bg":s.bg,"--card-border":s.border} as React.CSSProperties}>
                  <div className="ll-wc-emoji">{s.emoji}</div>
                  <div className="ll-wc-name">{s.name}</div>
                  <div className="ll-wc-desc">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="ll-divider" />

        {/* ── QUOTE + STATS ── */}
        <section className="ll-quote-section">
          <p className="ll-big-quote ll-reveal">"A story doesn't have <em>one correct form</em>.<br />Every dream deserves its own shape."</p>
            <div className="ll-stat-row ll-reveal">
            <div className="ll-stat"><span className="ll-stat-num">120</span><span className="ll-stat-label">Unique picture book combinations<br />from one spoken story</span></div>
            <div className="ll-stat"><span className="ll-stat-num">&lt;90s</span><span className="ll-stat-label">From spoken words<br />to finished book</span></div>
            <div className="ll-stat"><span className="ll-stat-num">3</span><span className="ll-stat-label">Independent filters<br />you control</span></div>
          </div>
        </section>

        <div className="ll-divider" />

        {/* ── FILTER MATRIX ── */}
        <section className="ll-section">
          <div className="ll-container">
            <h2 className="ll-h2 ll-reveal">Your dream,<br /><em>your way.</em></h2>
            <div className="ll-filters-grid ll-reveal">
              {[
                {axis:"Axis I",   name:"Visual Style",  count:"6",   pills:["Watercolor Storybook","Pixar / 3D","Studio Ghibli","Paper Cutout","Charcoal Sketch","Crayon Drawing"], active:0},
                {axis:"Axis II",  name:"Reading Level",  count:"4",   pills:["Toddler (2–3)","Early Reader (4–6)","Grade School (7–10)","Advanced (11+)"], active:1},
              ].map(fc => (
                <div className="ll-filter-card" key={fc.name}>
                  <div className="ll-filter-axis">{fc.axis}</div>
                  <div className="ll-filter-name">{fc.name}</div>
                  <div className="ll-filter-options">
                    {fc.pills.map((p,i) => <span key={p} className={`ll-pill${i===fc.active?" ll-pill-on":""}`}>{p}</span>)}
                  </div>
                  <span className="ll-filter-count">{fc.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="ll-final">
          <div style={{width:180,height:180,background:"radial-gradient(circle at 36% 36%,#f5e8c8,#c9a84c 58%,#7a5a18)",borderRadius:"50%",margin:"0 auto 4rem",boxShadow:"0 0 80px rgba(201,168,76,.25),0 0 200px rgba(100,130,220,.08)",animation:"ll-float 6s ease-in-out infinite"}} />
          <p className="ll-final-title ll-reveal">Your story is waiting.<br />Let us bring it to life.</p>
          <button className="ll-btn ll-reveal" style={{animationDelay:".1s"}} onClick={() => nav("/picker")}
            onMouseEnter={() => ringRef.current?.classList.add("ll-ring-big")}
            onMouseLeave={() => ringRef.current?.classList.remove("ll-ring-big")}>
            <span className="ll-dot" /> Tell yours
          </button>
        </section>

        <footer className="ll-footer">
          <span className="ll-footer-logo">DreamsComeTrue</span>
          <span>HackPrinceton 2026 — Entertainment & Media</span>
          <span>Built in 36 hours</span>
        </footer>
      </div>
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Instrument+Sans:wght@300;400;500&display=swap');

@keyframes ll-twinkle{0%,100%{opacity:0;transform:scale(.7)}50%{opacity:var(--op,.4);transform:scale(1)}}
@keyframes ll-float  {0%,100%{transform:translateY(0)}50%{transform:translateY(-16px)}}
@keyframes ll-up     {from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}
@keyframes ll-drip   {0%{transform:scaleY(0);transform-origin:top;opacity:1}50%{transform:scaleY(1);transform-origin:top}51%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom;opacity:0}}
@keyframes ll-shimmer{0%{background-position:200% center}100%{background-position:-200% center}}

body{cursor:none!important;margin:0;}
.ll-cursor{position:fixed;width:9px;height:9px;background:#c9a84c;border-radius:50%;pointer-events:none;z-index:9999;mix-blend-mode:screen;}
.ll-ring{position:fixed;width:36px;height:36px;border:1px solid rgba(201,168,76,.4);border-radius:50%;pointer-events:none;z-index:9998;transition:transform .3s ease;}
.ll-ring-big{transform:scale(1.8)!important;}
.ll-stars{position:fixed;inset:0;pointer-events:none;z-index:0;}
.ll-reveal{opacity:0;transform:translateY(32px);transition:opacity .9s ease,transform .9s ease;}
.ll-visible{opacity:1!important;transform:translateY(0)!important;}

.ll-page{font-family:'Instrument Sans',sans-serif;font-weight:300;background:linear-gradient(160deg,#0c1525 0%,#070c17 55%,#0a1020 100%);color:#e8dfd0;min-height:100vh;overflow-x:hidden;}

/* HERO */
.ll-hero{position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2rem;z-index:1;}
.ll-eyebrow{font-size:.72rem;letter-spacing:.32em;text-transform:uppercase;color:#c9a84c;margin-bottom:1.2rem;opacity:0;animation:ll-up 1s ease .2s forwards;}

/* BIGGER TITLE */
.ll-title{font-family:'Cormorant Garamond',serif;font-size:clamp(2.8rem,8vw,7rem);font-weight:600;line-height:.95;letter-spacing:-.02em;color:#e8dfd0;margin:0 0 .5rem;opacity:0;animation:ll-up 1s ease .4s forwards;}
.ll-title em{font-style:italic;background:linear-gradient(135deg,#f5d78a,#c9a84c,#e8b84b);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}

/* TWO-LINE TAGLINE — bigger, bolder */
.ll-tagline{font-family:'Cormorant Garamond',serif;font-size:clamp(1.6rem,4vw,2.8rem);font-weight:300;line-height:1.2;color:rgba(232,223,208,.8);margin:0;opacity:0;animation:ll-up 1s ease .6s forwards;}
.ll-tagline-gold{font-style:italic;background:linear-gradient(90deg,#f5d78a,#c9a84c,#f5d78a);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:ll-up 1s ease .7s forwards, ll-shimmer 4s linear 1.7s infinite;margin-bottom:1.5rem;}

.ll-sub{font-family:'Instrument Sans',sans-serif;font-size:clamp(1rem,2vw,1.2rem);letter-spacing:.06em;color:rgba(232,223,208,.35);max-width:480px;line-height:1.75;margin-bottom:3rem;opacity:0;animation:ll-up 1s ease .9s forwards;}

.ll-btn{display:inline-flex;align-items:center;gap:.75rem;padding:1.1rem 2.8rem;border:1px solid rgba(201,168,76,.5);border-radius:100px;font-family:'Instrument Sans',sans-serif;font-size:.85rem;letter-spacing:.16em;text-transform:uppercase;color:#e8dfd0;background:transparent;cursor:none;transition:all .4s ease;position:relative;overflow:hidden;opacity:0;animation:ll-up 1s ease 1.1s forwards;}
.ll-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,#c9a84c,#e8b84b);transform:scaleX(0);transform-origin:left;transition:transform .4s ease;z-index:-1;}
.ll-btn:hover{color:#0c1525;border-color:#c9a84c;letter-spacing:.2em;}
.ll-btn:hover::before{transform:scaleX(1);}
.ll-btn:hover .ll-dot{background:#0c1525;}
.ll-dot{width:7px;height:7px;background:#c9a84c;border-radius:50%;transition:background .4s;flex-shrink:0;}
.ll-scroll-hint{position:absolute;bottom:2.5rem;left:50%;transform:translateX(-50%);opacity:0;animation:ll-up 1s ease 1.6s forwards;}
.ll-scroll-line{width:1px;height:52px;background:linear-gradient(to bottom,rgba(201,168,76,.6),transparent);animation:ll-drip 2.2s ease-in-out infinite;}

/* SECTIONS */
.ll-section{position:relative;z-index:1;padding:8rem 2rem;}
.ll-container{max-width:1140px;margin:0 auto;}
.ll-label{font-size:.62rem;letter-spacing:.35em;text-transform:uppercase;color:#c9a84c;margin-bottom:1rem;}
.ll-h2{font-family:'Cormorant Garamond',serif;font-size:clamp(2.8rem,7vw,5.5rem);font-weight:400;line-height:1.08;color:#e8dfd0;margin-bottom:4rem;}
.ll-h2 em{font-style:italic;color:#c9a84c;}
.ll-how{background:linear-gradient(to bottom,transparent,rgba(26,39,68,.35),transparent);}
.ll-divider{height:1px;background:linear-gradient(to right,transparent,rgba(201,168,76,.2),transparent);margin:0 2rem;}

/* STEPS */
.ll-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));position:relative;}
.ll-steps::before{content:'';position:absolute;top:28px;left:8%;right:8%;height:1px;background:linear-gradient(to right,transparent,rgba(201,168,76,.22),transparent);}
.ll-step{padding:0 2rem 0 0;}
.ll-step-num{width:64px;height:64px;border:1px solid rgba(201,168,76,.35);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:1.4rem;color:#c9a84c;margin-bottom:1.65rem;background:#070c17;position:relative;z-index:1;}
.ll-step-title{font-family:'Cormorant Garamond',serif;font-size:1.55rem;color:#e8dfd0;margin-bottom:.75rem;line-height:1.15;}
.ll-step-desc{font-size:.95rem;line-height:1.8;color:rgba(232,223,208,.5);}

/* WATERCOLOR SECTION */
.ll-wc-section{padding:8rem 2rem;position:relative;z-index:1;}
.ll-wc-section::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(201,168,76,.04) 0%,transparent 70%);pointer-events:none;}
.ll-wc-subhead{font-family:'Cormorant Garamond',serif;font-size:clamp(1rem,2vw,1.4rem);font-style:italic;color:rgba(232,223,208,.38);letter-spacing:.08em;margin:0 auto 0;text-align:center;}
.ll-wc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem;margin-top:0;max-width:900px;margin-left:auto;margin-right:auto;}
.ll-wc-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:20px;padding:2rem;position:relative;overflow:hidden;transition:transform .35s ease,box-shadow .35s ease;cursor:none;}
.ll-wc-card::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 70% 30%,var(--card-bg) 0%,transparent 70%);opacity:.5;pointer-events:none;}
.ll-wc-card:hover{transform:translateY(-6px) scale(1.02);box-shadow:0 20px 60px rgba(0,0,0,.4);}
.ll-wc-emoji{font-size:2.5rem;margin-bottom:1rem;display:block;filter:drop-shadow(0 4px 12px rgba(0,0,0,.4));}
.ll-wc-name{font-family:'Cormorant Garamond',serif;font-size:1.65rem;font-weight:500;color:#e8dfd0;margin-bottom:.55rem;line-height:1.15;}
.ll-wc-desc{font-size:.92rem;color:rgba(232,223,208,.55);letter-spacing:.035em;line-height:1.45;}

/* QUOTE */
.ll-quote-section{text-align:center;padding:7rem 2rem;}
.ll-big-quote{font-family:'Cormorant Garamond',serif;font-size:clamp(1.8rem,4.5vw,3.2rem);font-weight:300;font-style:italic;line-height:1.4;color:rgba(232,223,208,.7);max-width:860px;margin:0 auto 2rem;}
.ll-big-quote em{color:#c9a84c;font-style:normal;}
.ll-quote-attr{font-size:.68rem;letter-spacing:.25em;text-transform:uppercase;color:rgba(232,223,208,.18);}
.ll-stat-row{display:flex;gap:1px;background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.08);margin-top:6rem;}
.ll-stat{flex:1;padding:3.5rem 2rem;background:#0c1525;text-align:center;}
.ll-stat-num{font-family:'Cormorant Garamond',serif;font-size:clamp(3rem,7vw,5rem);font-weight:300;color:#c9a84c;line-height:1;display:block;margin-bottom:.75rem;}
.ll-stat-label{font-size:.68rem;letter-spacing:.15em;text-transform:uppercase;color:rgba(232,223,208,.3);}

/* FILTER MATRIX */
.ll-filters-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.08);margin-top:4rem;}
.ll-filter-card{background:#0c1525;padding:2.5rem;position:relative;overflow:hidden;transition:background .4s;}
.ll-filter-card:hover{background:rgba(20,35,60,.9);}
.ll-filter-card::before{content:'';position:absolute;top:0;left:0;width:3px;height:0;background:linear-gradient(to bottom,#c9a84c,#e8b84b);transition:height .4s ease;}
.ll-filter-card:hover::before{height:100%;}
.ll-filter-axis{font-size:.58rem;letter-spacing:.32em;text-transform:uppercase;color:#c9a84c;margin-bottom:.7rem;}
.ll-filter-name{font-family:'Cormorant Garamond',serif;font-size:1.9rem;font-weight:400;color:#e8dfd0;margin-bottom:1rem;}
.ll-filter-options{display:flex;flex-wrap:wrap;gap:.45rem;}
.ll-pill{font-size:.7rem;padding:.3rem .75rem;border:1px solid rgba(232,223,208,.1);border-radius:100px;color:rgba(232,223,208,.38);letter-spacing:.04em;transition:all .25s;}
.ll-pill-on{border-color:rgba(201,168,76,.5)!important;color:#c9a84c!important;}
.ll-filter-count{position:absolute;bottom:1.8rem;right:2.2rem;font-family:'Cormorant Garamond',serif;font-size:3.2rem;font-weight:300;color:rgba(201,168,76,.05);line-height:1;}

/* FINAL */
.ll-final{text-align:center;padding:10rem 2rem;}
.ll-final-title{font-family:'Cormorant Garamond',serif;font-size:clamp(2.2rem,5.5vw,4rem);font-weight:300;font-style:italic;color:rgba(232,223,208,.78);margin-bottom:3rem;}
.ll-footer{border-top:1px solid rgba(232,223,208,.05);padding:2.5rem;display:flex;justify-content:space-between;align-items:center;font-size:.7rem;color:rgba(232,223,208,.16);letter-spacing:.08em;position:relative;z-index:1;}
.ll-footer-logo{font-family:'Cormorant Garamond',serif;font-size:1.15rem;font-weight:300;color:rgba(232,223,208,.32);}
@media(max-width:640px){.ll-steps{grid-template-columns:1fr 1fr;gap:2rem}.ll-steps::before{display:none}.ll-filters-grid{grid-template-columns:1fr}.ll-stat-row{flex-direction:column}.ll-footer{flex-direction:column;gap:1rem;text-align:center}.ll-wc-grid{grid-template-columns:1fr}}
`;
