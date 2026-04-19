import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getJob } from "../api/jobs";
import type { JobRecord, PictureBookPage } from "../types/job";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type EffectCallback = () => void | (() => void);

const useState = (React as any).useState as <T>(initial: T) => [T, StateSetter<T>];
const useEffect = (React as any).useEffect as (effect: EffectCallback, deps?: readonly unknown[]) => void;
const useRef = (React as any).useRef as <T>(initial: T) => { current: T };

type BookLocationState = { jobId?: string };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "storybook";
}

export default function BookPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as BookLocationState | null) ?? null;
  const jobId = state?.jobId ?? "";

  const [job, setJob] = useState<JobRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError("Missing job id. Please generate your book again.");
      setLoading(false);
      return;
    }

    let canceled = false;

    const load = async () => {
      try {
        const nextJob = await getJob(jobId);
        if (!canceled) {
          setJob(nextJob);
          if (nextJob.stage !== "ready") {
            setError("Your book is not ready yet.");
          }
        }
      } catch (loadError) {
        if (!canceled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load storybook.");
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    void load();

    return () => {
      canceled = true;
    };
  }, [jobId]);

  const storyTitle = job?.result?.bookTitle ?? "Your picture book";
  const pages: PictureBookPage[] = job?.result?.pages ?? [];
  const paragraphs = job?.result?.pictureBookParagraphs ?? pages.map((page) => page.paragraph);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Instrument+Sans:wght@300;400;500&display=swap');
        body{cursor:none!important;margin:0;background:linear-gradient(145deg,#0c1525 0%,#070c17 55%,#0d1020 100%);}
        .bk-cursor{position:fixed;width:8px;height:8px;background:#c9a84c;border-radius:50%;pointer-events:none;z-index:9999;mix-blend-mode:screen;}
        .bk-ring{position:fixed;width:34px;height:34px;border:1px solid rgba(201,168,76,.35);border-radius:50%;pointer-events:none;z-index:9998;}
        .bk-page{min-height:100vh;padding:2rem 1.2rem 3rem;position:relative;overflow:hidden;color:#e8dfd0;font-family:'Instrument Sans',sans-serif;}
        .bk-page::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 20% 20%,rgba(167,139,250,.1),transparent 34%),radial-gradient(circle at 80% 8%,rgba(96,165,250,.08),transparent 30%),radial-gradient(circle at 50% 115%,rgba(201,168,76,.12),transparent 44%);pointer-events:none;}
        .bk-shell{position:relative;z-index:1;max-width:1120px;margin:0 auto;}
        .bk-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1.2rem;}
        .bk-title-wrap h1{margin:.3rem 0 0;font-family:'Cormorant Garamond',serif;font-size:clamp(2.2rem,5vw,3.4rem);font-weight:400;line-height:1.05;}
        .bk-title-wrap p{margin:0;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:#c9a84c;}
        .bk-btn{display:inline-flex;align-items:center;justify-content:center;padding:.72rem 1.15rem;border-radius:999px;border:1px solid rgba(201,168,76,.45);background:transparent;color:#e8dfd0;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;cursor:none;}
        .bk-btn:hover{background:#c9a84c;color:#0d1628;}
        .bk-panel{border:1px solid rgba(232,223,208,.1);border-radius:26px;background:rgba(12,20,38,.56);box-shadow:0 24px 70px rgba(0,0,0,.32);padding:1.1rem;}
        .bk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem;}
        .bk-card{border:1px solid rgba(232,223,208,.1);border-radius:20px;background:rgba(8,12,22,.45);overflow:hidden;display:flex;flex-direction:column;}
        .bk-art{position:relative;aspect-ratio:4/5;background:#111a2d;}
        .bk-art img{width:100%;height:100%;object-fit:cover;display:block;}
        .bk-num{position:absolute;top:12px;left:12px;padding:.32rem .62rem;border-radius:999px;background:rgba(8,12,22,.7);font-size:.64rem;letter-spacing:.14em;text-transform:uppercase;color:#c9a84c;}
        .bk-copy{padding:.95rem;display:flex;flex-direction:column;gap:.75rem;}
        .bk-copy p{margin:0;line-height:1.75;color:rgba(232,223,208,.86);font-size:.95rem;}
        .bk-note{font-size:.68rem;letter-spacing:.13em;text-transform:uppercase;color:rgba(232,223,208,.46);}
        .bk-summary{margin-top:1rem;border:1px solid rgba(232,223,208,.1);border-radius:20px;background:rgba(8,12,22,.35);padding:1rem;}
        .bk-summary h2{margin:0 0 .7rem;font-size:.72rem;letter-spacing:.17em;text-transform:uppercase;color:#c9a84c;}
        .bk-summary ol{margin:0;padding-left:1.2rem;line-height:1.8;color:rgba(232,223,208,.85);}
        .bk-status{text-align:center;padding:2.2rem 1rem;border:1px solid rgba(232,223,208,.1);border-radius:20px;background:rgba(8,12,22,.36);}
        .bk-status h2{margin:0 0 .6rem;font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:400;}
        .bk-status p{margin:0;color:rgba(232,223,208,.64);line-height:1.7;}
      `}</style>

      <div className="bk-cursor" ref={cursorRef} />
      <div className="bk-ring" ref={ringRef} />

      <div className="bk-page">
        <div className="bk-shell">
          <div className="bk-top">
            <div className="bk-title-wrap">
              <p>Generated picture book</p>
              <h1>{storyTitle}</h1>
            </div>
            <div style={{ display: "flex", gap: ".7rem", flexWrap: "wrap" }}>
              <button type="button" className="bk-btn" onClick={() => navigate("/record")}>Record another</button>
              <button type="button" className="bk-btn" onClick={() => navigate("/picker")}>Change filters</button>
            </div>
          </div>

          {loading ? (
            <div className="bk-status">
              <h2>Opening your book...</h2>
              <p>Loading your generated pages now.</p>
            </div>
          ) : error ? (
            <div className="bk-status">
              <h2>Unable to show book</h2>
              <p>{error}</p>
            </div>
          ) : (
            <>
              <div className="bk-panel">
                <div className="bk-grid">
                  {pages.map((page) => (
                    <article className="bk-card" key={page.index}>
                      <div className="bk-art">
                        <span className="bk-num">Page {page.index + 1}</span>
                        <img src={page.imageDataUrl} alt={`Illustration for page ${page.index + 1}`} />
                      </div>
                      <div className="bk-copy">
                        <p>{page.paragraph}</p>
                        <span className="bk-note">{page.imageProvider}{page.imageModel ? ` · ${page.imageModel}` : ""}</span>
                        <a className="bk-btn" href={page.imageDataUrl} download={`${slugify(storyTitle)}-page-${String(page.index + 1).padStart(2, "0")}.jpg`}>Download page</a>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="bk-summary">
                <h2>Story paragraphs</h2>
                {paragraphs.length > 0 ? (
                  <ol>
                    {paragraphs.map((paragraph, index) => (
                      <li key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</li>
                    ))}
                  </ol>
                ) : (
                  <p style={{ margin: 0, color: "rgba(232,223,208,.7)" }}>No paragraphs were returned for this run.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
