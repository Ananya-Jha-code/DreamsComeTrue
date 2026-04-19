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
  const [currentPage, setCurrentPage] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<"next" | "prev">("next");

  const cursorRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const mouseXRef = useRef(0);
  const mouseYRef = useRef(0);
  const ringXRef = useRef(0);
  const ringYRef = useRef(0);
  const flipTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (flipTimerRef.current !== null) {
        window.clearTimeout(flipTimerRef.current);
      }
    };
  }, []);

  const storyTitle = job?.result?.bookTitle ?? "Your picture book";
  const pages: PictureBookPage[] = job?.result?.pages ?? [];
  const paragraphs = job?.result?.pictureBookParagraphs ?? pages.map((page) => page.paragraph);

  useEffect(() => {
    setCurrentPage(0);
    setIsFlipping(false);
  }, [jobId, pages.length]);

  const canGoBack = currentPage > 0;
  const canGoForward = currentPage < pages.length - 1;
  const activePage = pages[currentPage] ?? null;
  const activeParagraph = activePage?.paragraph ?? paragraphs[currentPage] ?? "";

  const turnPage = (direction: "next" | "prev") => {
    if (isFlipping) return;
    if (direction === "next" && !canGoForward) return;
    if (direction === "prev" && !canGoBack) return;

    setFlipDirection(direction);
    setIsFlipping(true);

    if (flipTimerRef.current !== null) {
      window.clearTimeout(flipTimerRef.current);
    }

    flipTimerRef.current = window.setTimeout(() => {
      setCurrentPage((current) => (direction === "next" ? current + 1 : current - 1));
      setIsFlipping(false);
      flipTimerRef.current = null;
    }, 460);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") turnPage("next");
      if (event.key === "ArrowLeft") turnPage("prev");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Instrument+Sans:wght@300;400;500&family=Playfair+Display:wght@500;600;700&display=swap');
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
        .bk-reader{display:flex;flex-direction:column;gap:1rem;}
        .bk-book{position:relative;perspective:1800px;}
        .bk-book-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr);gap:1rem;align-items:center;}
        .bk-spread{position:relative;display:grid;grid-template-columns:1fr 1fr;min-height:min(70vh,620px);border-radius:22px;overflow:hidden;background:linear-gradient(180deg,#f1e3c8 0%,#ebd8b4 55%,#ddc49a 100%);box-shadow:0 28px 60px rgba(0,0,0,.3);transform-style:preserve-3d;}
        .bk-spread::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:1px;background:linear-gradient(180deg,rgba(90,63,23,.15),rgba(90,63,23,.35),rgba(90,63,23,.12));transform:translateX(-50%);}
        .bk-spread.is-flipping-next{animation:bk-flip-next .46s ease;}
        .bk-spread.is-flipping-prev{animation:bk-flip-prev .46s ease;}
        .bk-leaf{display:flex;flex-direction:column;min-height:100%;padding:1.2rem;}
        .bk-leaf-left{border-right:1px solid rgba(99,71,28,.15);background:linear-gradient(90deg,rgba(255,250,239,.9) 0%,rgba(252,244,228,.8) 100%);}
        .bk-leaf-right{position:relative;background:linear-gradient(90deg,rgba(248,237,214,.8) 0%,rgba(238,220,186,.95) 100%);}
        .bk-art{position:relative;aspect-ratio:4/5;background:#111a2d;border-radius:14px;overflow:hidden;box-shadow:0 16px 36px rgba(0,0,0,.22);}
        .bk-art img{width:100%;height:100%;object-fit:cover;display:block;}
        .bk-num{position:absolute;top:12px;left:12px;padding:.32rem .62rem;border-radius:999px;background:rgba(8,12,22,.7);font-size:.64rem;letter-spacing:.14em;text-transform:uppercase;color:#c9a84c;}
        .bk-story-kicker{font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:rgba(72,52,20,.66);}
        .bk-copy{display:flex;flex-direction:column;justify-content:space-between;gap:.95rem;height:100%;}
        .bk-copy p{margin:0;color:#2a1c12;line-height:1.85;font-size:clamp(1.2rem,1.9vw,1.45rem);font-family:'Playfair Display',serif;font-weight:600;}
        .bk-note{font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:rgba(50,35,12,.52);}
        .bk-key-hint{font-size:.84rem;letter-spacing:.08em;color:rgba(50,35,12,.78);font-weight:600;}
        .bk-reader-footer{display:flex;align-items:center;justify-content:space-between;gap:.8rem;flex-wrap:wrap;}
        .bk-nav{display:flex;align-items:center;gap:.7rem;}
        .bk-nav-btn{min-width:120px;}
        .bk-nav-btn[disabled]{opacity:.35;pointer-events:none;}
        .bk-page-indicator{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(232,223,208,.72);}
        .bk-side-nav{position:absolute;left:-26px;right:-26px;top:50%;transform:translateY(-50%);display:flex;justify-content:space-between;align-items:center;pointer-events:none;z-index:20;}
        .bk-arrow-btn{width:52px;height:52px;border-radius:50%;border:1px solid rgba(201,168,76,.45);background:rgba(9,14,25,.65);color:#f6e8c3;font-size:1.45rem;line-height:1;display:flex;align-items:center;justify-content:center;cursor:none;}
        .bk-side-nav .bk-arrow-btn{pointer-events:auto;}
        .bk-arrow-btn:hover{background:#c9a84c;color:#0d1628;}
        .bk-arrow-btn[disabled]{opacity:.35;pointer-events:none;}
        .bk-download-wrap{display:flex;justify-content:center;margin-top:1rem;}
        .bk-download-btn{background:#0f1e35;color:#f6e8c3;border-color:rgba(201,168,76,.75);}
        .bk-download-btn:hover{background:#c9a84c;color:#0d1628;}
        @keyframes bk-flip-next{0%{transform:rotateY(0deg) scale(1);}40%{transform:rotateY(-14deg) scale(.99);}100%{transform:rotateY(0deg) scale(1);}}
        @keyframes bk-flip-prev{0%{transform:rotateY(0deg) scale(1);}40%{transform:rotateY(14deg) scale(.99);}100%{transform:rotateY(0deg) scale(1);}}
        .bk-summary{margin-top:1rem;border:1px solid rgba(232,223,208,.1);border-radius:20px;background:rgba(8,12,22,.35);padding:1rem;}
        .bk-summary h2{margin:0 0 .7rem;font-size:.72rem;letter-spacing:.17em;text-transform:uppercase;color:#c9a84c;}
        .bk-summary ol{margin:0;padding-left:1.2rem;line-height:1.8;color:rgba(232,223,208,.85);}
        .bk-status{text-align:center;padding:2.2rem 1rem;border:1px solid rgba(232,223,208,.1);border-radius:20px;background:rgba(8,12,22,.36);}
        .bk-status h2{margin:0 0 .6rem;font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:400;}
        .bk-status p{margin:0;color:rgba(232,223,208,.64);line-height:1.7;}
        @media (max-width: 860px){
          .bk-book-row{grid-template-columns:1fr;}
          .bk-side-nav{position:static;left:auto;right:auto;top:auto;transform:none;justify-content:center;gap:.8rem;pointer-events:auto;}
          .bk-spread{grid-template-columns:1fr;min-height:auto;}
          .bk-spread::before{display:none;}
          .bk-leaf-left{border-right:none;border-bottom:1px solid rgba(99,71,28,.15);}
          .bk-nav-btn{min-width:0;}
        }
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
                <div className="bk-reader">
                  <div className="bk-book">
                    <div className="bk-book-row">
                      <article className={`bk-spread ${isFlipping ? `is-flipping-${flipDirection}` : ""}`}>
                        <section className="bk-leaf bk-leaf-left">
                          <div className="bk-copy">
                            <div style={{ display: "grid", gap: ".8rem" }}>
                              <span className="bk-story-kicker">Page {currentPage + 1} narration</span>
                              <p>{activeParagraph || "No paragraph was generated for this page."}</p>
                            </div>
                            <span className="bk-note bk-key-hint">Use left/right arrow keys to turn pages</span>
                          </div>
                        </section>

                        <section className="bk-leaf bk-leaf-right">
                          {activePage ? (
                            <>
                              <div className="bk-art">
                                <span className="bk-num">Page {activePage.index + 1}</span>
                                <img src={activePage.imageDataUrl} alt={`Illustration for page ${activePage.index + 1}`} />
                              </div>
                            </>
                          ) : (
                            <div className="bk-status" style={{ margin: 0 }}>
                              <h2>Missing page</h2>
                              <p>This book page is unavailable.</p>
                            </div>
                          )}
                        </section>
                      </article>

                      <div className="bk-side-nav" aria-label="Page navigation">
                        <button type="button" className="bk-arrow-btn" disabled={!canGoBack || isFlipping} onClick={() => turnPage("prev")} aria-label="Previous page">←</button>
                        <button type="button" className="bk-arrow-btn" disabled={!canGoForward || isFlipping} onClick={() => turnPage("next")} aria-label="Next page">→</button>
                      </div>
                    </div>
                  </div>

                  <div className="bk-reader-footer" style={{ justifyContent: "center" }}>
                    <span className="bk-page-indicator">Page {Math.min(currentPage + 1, Math.max(pages.length, 1))} of {Math.max(pages.length, 1)}</span>
                  </div>
                </div>
              </div>

              {activePage ? (
                <div className="bk-download-wrap">
                  <a className="bk-btn bk-download-btn" href={activePage.imageDataUrl} download={`${slugify(storyTitle)}-page-${String(activePage.index + 1).padStart(2, "0")}.jpg`}>Download page</a>
                </div>
              ) : null}

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
