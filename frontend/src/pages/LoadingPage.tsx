import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getJob } from "../api/jobs";
import type { JobRecord, JobStage } from "../types/job";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type EffectCallback = () => void | (() => void);

const useState = (React as any).useState as <T>(initial: T) => [T, StateSetter<T>];
const useEffect = (React as any).useEffect as (effect: EffectCallback, deps?: readonly unknown[]) => void;
const useRef = (React as any).useRef as <T>(initial: T) => { current: T };

type LoadingLocationState = { jobId?: string };

function prettyStage(stage: JobStage | null): string {
  if (!stage) return "queued";
  return stage.replaceAll("_", " ");
}

export default function LoadingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LoadingLocationState | null) ?? null;
  const jobId = state?.jobId ?? "";

  const [stage, setStage] = useState<JobStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [etaSeconds, setEtaSeconds] = useState(0);

  const cursorRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const mouseXRef = useRef(0);
  const mouseYRef = useRef(0);
  const ringXRef = useRef(0);
  const ringYRef = useRef(0);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      mouseXRef.current = event.clientX;
      mouseYRef.current = event.clientY;
    };

    document.addEventListener("mousemove", onMove);

    let raf = 0;
    const tick = () => {
      const cursor = cursorRef.current;
      const ring = ringRef.current;

      if (cursor) {
        cursor.style.left = `${mouseXRef.current - 4}px`;
        cursor.style.top = `${mouseYRef.current - 4}px`;
      }

      ringXRef.current += (mouseXRef.current - ringXRef.current - 17) * 0.1;
      ringYRef.current += (mouseYRef.current - ringYRef.current - 17) * 0.1;

      if (ring) {
        ring.style.left = `${ringXRef.current}px`;
        ring.style.top = `${ringYRef.current}px`;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (!jobId) {
      setError("Missing job id. Please record and generate again.");
      return;
    }

    let canceled = false;

    const poll = async () => {
      try {
        const job: JobRecord = await getJob(jobId);
        if (canceled) return;

        setStage(job.stage);

        if (job.stage === "ready") {
          navigate("/book", { state: { jobId } });
          return;
        }

        if (job.stage === "failed") {
          setError(job.error ?? "Generation failed.");
          return;
        }

        setTimeout(() => {
          void poll();
        }, 1200);
      } catch (pollError) {
        if (!canceled) {
          setError(pollError instanceof Error ? pollError.message : "Unable to check generation status.");
        }
      }
    };

    void poll();

    return () => {
      canceled = true;
    };
  }, [jobId, navigate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setEtaSeconds((value) => value + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Instrument+Sans:wght@300;400;500&display=swap');
        body{cursor:none!important;margin:0;background:linear-gradient(145deg,#0c1525 0%,#070c17 55%,#0d1020 100%);}
        .ld-cursor{position:fixed;width:8px;height:8px;background:#c9a84c;border-radius:50%;pointer-events:none;z-index:9999;mix-blend-mode:screen;}
        .ld-ring{position:fixed;width:34px;height:34px;border:1px solid rgba(201,168,76,.35);border-radius:50%;pointer-events:none;z-index:9998;}
        .ld-page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;position:relative;overflow:hidden;color:#e8dfd0;font-family:'Instrument Sans',sans-serif;}
        .ld-page::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 20% 20%,rgba(167,139,250,.1),transparent 34%),radial-gradient(circle at 80% 8%,rgba(96,165,250,.08),transparent 30%),radial-gradient(circle at 50% 115%,rgba(201,168,76,.12),transparent 44%);pointer-events:none;}
        .ld-shell{position:relative;z-index:1;width:min(760px,100%);border:1px solid rgba(232,223,208,.1);border-radius:26px;background:rgba(12,20,38,.58);padding:2.3rem 2rem;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.32);}
        .ld-step{font-size:.68rem;letter-spacing:.3em;text-transform:uppercase;color:#c9a84c;margin:0 0 .9rem;}
        .ld-title{font-family:'Cormorant Garamond',serif;font-size:clamp(2.3rem,5vw,3.7rem);font-weight:400;line-height:1.05;margin:0 0 .8rem;}
        .ld-title em{font-style:italic;color:#c9a84c;}
        .ld-sub{margin:0 auto 1.6rem;max-width:560px;font-size:1rem;line-height:1.75;color:rgba(232,223,208,.65);}
        .ld-spinner{width:60px;height:60px;border-radius:50%;border:3px solid rgba(201,168,76,.25);border-top-color:#c9a84c;margin:0 auto;animation:ld-spin .9s linear infinite;}
        @keyframes ld-spin{to{transform:rotate(360deg)}}
        .ld-status{margin:1.4rem 0 .25rem;font-size:.76rem;letter-spacing:.16em;text-transform:uppercase;color:rgba(232,223,208,.55);}
        .ld-stage{font-family:'Cormorant Garamond',serif;font-size:1.5rem;color:#e8dfd0;font-style:italic;}
        .ld-meta{margin-top:1.2rem;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:rgba(232,223,208,.4);}
        .ld-error{max-width:560px;margin:1rem auto 1.2rem;color:#fecaca;font-size:.9rem;line-height:1.6;}
        .ld-btn-row{display:flex;justify-content:center;gap:.8rem;flex-wrap:wrap;margin-top:1rem;}
        .ld-btn{display:inline-flex;align-items:center;justify-content:center;padding:.72rem 1.2rem;border-radius:999px;border:1px solid rgba(201,168,76,.45);background:transparent;color:#e8dfd0;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;cursor:none;}
        .ld-btn:hover{background:#c9a84c;color:#0d1628;}
      `}</style>

      <div className="ld-cursor" ref={cursorRef} />
      <div className="ld-ring" ref={ringRef} />

      <div className="ld-page">
        <div className="ld-shell">
          <p className="ld-step">Building storybook</p>
          <h1 className="ld-title">We are painting your <em>pages</em>.</h1>
          <p className="ld-sub">Sit tight while we transcribe, clean, split, and illustrate your narration into a complete picture book.</p>

          {!error ? (
            <>
              <div className="ld-spinner" />
              <p className="ld-status">Current stage</p>
              <div className="ld-stage">{prettyStage(stage)}</div>
              <p className="ld-meta">Elapsed: {etaSeconds}s</p>
            </>
          ) : (
            <>
              <p className="ld-error">{error}</p>
              <div className="ld-btn-row">
                <button type="button" className="ld-btn" onClick={() => navigate("/record")}>Back to record</button>
                <button type="button" className="ld-btn" onClick={() => navigate("/picker")}>Back to picker</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
