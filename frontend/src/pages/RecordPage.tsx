import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { defaultFilters, getFilterLabel } from "../filters";
import { createJob } from "../api/jobs";
import type { JobRecord, JobStage, PictureBookPage, StoryFilters } from "../types/job";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type EffectCallback = () => void | (() => void);

const useState = (React as any).useState as <T>(initial: T) => [T, StateSetter<T>];
const useEffect = (React as any).useEffect as (effect: EffectCallback, deps?: readonly unknown[]) => void;
const useRef = (React as any).useRef as <T>(initial: T) => { current: T };

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
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [turningPageIndex, setTurningPageIndex] = useState<number | null>(null);
  const [turnDirection, setTurnDirection] = useState<"next" | "prev">("next");

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageTurnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioUrlRef = useRef<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const mouseXRef = useRef(0);
  const mouseYRef = useRef(0);
  const ringXRef = useRef(0);
  const ringYRef = useRef(0);

  const storyTitle = jobResult?.bookTitle ?? "Your picture book";
  const pages: PictureBookPage[] = jobResult?.pages ?? [];
  const paragraphs = jobResult?.pictureBookParagraphs ?? pages.map((page) => page.paragraph);
  const activePage = pages[activePageIndex] ?? null;
  const turningPage = turningPageIndex !== null ? pages[turningPageIndex] ?? null : null;

  const buildPageFilename = (page: PictureBookPage) => {
    const index = String(page.index + 1).padStart(2, "0");
    return `${slugify(storyTitle)}-page-${index}.jpg`;
  };

  const flipToPage = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= pages.length || nextIndex === activePageIndex || turningPageIndex !== null) {
      return;
    }

    if (pageTurnTimerRef.current) {
      clearTimeout(pageTurnTimerRef.current);
    }

    setTurnDirection(nextIndex > activePageIndex ? "next" : "prev");
    setTurningPageIndex(nextIndex);

    pageTurnTimerRef.current = setTimeout(() => {
      setActivePageIndex(nextIndex);
      setTurningPageIndex(null);
    }, 380);
  };

  useEffect(() => {
    setActivePageIndex(0);
    setTurningPageIndex(null);

    if (pageTurnTimerRef.current) {
      clearTimeout(pageTurnTimerRef.current);
      pageTurnTimerRef.current = null;
    }
  }, [jobResult]);

  useEffect(() => {
    if (pages.length === 0) return;
    setActivePageIndex((current) => Math.min(current, pages.length - 1));
  }, [pages.length]);

  useEffect(() => {
    return () => {
      if (pageTurnTimerRef.current) {
        clearTimeout(pageTurnTimerRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    const audioElement = audioPlayerRef.current;
    if (!audioElement) return;

    const updatePosition = () => {
      setPlaybackPosition(audioElement.currentTime || 0);
    };

    const updateDuration = () => {
      setPlaybackDuration(Number.isFinite(audioElement.duration) ? audioElement.duration : 0);
    };

    const onPlay = () => setIsPlaybackActive(true);
    const onPause = () => setIsPlaybackActive(false);
    const onEnded = () => {
      setIsPlaybackActive(false);
      setPlaybackPosition(0);
    };

    audioElement.addEventListener("timeupdate", updatePosition);
    audioElement.addEventListener("loadedmetadata", updateDuration);
    audioElement.addEventListener("durationchange", updateDuration);
    audioElement.addEventListener("play", onPlay);
    audioElement.addEventListener("pause", onPause);
    audioElement.addEventListener("ended", onEnded);

    updatePosition();
    updateDuration();

    return () => {
      audioElement.removeEventListener("timeupdate", updatePosition);
      audioElement.removeEventListener("loadedmetadata", updateDuration);
      audioElement.removeEventListener("durationchange", updateDuration);
      audioElement.removeEventListener("play", onPlay);
      audioElement.removeEventListener("pause", onPause);
      audioElement.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

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
    setIsPlaybackActive(false);
    setPlaybackPosition(0);
    setPlaybackDuration(0);

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

  const handleGenerateBook = async () => {
    if (!audioBlob) {
      setSubmitError("Please record your story first.");
      return;
    }

    try {
      setSubmitError(null);
      setGenerating(true);

      const created = await createJob(audioBlob, filters);
      navigate("/loading", { state: { jobId: created.jobId } });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to generate picture book.");
    } finally {
      setGenerating(false);
    }
  };

  const fmt = (value: number) =>
    `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;

  const togglePlayback = async () => {
    const audioElement = audioPlayerRef.current;
    if (!audioElement) return;

    if (audioElement.paused) {
      try {
        await audioElement.play();
      } catch {
        setIsPlaybackActive(false);
      }
      return;
    }

    audioElement.pause();
  };

  const handleSeek = (event: { target: { value: string } }) => {
    const audioElement = audioPlayerRef.current;
    if (!audioElement) return;
    const nextValue = Number(event.target.value);
    audioElement.currentTime = nextValue;
    setPlaybackPosition(nextValue);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=Instrument+Sans:wght@300;400;500&display=swap');
        body{cursor:none!important;margin:0;background:linear-gradient(145deg,#0c1525 0%,#070c17 55%,#0d1020 100%);}
        .pb-cursor{position:fixed;width:8px;height:8px;background:#c9a84c;border-radius:50%;pointer-events:none;z-index:9999;mix-blend-mode:screen;}
        .pb-ring{position:fixed;width:34px;height:34px;border:1px solid rgba(201,168,76,.35);border-radius:50%;pointer-events:none;z-index:9998;}
        @keyframes pb-pulse{0%,100%{box-shadow:0 0 0 0 rgba(130,84,32,.22)}50%{box-shadow:0 0 0 20px rgba(130,84,32,0)}}
        @keyframes pb-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        .pb-page{min-height:100vh;color:#e8dfd0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem 1.5rem 4rem;text-align:center;position:relative;overflow:hidden;font-family:'Instrument Sans',sans-serif;font-weight:300;}
        .pb-page::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 20% 15%,rgba(167,139,250,.1),transparent 34%),radial-gradient(circle at 80% 8%,rgba(96,165,250,.08),transparent 30%),radial-gradient(circle at 50% 115%,rgba(201,168,76,.12),transparent 44%);pointer-events:none;}
        .pb-shell{width:min(1120px,100%);position:relative;z-index:1;}
        .pb-back{position:absolute;top:0;left:0;background:none;border:1px solid rgba(232,223,208,.16);color:rgba(232,223,208,.45);border-radius:999px;padding:.7rem 1.15rem;font-family:'Instrument Sans',sans-serif;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;cursor:none;}
        .pb-step{font-family:'Instrument Sans',sans-serif;font-size:.66rem;letter-spacing:.34em;text-transform:uppercase;color:#c9a84c;margin:0 0 1rem;}
        .pb-title{font-family:'Cormorant Garamond',serif;font-size:clamp(2.7rem,6.5vw,4.8rem);font-weight:400;line-height:1.03;margin:0 0 .9rem;animation:pb-up .65s ease both;}
        .pb-title em{font-style:italic;color:#c9a84c;}
        .pb-sub{font-family:'Instrument Sans',sans-serif;font-size:clamp(.95rem,1.9vw,1.05rem);line-height:1.7;color:rgba(232,223,208,.58);max-width:680px;margin:0 auto 1.8rem;animation:pb-up .75s ease .05s both;}
        .pb-micro{font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:rgba(232,223,208,.3);margin-top:.8rem;}
        .pb-record-btn{width:94px;height:94px;border-radius:50%;border:1px solid rgba(201,168,76,.45);background:rgba(201,168,76,.08);display:flex;align-items:center;justify-content:center;cursor:none;transition:transform .25s ease, background .25s ease, border-color .25s ease;margin:0 auto;}
        .pb-record-btn:hover{transform:translateY(-2px);background:rgba(201,168,76,.15);border-color:rgba(201,168,76,.8);}
        .pb-record-btn.active{background:rgba(201,168,76,.2);animation:pb-pulse 1.6s ease-in-out infinite;}
        .pb-stop{width:26px;height:26px;border-radius:6px;background:#c9a84c;}
        .pb-dot{width:22px;height:22px;border-radius:50%;background:#c9a84c;}
        .pb-bar{width:100%;max-width:540px;height:92px;margin:0 auto 1.75rem;border-radius:22px;border:1px solid rgba(201,168,76,.12);background:rgba(8,13,24,.48);overflow:hidden;backdrop-filter:blur(10px);}
        .pb-btn-row{display:flex;flex-wrap:wrap;gap:1rem;justify-content:center;margin:1.6rem 0 2.3rem;}
        .pb-btn{display:inline-flex;align-items:center;gap:.7rem;padding:.85rem 1.6rem;border-radius:999px;border:1px solid rgba(201,168,76,.45);background:transparent;color:#e8dfd0;font-family:'Instrument Sans',sans-serif;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;cursor:none;text-decoration:none;transition:transform .2s ease, background .2s ease, color .2s ease;}
        .pb-btn:hover{transform:translateY(-1px);background:#c9a84c;color:#0d1628;}
        .pb-btn.secondary{border-color:rgba(232,223,208,.18);background:rgba(232,223,208,.04);color:rgba(232,223,208,.72);}
        .pb-btn.secondary:hover{background:rgba(232,223,208,.12);color:#e8dfd0;}
        .pb-player{width:min(620px,100%);margin:0 auto 1rem;padding:1rem;border-radius:18px;border:1px solid rgba(232,223,208,.12);background:rgba(8,12,22,.42);display:flex;flex-direction:column;gap:.8rem;backdrop-filter:blur(8px);}
        .pb-player-row{display:flex;align-items:center;gap:.75rem;}
        .pb-player-toggle{width:42px;height:42px;border-radius:50%;border:1px solid rgba(201,168,76,.45);background:rgba(201,168,76,.1);color:#c9a84c;display:flex;align-items:center;justify-content:center;font-size:1rem;cursor:none;transition:transform .2s ease,background .2s ease,border-color .2s ease,color .2s ease;}
        .pb-player-toggle:hover{transform:translateY(-1px);background:#c9a84c;color:#0d1628;border-color:#c9a84c;}
        .pb-player-time{font-size:.74rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(232,223,208,.62);font-family:'Instrument Sans',sans-serif;white-space:nowrap;min-width:52px;text-align:right;}
        .pb-player-range{flex:1;appearance:none;height:6px;border-radius:999px;background:rgba(232,223,208,.18);outline:none;cursor:none;}
        .pb-player-range::-webkit-slider-thumb{appearance:none;width:14px;height:14px;border-radius:50%;background:#c9a84c;border:1px solid rgba(13,22,40,.45);box-shadow:0 0 0 3px rgba(201,168,76,.18);}
        .pb-player-range::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#c9a84c;border:1px solid rgba(13,22,40,.45);box-shadow:0 0 0 3px rgba(201,168,76,.18);}
        .pb-player-range::-moz-range-track{height:6px;border-radius:999px;background:rgba(232,223,208,.18);}
        .pb-audio-native{display:none;}
        .pb-player-meta{display:flex;justify-content:space-between;gap:.75rem;align-items:center;}
        .pb-player-label{font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;color:rgba(232,223,208,.46);font-family:'Instrument Sans',sans-serif;}
        .pb-pill{font-size:.7rem;padding:.35rem .85rem;border:1px solid rgba(232,223,208,.16);border-radius:999px;color:rgba(232,223,208,.62);background:rgba(232,223,208,.05);}
        .pb-panel{width:min(980px,100%);margin:1.4rem auto 0;text-align:left;border:1px solid rgba(232,223,208,.08);border-radius:28px;background:rgba(12,20,38,.6);box-shadow:0 24px 70px rgba(0,0,0,.28);overflow:hidden;}
        .pb-panel-top{padding:1.35rem 1.35rem 0;display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;}
        .pb-stage{font-family:'Instrument Sans',sans-serif;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:#c9a84c;}
        .pb-book-title{font-family:'Cormorant Garamond',serif;font-size:clamp(1.8rem,4vw,2.8rem);font-weight:400;margin:.15rem 0 0;color:#e8dfd0;}
        .pb-section-label{font-family:'Instrument Sans',sans-serif;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:rgba(232,223,208,.48);margin:0 0 .6rem;}
        .pb-copy{font-family:'Instrument Sans',sans-serif;font-size:.92rem;line-height:1.7;color:rgba(232,223,208,.86);margin:0;}
        .pb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:1rem;padding:1.35rem;}
        .pb-page-card{border:1px solid rgba(232,223,208,.08);border-radius:24px;background:linear-gradient(180deg,rgba(12,20,38,.72),rgba(10,16,30,.78));overflow:hidden;box-shadow:0 10px 35px rgba(0,0,0,.24);}
        .pb-page-art{position:relative;background:#111a2d;aspect-ratio:4/5;overflow:hidden;}
        .pb-page-art img{width:100%;height:100%;object-fit:cover;display:block;}
        .pb-page-num{position:absolute;top:14px;left:14px;padding:.35rem .65rem;border-radius:999px;background:rgba(8,12,22,.72);font-family:'Instrument Sans',sans-serif;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:#c9a84c;}
        .pb-page-caption{padding:1rem 1rem 1.15rem;}
        .pb-page-caption p{margin:0;}
        .pb-page-caption .small{margin-top:.8rem;font-size:.72rem;color:rgba(232,223,208,.45);letter-spacing:.12em;text-transform:uppercase;}
        .pb-loader{padding:1.1rem 1.35rem 1.5rem;font-family:'Instrument Sans',sans-serif;color:rgba(232,223,208,.72);display:flex;align-items:center;gap:.8rem;}
        .pb-spinner{width:14px;height:14px;border-radius:50%;border:2px solid rgba(201,168,76,.25);border-top-color:#c9a84c;animation:spin .8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}
        .pb-book-shell{margin:1.4rem auto 0;border:1px solid rgba(232,223,208,.08);border-radius:32px;background:linear-gradient(180deg,rgba(12,20,38,.72),rgba(10,16,30,.78));box-shadow:0 24px 70px rgba(0,0,0,.3);overflow:hidden;}
        .pb-book-top{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:1.35rem 1.35rem 1rem;flex-wrap:wrap;}
        .pb-book-top h3{font-family:'Cormorant Garamond',serif;font-size:clamp(1.7rem,3.5vw,2.6rem);font-weight:400;margin:.15rem 0 0;color:#e8dfd0;}
        .pb-book-top p{margin:0;}
        .pb-book-meta{font-family:'Instrument Sans',sans-serif;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:rgba(232,223,208,.42);}
        .pb-book-badge{padding:.55rem .85rem;border-radius:999px;border:1px solid rgba(201,168,76,.28);background:rgba(201,168,76,.09);font-family:'Instrument Sans',sans-serif;font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:#c9a84c;}
        .pb-book-stage{padding:0 1.35rem 1.35rem;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:.8rem;align-items:center;}
        .pb-book-nav{width:42px;height:42px;border-radius:50%;border:1px solid rgba(232,223,208,.2);background:rgba(232,223,208,.06);color:#c9a84c;font-size:1rem;cursor:none;display:flex;align-items:center;justify-content:center;transition:transform .2s ease, background .2s ease, opacity .2s ease;}
        .pb-book-nav:hover:not(:disabled){transform:translateY(-1px);background:rgba(232,223,208,.14);}
        .pb-book-nav:disabled{opacity:.35;cursor:not-allowed;}
        .pb-book-viewport{position:relative;min-height:520px;border-radius:28px;border:1px solid rgba(232,223,208,.1);background:linear-gradient(180deg,rgba(18,28,48,.95),rgba(10,16,30,.98));box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 18px 50px rgba(0,0,0,.35);overflow:hidden;perspective:1800px;}
        .pb-book-viewport::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 48.8%,rgba(201,168,76,.2) 49.5%,rgba(255,255,255,.08) 50%,rgba(201,168,76,.2) 50.5%,transparent 51.2%);pointer-events:none;z-index:0;}
        .pb-spread{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;transform-style:preserve-3d;z-index:1;}
        .pb-spread.incoming{z-index:3;}
        .pb-spread.outgoing{z-index:2;}
        .pb-page{position:relative;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(180deg,rgba(18,28,48,.96),rgba(10,16,30,.98));}
        .pb-page.left{border-right:1px solid rgba(232,223,208,.08);}
        .pb-page.right{border-left:1px solid rgba(232,223,208,.08);}
        .pb-page::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.07),transparent 18%,transparent 82%,rgba(0,0,0,.1));pointer-events:none;}
        .pb-page-inner{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;gap:1rem;padding:1.1rem;}
        .pb-page-art{position:relative;flex:1;min-height:260px;border-radius:22px;overflow:hidden;background:#111a2d;box-shadow:inset 0 0 0 1px rgba(201,168,76,.15);}
        .pb-page-art img{width:100%;height:100%;object-fit:cover;display:block;}
        .pb-page-num{position:absolute;top:14px;left:14px;padding:.34rem .65rem;border-radius:999px;background:rgba(8,12,22,.72);font-family:'Instrument Sans',sans-serif;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:#c9a84c;}
        .pb-page-copy{font-family:'Instrument Sans',sans-serif;font-size:1rem;line-height:1.8;color:rgba(232,223,208,.86);margin:0;}
        .pb-page-note{margin:0;font-family:'Instrument Sans',sans-serif;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(232,223,208,.45);}
        .pb-page-actions{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap;margin-top:auto;}
        .pb-page-chips{display:flex;flex-wrap:wrap;gap:.45rem;padding:0 1.35rem 1.35rem;}
        .pb-chip{border:1px solid rgba(232,223,208,.16);background:rgba(232,223,208,.06);border-radius:999px;padding:.45rem .8rem;font-family:'Instrument Sans',sans-serif;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:rgba(232,223,208,.58);cursor:none;transition:transform .2s ease, background .2s ease, color .2s ease,border-color .2s ease;}
        .pb-chip:hover{transform:translateY(-1px);background:rgba(232,223,208,.14);color:#e8dfd0;}
        .pb-chip.active{background:#c9a84c;color:#0d1628;border-color:#c9a84c;}
        .pb-turn-next-out{animation:pb-turn-next-out .38s cubic-bezier(.4,0,1,1) forwards;transform-origin:left center;}
        .pb-turn-next-in{animation:pb-turn-next-in .38s cubic-bezier(0,0,.2,1) forwards;transform-origin:right center;}
        .pb-turn-prev-out{animation:pb-turn-prev-out .38s cubic-bezier(.4,0,1,1) forwards;transform-origin:right center;}
        .pb-turn-prev-in{animation:pb-turn-prev-in .38s cubic-bezier(0,0,.2,1) forwards;transform-origin:left center;}
        @keyframes pb-turn-next-out{from{transform:rotateY(0deg) translateX(0);opacity:1}to{transform:rotateY(-82deg) translateX(-4%);opacity:0}}
        @keyframes pb-turn-next-in{from{transform:rotateY(82deg) translateX(4%);opacity:0}to{transform:rotateY(0deg) translateX(0);opacity:1}}
        @keyframes pb-turn-prev-out{from{transform:rotateY(0deg) translateX(0);opacity:1}to{transform:rotateY(82deg) translateX(4%);opacity:0}}
        @keyframes pb-turn-prev-in{from{transform:rotateY(-82deg) translateX(-4%);opacity:0}to{transform:rotateY(0deg) translateX(0);opacity:1}}
        .pb-audio{max-width:520px;width:100%;margin:0 auto 1rem;display:flex;flex-direction:column;gap:.8rem;align-items:center;}
        .pb-audio audio{width:100%;}
        .pb-error{font-family:'Instrument Sans',sans-serif;font-size:.82rem;color:#fecaca;max-width:640px;margin:0 auto 1rem;line-height:1.6;}
        .pb-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.9rem;padding:0 1.35rem 1.35rem;}
        .pb-summary-card{border:1px solid rgba(232,223,208,.1);border-radius:20px;background:rgba(8,12,22,.35);padding:1rem;}
        .pb-summary-card h3{font-family:'Instrument Sans',sans-serif;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:rgba(232,223,208,.46);margin:0 0 .55rem;}
        .pb-summary-card p{margin:0;font-family:'Instrument Sans',sans-serif;font-size:.92rem;line-height:1.6;color:rgba(232,223,208,.86);}
        .pb-summary-card ol{margin:0;padding-left:1.15rem;font-family:'Instrument Sans',sans-serif;font-size:.9rem;line-height:1.6;color:rgba(232,223,208,.86);}
        @media (max-width: 720px){.pb-page{padding:4.5rem 1rem 3rem}.pb-back{position:static;margin-bottom:1.25rem}.pb-panel-top{padding:1rem 1rem 0}.pb-grid,.pb-summary{padding:1rem}.pb-grid{grid-template-columns:1fr}.pb-btn-row{justify-content:flex-start}.pb-book-top,.pb-book-stage,.pb-page-chips{padding-left:1rem;padding-right:1rem}.pb-book-stage{grid-template-columns:1fr}.pb-book-nav{display:none}.pb-book-viewport{min-height:unset}.pb-spread{position:relative;grid-template-columns:1fr}.pb-page.left{border-right:none;border-bottom:1px solid rgba(232,223,208,.08)}.pb-page.right{border-left:none}.pb-page-art{min-height:220px}}
      `}</style>

      <div className="pb-cursor" ref={cursorRef} />
      <div className="pb-ring" ref={ringRef} />

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
            <div className="pb-player">
              <audio ref={audioPlayerRef} src={audioUrl} preload="metadata" className="pb-audio-native" />
              <div className="pb-player-row">
                <button type="button" className="pb-player-toggle" onClick={togglePlayback} aria-label={isPlaybackActive ? "Pause recording" : "Play recording"}>
                  {isPlaybackActive ? "❚❚" : "▶"}
                </button>
                <input
                  type="range"
                  className="pb-player-range"
                  min={0}
                  max={Math.max(playbackDuration, 0.01)}
                  step={0.01}
                  value={Math.min(playbackPosition, playbackDuration || 0)}
                  onChange={handleSeek}
                  aria-label="Seek audio playback"
                />
                <span className="pb-player-time">{fmt(Math.floor(playbackPosition))} / {fmt(Math.floor(playbackDuration))}</span>
              </div>
              <div className="pb-player-meta">
                <span className="pb-player-label">Recorded narration preview</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!audioPlayerRef.current) return;
                    audioPlayerRef.current.currentTime = 0;
                    void audioPlayerRef.current.play();
                  }}
                  className="pb-btn secondary"
                  style={{ padding: ".55rem 1.1rem", fontSize: ".68rem" }}
                >
                  Restart
                </button>
              </div>
              <div className="pb-player-row" style={{ justifyContent: "space-between" }}>
                <span className="pb-player-label">Use the slider to scrub playback</span>
                <span className="pb-player-time">Narration</span>
              </div>
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

              <div className="pb-book-shell">
                <div className="pb-book-top">
                  <div>
                    <p className="pb-book-meta">Flip through the pages</p>
                    <h3>{storyTitle}</h3>
                  </div>
                  <div className="pb-book-badge">
                    Page {pages.length === 0 ? 0 : activePageIndex + 1} of {pages.length}
                  </div>
                </div>

                {pages.length > 0 ? (
                  <div className="pb-book-stage">
                    <button
                      type="button"
                      className="pb-book-nav"
                      onClick={() => flipToPage(activePageIndex - 1)}
                      disabled={activePageIndex === 0 || turningPageIndex !== null}
                      aria-label="Previous page"
                    >
                      ‹
                    </button>

                    <div className="pb-book-viewport">
                      {turningPage && (
                        <article className={`pb-spread incoming pb-turn-${turnDirection}-in`} aria-hidden="true">
                          <div className="pb-page left">
                            <div className="pb-page-inner">
                              <div className="pb-page-art">
                                <span className="pb-page-num">Page {turningPage.index + 1}</span>
                                <img src={turningPage.imageDataUrl} alt={`Illustration for page ${turningPage.index + 1}`} />
                              </div>
                              <div className="pb-page-actions">
                                <p className="pb-page-note">Illustration</p>
                                <a href={turningPage.imageDataUrl} download={buildPageFilename(turningPage)} className="pb-btn secondary" style={{ padding: ".7rem 1.1rem" }}>
                                  Download page
                                </a>
                              </div>
                            </div>
                          </div>
                          <div className="pb-page right">
                            <div className="pb-page-inner">
                              <p className="pb-page-copy">{turningPage.paragraph}</p>
                              <div className="pb-page-actions">
                                <p className="pb-page-note">{turningPage.imageProvider}{turningPage.imageModel ? ` · ${turningPage.imageModel}` : ""}</p>
                                <p className="pb-page-note">Page turn in progress</p>
                              </div>
                            </div>
                          </div>
                        </article>
                      )}

                      {activePage && (
                        <article className={`pb-spread outgoing${turningPage ? ` pb-turn-${turnDirection}-out` : ""}`}>
                          <div className="pb-page left">
                            <div className="pb-page-inner">
                              <div className="pb-page-art">
                                <span className="pb-page-num">Page {activePage.index + 1}</span>
                                <img src={activePage.imageDataUrl} alt={`Illustration for page ${activePage.index + 1}`} />
                              </div>
                              <div className="pb-page-actions">
                                <p className="pb-page-note">Illustration</p>
                                <a href={activePage.imageDataUrl} download={buildPageFilename(activePage)} className="pb-btn secondary" style={{ padding: ".7rem 1.1rem" }}>
                                  Download page
                                </a>
                              </div>
                            </div>
                          </div>
                          <div className="pb-page right">
                            <div className="pb-page-inner">
                              <p className="pb-page-copy">{activePage.paragraph}</p>
                              <div className="pb-page-actions">
                                <p className="pb-page-note">{activePage.imageProvider}{activePage.imageModel ? ` · ${activePage.imageModel}` : ""}</p>
                                <p className="pb-page-note">Open book spread</p>
                              </div>
                            </div>
                          </div>
                        </article>
                      )}
                    </div>

                    <button
                      type="button"
                      className="pb-book-nav"
                      onClick={() => flipToPage(activePageIndex + 1)}
                      disabled={activePageIndex >= pages.length - 1 || turningPageIndex !== null}
                      aria-label="Next page"
                    >
                      ›
                    </button>
                  </div>
                ) : (
                  <div className="pb-book-stage" style={{ gridTemplateColumns: "1fr" }}>
                    <div className="pb-book-viewport" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 340 }}>
                      <div style={{ maxWidth: 420, textAlign: "center", padding: "2rem" }}>
                        <p className="pb-book-meta">Waiting for story pages</p>
                        <h3 style={{ marginBottom: ".75rem" }}>The book is still being printed.</h3>
                        <p className="pb-page-copy" style={{ fontSize: ".95rem" }}>
                          Once generation finishes, the pages will appear here as a flip-through picture book.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {pages.length > 0 && (
                  <div className="pb-page-chips">
                    {pages.map((page) => (
                      <button
                        key={page.index}
                        type="button"
                        className={`pb-chip${page.index === activePageIndex ? " active" : ""}`}
                        onClick={() => flipToPage(page.index)}
                        disabled={turningPageIndex !== null}
                      >
                        {page.index + 1}
                      </button>
                    ))}
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
            </div>
          )}
        </div>
      </div>
    </>
  );
}