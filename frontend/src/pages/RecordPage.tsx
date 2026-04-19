import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { defaultFilters, getFilterLabel } from "../filters";
import { createJob, getJob } from "../api/jobs";
import type { JobRecord, JobStage, PictureBookPage, StoryFilters } from "../types/job";

type RecordLocationState = { filters?: StoryFilters };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "storybook";
}

export default function RecordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as RecordLocationState | null) ?? null;
  const filters = state?.filters ?? defaultFilters;

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStage, setJobStage] = useState<JobStage | null>(null);
  const [jobResult, setJobResult] = useState<JobRecord["result"] | null>(null);
  const [generating, setGenerating] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  const storyTitle = jobResult?.bookTitle ?? "Your picture book";
  const pages: PictureBookPage[] = jobResult?.pages ?? [];
  const paragraphs = jobResult?.pictureBookParagraphs ?? pages.map((page) => page.paragraph);

  const buildPageFilename = (page: PictureBookPage) => {
    const index = String(page.index + 1).padStart(2, "0");
    return `${slugify(storyTitle)}-page-${index}.jpg`;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    const draw = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const bars = 44;
      const barW = canvas.width / bars;
      for (let i = 0; i < bars; i += 1) {
        const active = recording;
        const height = active
          ? (Math.sin(frame * 0.08 + i * 0.3) * 0.5 + 0.5) * canvas.height * 0.72 + 4
          : 4;
        const alpha = active ? 0.65 + Math.sin(frame * 0.06 + i * 0.2) * 0.25 : 0.16;
        ctx.fillStyle = `rgba(130, 84, 32, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(i * barW + barW * 0.18, (canvas.height - height) / 2, barW * 0.64, height, 4);
        ctx.fill();
      }
      frame += 1;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [recording]);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("Your browser does not support microphone recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }

        if (audioChunksRef.current.length === 0) {
          setAudioBlob(null);
          setAudioUrl(null);
          return;
        }

        const recordedBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setAudioBlob(recordedBlob);
        const nextAudioUrl = URL.createObjectURL(recordedBlob);
        audioUrlRef.current = nextAudioUrl;
        setAudioUrl(nextAudioUrl);
      };

      setMicError(null);
      setSubmitError(null);
      setJobId(null);
      setJobStage(null);
      setJobResult(null);
      setDone(false);
      setAudioUrl(null);
      setAudioBlob(null);
      setSeconds(0);
      setRecording(true);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);

      recorder.start();
    } catch {
      setMicError("Microphone access was denied. Please allow microphone permission and try again.");
    }
  };

  const stopRecording = () => {
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setDone(true);
  };

  const toggleRecording = async () => {
    if (done) return;
    if (recording) {
      stopRecording();
      return;
    }
    await startRecording();
  };

  const resetRecording = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }

    setDone(false);
    setRecording(false);
    setSeconds(0);
    setMicError(null);
    setAudioUrl(null);
    setAudioBlob(null);
    setSubmitError(null);
    setJobId(null);
    setJobStage(null);
    setJobResult(null);
    setGenerating(false);

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const pollJobUntilFinished = async (id: string) => {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const job = await getJob(id);
      setJobStage(job.stage);
      setJobResult(job.result ?? null);

      if (job.stage === "ready") return;
      if (job.stage === "failed") {
        throw new Error(job.error ?? "Pipeline failed.");
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    throw new Error("The picture book is still generating. Please wait and try again.");
  };

  const handleGenerateBook = async () => {
    if (!audioBlob) {
      setSubmitError("Please record your story first.");
      return;
    }

    try {
      setSubmitError(null);
      setGenerating(true);

      const created = await createJob(audioBlob, filters);
      setJobId(created.jobId);
      setJobStage(created.stage as JobStage);

      await pollJobUntilFinished(created.jobId);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to generate picture book.");
    } finally {
      setGenerating(false);
    }
  };

  const fmt = (value: number) =>
    `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Instrument+Sans:wght@300;400;500&display=swap');
        body{cursor:auto!important;margin:0;background:radial-gradient(circle at top,#f7f0e4 0%,#efe3cd 40%,#dcc8a5 100%);}
        @keyframes pb-pulse{0%,100%{box-shadow:0 0 0 0 rgba(130,84,32,.22)}50%{box-shadow:0 0 0 20px rgba(130,84,32,0)}}
        @keyframes pb-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        .pb-page{min-height:100vh;color:#2a2116;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem 1.5rem 4rem;text-align:center;position:relative;overflow:hidden;}
        .pb-page::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 20% 20%,rgba(255,255,255,.36),transparent 30%),radial-gradient(circle at 80% 10%,rgba(255,255,255,.26),transparent 26%),radial-gradient(circle at 50% 120%,rgba(90,60,20,.18),transparent 40%);pointer-events:none;}
        .pb-shell{width:min(1120px,100%);position:relative;z-index:1;}
        .pb-back{position:absolute;top:0;left:0;background:none;border:1px solid rgba(42,33,22,.15);color:rgba(42,33,22,.65);border-radius:999px;padding:.7rem 1.15rem;font-family:'Instrument Sans',sans-serif;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;}
        .pb-step{font-family:'Instrument Sans',sans-serif;font-size:.66rem;letter-spacing:.34em;text-transform:uppercase;color:rgba(42,33,22,.45);margin:0 0 1rem;}
        .pb-title{font-family:'Cormorant Garamond',serif;font-size:clamp(2.7rem,6.5vw,4.8rem);font-weight:400;line-height:1.03;margin:0 0 .9rem;animation:pb-up .65s ease both;}
        .pb-title em{font-style:italic;color:#8a5a22;}
        .pb-sub{font-family:'Instrument Sans',sans-serif;font-size:clamp(.95rem,1.9vw,1.05rem);line-height:1.7;color:rgba(42,33,22,.62);max-width:680px;margin:0 auto 1.8rem;animation:pb-up .75s ease .05s both;}
        .pb-micro{font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:rgba(42,33,22,.35);margin-top:.8rem;}
        .pb-record-btn{width:94px;height:94px;border-radius:50%;border:1px solid rgba(130,84,32,.38);background:rgba(255,255,255,.34);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .25s ease, background .25s ease, border-color .25s ease;}
        .pb-record-btn:hover{transform:translateY(-2px);background:rgba(255,255,255,.58);border-color:rgba(130,84,32,.6);}
        .pb-record-btn.active{background:rgba(130,84,32,.12);animation:pb-pulse 1.6s ease-in-out infinite;}
        .pb-stop{width:26px;height:26px;border-radius:6px;background:#8a5a22;}
        .pb-dot{width:22px;height:22px;border-radius:50%;background:#8a5a22;}
        .pb-bar{width:100%;max-width:540px;height:92px;margin:0 auto 1.75rem;border-radius:22px;border:1px solid rgba(130,84,32,.12);background:rgba(255,255,255,.48);overflow:hidden;backdrop-filter:blur(10px);}
        .pb-btn-row{display:flex;flex-wrap:wrap;gap:1rem;justify-content:center;margin:1.6rem 0 2.3rem;}
        .pb-btn{display:inline-flex;align-items:center;gap:.7rem;padding:.85rem 1.6rem;border-radius:999px;border:1px solid rgba(130,84,32,.38);background:#8a5a22;color:#fff8ee;font-family:'Instrument Sans',sans-serif;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;text-decoration:none;transition:transform .2s ease, background .2s ease;}
        .pb-btn:hover{transform:translateY(-1px);background:#744818;}
        .pb-btn.secondary{background:rgba(255,255,255,.5);color:#3c2a19;}
        .pb-btn.secondary:hover{background:rgba(255,255,255,.7);}
        .pb-pill{font-size:.7rem;padding:.35rem .85rem;border:1px solid rgba(42,33,22,.12);border-radius:999px;color:rgba(42,33,22,.62);background:rgba(255,255,255,.4);}
        .pb-panel{width:min(980px,100%);margin:1.4rem auto 0;text-align:left;border:1px solid rgba(130,84,32,.12);border-radius:28px;background:rgba(255,248,236,.72);box-shadow:0 24px 70px rgba(84,56,20,.08);overflow:hidden;}
        .pb-panel-top{padding:1.35rem 1.35rem 0;display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;}
        .pb-stage{font-family:'Instrument Sans',sans-serif;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:#8a5a22;}
        .pb-book-title{font-family:'Cormorant Garamond',serif;font-size:clamp(1.8rem,4vw,2.8rem);font-weight:400;margin:.15rem 0 0;}
        .pb-section-label{font-family:'Instrument Sans',sans-serif;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:rgba(42,33,22,.48);margin:0 0 .6rem;}
        .pb-copy{font-family:'Instrument Sans',sans-serif;font-size:.92rem;line-height:1.7;color:rgba(42,33,22,.86);margin:0;}
        .pb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:1rem;padding:1.35rem;}
        .pb-page-card{border:1px solid rgba(130,84,32,.14);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(250,243,232,.96));overflow:hidden;box-shadow:0 10px 35px rgba(84,56,20,.06);}
        .pb-page-art{position:relative;background:#fff6ea;aspect-ratio:4/5;overflow:hidden;}
        .pb-page-art img{width:100%;height:100%;object-fit:cover;display:block;}
        .pb-page-num{position:absolute;top:14px;left:14px;padding:.35rem .65rem;border-radius:999px;background:rgba(255,255,255,.88);font-family:'Instrument Sans',sans-serif;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:#8a5a22;}
        .pb-page-caption{padding:1rem 1rem 1.15rem;}
        .pb-page-caption p{margin:0;}
        .pb-page-caption .small{margin-top:.8rem;font-size:.72rem;color:rgba(42,33,22,.48);letter-spacing:.12em;text-transform:uppercase;}
        .pb-loader{padding:1.1rem 1.35rem 1.5rem;font-family:'Instrument Sans',sans-serif;color:rgba(42,33,22,.72);display:flex;align-items:center;gap:.8rem;}
        .pb-spinner{width:14px;height:14px;border-radius:50%;border:2px solid rgba(130,84,32,.25);border-top-color:#8a5a22;animation:spin .8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}
        .pb-audio{max-width:520px;width:100%;margin:0 auto 1rem;display:flex;flex-direction:column;gap:.8rem;align-items:center;}
        .pb-audio audio{width:100%;}
        .pb-error{font-family:'Instrument Sans',sans-serif;font-size:.82rem;color:#8a2e2e;max-width:640px;margin:0 auto 1rem;line-height:1.6;}
        .pb-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.9rem;padding:0 1.35rem 1.35rem;}
        .pb-summary-card{border:1px solid rgba(130,84,32,.12);border-radius:20px;background:rgba(255,255,255,.58);padding:1rem;}
        .pb-summary-card h3{font-family:'Instrument Sans',sans-serif;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:rgba(42,33,22,.46);margin:0 0 .55rem;}
        .pb-summary-card p{margin:0;font-family:'Instrument Sans',sans-serif;font-size:.92rem;line-height:1.6;color:rgba(42,33,22,.86);}
        .pb-summary-card ol{margin:0;padding-left:1.15rem;font-family:'Instrument Sans',sans-serif;font-size:.9rem;line-height:1.6;color:rgba(42,33,22,.86);}
        @media (max-width: 720px){.pb-page{padding:4.5rem 1rem 3rem}.pb-back{position:static;margin-bottom:1.25rem}.pb-panel-top{padding:1rem 1rem 0}.pb-grid,.pb-summary{padding:1rem}.pb-grid{grid-template-columns:1fr}.pb-btn-row{justify-content:flex-start}}
      `}</style>

      <div className="pb-page">
        <div className="pb-shell">
          <button type="button" onClick={() => navigate("/picker", { state: { filters } })} className="pb-back">
            ← Picker
          </button>

          <p className="pb-step">Step 2 of 2</p>
          <h1 className="pb-title">
            {done ? (
              <>
                Your story is ready to <em>illustrate</em>.
              </>
            ) : recording ? (
              <>
                Listening to your <em>story</em>
              </>
            ) : (
              <>
                Record your <em>picture book</em>
              </>
            )}
          </h1>
          <p className="pb-sub">
            Speak naturally, pause when you want, and we’ll turn the narration into a clean transcript, split it into pages, and generate illustrations that match the style you picked.
          </p>

          {micError && <p className="pb-error">{micError}</p>}
          {submitError && <p className="pb-error">{submitError}</p>}

          <div className="pb-bar">
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
          </div>

          {(recording || done) && <div className="pb-title" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", marginBottom: "1.2rem" }}>{fmt(seconds)}</div>}

          {!done && (
            <>
              <button type="button" className={`pb-record-btn${recording ? " active" : ""}`} onClick={toggleRecording}>
                {recording ? <div className="pb-stop" /> : <div className="pb-dot" />}
              </button>
              <p className="pb-micro">{recording ? "Tap to stop" : "Tap to begin"}</p>
            </>
          )}

          {done && (
            <div className="pb-btn-row">
              <button type="button" className="pb-btn secondary" onClick={resetRecording}>
                Record again
              </button>
              <button type="button" className="pb-btn" onClick={handleGenerateBook} disabled={generating} style={{ opacity: generating ? 0.75 : 1, cursor: generating ? "wait" : "pointer" }}>
                <span>{generating ? "Building..." : "Generate Picture Book"}</span>
              </button>
            </div>
          )}

          {done && audioUrl && (
            <div className="pb-audio">
              <audio ref={audioPlayerRef} controls src={audioUrl} />
              <button
                type="button"
                onClick={() => {
                  if (!audioPlayerRef.current) return;
                  audioPlayerRef.current.currentTime = 0;
                  void audioPlayerRef.current.play();
                }}
                className="pb-btn secondary"
              >
                Replay recording
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", justifyContent: "center", marginTop: "1.2rem" }}>
            {(["visualStyle", "narratorVoice", "readingLevel", "tone", "pacing"] as (keyof StoryFilters)[]).map((key) => (
              <span key={key} className="pb-pill">
                {getFilterLabel(key, filters[key])}
              </span>
            ))}
          </div>

          {(jobStage || jobResult) && (
            <div className="pb-panel">
              <div className="pb-panel-top">
                <div>
                  {jobId && <p className="pb-stage">Job: {jobId}</p>}
                  {jobStage && <p className="pb-stage">Stage: {jobStage.replaceAll("_", " ")}</p>}
                  <h2 className="pb-book-title">{storyTitle}</h2>
                </div>
                {jobStage && jobStage !== "ready" && (
                  <div className="pb-loader">
                    <span className="pb-spinner" />
                    <span>Generating the storybook pages now.</span>
                  </div>
                )}
              </div>

              <div className="pb-summary">
                <div className="pb-summary-card">
                  <h3>Clean transcript</h3>
                  <p>{jobResult?.cleanTranscript ?? jobResult?.transcript ?? "Waiting for transcript..."}</p>
                </div>
                <div className="pb-summary-card">
                  <h3>Story pages</h3>
                  {paragraphs.length > 0 ? (
                    <ol>
                      {paragraphs.map((paragraph, index) => (
                        <li key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</li>
                      ))}
                    </ol>
                  ) : (
                    <p>Pages will appear here after the AI finishes splitting the story.</p>
                  )}
                </div>
              </div>

              <div className="pb-grid">
                {pages.map((page) => (
                  <article key={page.index} className="pb-page-card">
                    <div className="pb-page-art">
                      <span className="pb-page-num">Page {page.index + 1}</span>
                      <img src={page.imageDataUrl} alt={`Illustration for page ${page.index + 1}`} />
                    </div>
                    <div className="pb-page-caption">
                      <p className="pb-copy">{page.paragraph}</p>
                      <p className="small">{page.imageProvider}{page.imageModel ? ` · ${page.imageModel}` : ""}</p>
                      <div className="pb-btn-row" style={{ justifyContent: "flex-start", margin: "1rem 0 0" }}>
                        <a href={page.imageDataUrl} download={buildPageFilename(page)} className="pb-btn secondary">
                          Download page
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}