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
      mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
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
        mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
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
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Instrument+Sans:wght@300;400&display=swap');
        body{cursor:none!important;margin:0;}
        .rc-cursor{position:fixed;width:8px;height:8px;background:#c9a84c;border-radius:50%;pointer-events:none;z-index:9999;mix-blend-mode:screen;}
        .rc-ring{position:fixed;width:34px;height:34px;border:1px solid rgba(201,168,76,.35);border-radius:50%;pointer-events:none;z-index:9998;}
        @keyframes rc-pulse{0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,.4)}50%{box-shadow:0 0 0 20px rgba(201,168,76,0)}}
        @keyframes rc-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .rc-record-btn{width:88px;height:88px;border-radius:50%;border:2px solid rgba(201,168,76,.5);background:rgba(201,168,76,.08);display:flex;align-items:center;justify-content:center;cursor:none;transition:all .3s ease;position:relative;margin:0 auto;}
        .rc-record-btn:hover{background:rgba(201,168,76,.15);border-color:rgba(201,168,76,.8);}
        .rc-record-btn.active{border-color:#c9a84c;background:rgba(201,168,76,.2);animation:rc-pulse 1.5s ease-in-out infinite;}
        .rc-pill{font-size:.7rem;padding:.3rem .8rem;border:1px solid rgba(232,223,208,.1);border-radius:100px;color:rgba(232,223,208,.45);letter-spacing:.04em;font-family:'Instrument Sans',sans-serif;}
        .rc-btn{display:inline-flex;align-items:center;gap:.75rem;padding:.85rem 2rem;border:1px solid rgba(201,168,76,.45);border-radius:100px;font-family:'Instrument Sans',sans-serif;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#e8dfd0;background:transparent;cursor:none;transition:all .35s ease;position:relative;overflow:hidden;}
        .rc-btn::before{content:'';position:absolute;inset:0;background:#c9a84c;transform:scaleX(0);transform-origin:left;transition:transform .35s ease;z-index:-1;}
        .rc-btn:hover{color:#0d1628;border-color:#c9a84c;}
        .rc-btn:hover::before{transform:scaleX(1);}
        .rc-dot{width:6px;height:6px;background:#c9a84c;border-radius:50%;flex-shrink:0;transition:background .35s;}
        .rc-btn:hover .rc-dot{background:#0d1628;}
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
            {(["visualStyle", "readingLevel", "tone"] as (keyof StoryFilters)[]).map((key) => (
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