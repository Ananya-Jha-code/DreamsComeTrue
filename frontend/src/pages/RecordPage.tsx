import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { defaultFilters, getFilterLabel } from "../filters";
import { createJob, getJob } from "../api/jobs";
import type { JobRecord, JobStage, StoryFilters } from "../types/job";

type RecordLocationState = { filters?: StoryFilters };

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

  // Waveform animation
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
      const bars = 48;
      const barW = canvas.width / bars;
      for (let i = 0; i < bars; i++) {
        const active = recording;
        const h = active
          ? (Math.sin(frame * 0.08 + i * 0.4) * 0.5 + 0.5) * canvas.height * 0.75 + 4
          : 4;
        const alpha = active ? 0.6 + Math.sin(frame * 0.05 + i * 0.3) * 0.4 : 0.15;
        ctx.fillStyle = `rgba(201,168,76,${alpha})`;
        ctx.beginPath();
        ctx.roundRect(i * barW + barW * 0.2, (canvas.height - h) / 2, barW * 0.6, h, 3);
        ctx.fill();
      }
      frame++;
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

        const recordedBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
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
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

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

      if (job.stage === "ready") {
        return;
      }
      if (job.stage === "failed") {
        throw new Error(job.error ?? "Pipeline failed.");
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    throw new Error("The pipeline is still running. Please wait and try again.");
  };

  const handleGeneratePrompt = async () => {
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
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unable to generate prompt.");
    } finally {
      setGenerating(false);
    }
  };

  const fmt = (s: number) => `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Instrument+Sans:wght@300;400&display=swap');
        body{cursor:auto!important;margin:0;}
        @keyframes rc-pulse{0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,.4)}50%{box-shadow:0 0 0 20px rgba(201,168,76,0)}}
        @keyframes rc-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .rc-record-btn{width:88px;height:88px;border-radius:50%;border:2px solid rgba(201,168,76,.5);background:rgba(201,168,76,.08);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .3s ease;position:relative;}
        .rc-record-btn:hover{background:rgba(201,168,76,.15);border-color:rgba(201,168,76,.8);}
        .rc-record-btn.active{border-color:#c9a84c;background:rgba(201,168,76,.2);animation:rc-pulse 1.5s ease-in-out infinite;}
        .rc-pill{font-size:.7rem;padding:.3rem .8rem;border:1px solid rgba(232,223,208,.1);border-radius:100px;color:rgba(232,223,208,.45);letter-spacing:.04em;font-family:'Instrument Sans',sans-serif;}
        .rc-btn{display:inline-flex;align-items:center;gap:.75rem;padding:.85rem 2rem;border:1px solid rgba(201,168,76,.45);border-radius:100px;font-family:'Instrument Sans',sans-serif;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#e8dfd0;background:transparent;cursor:pointer;transition:all .35s ease;position:relative;overflow:hidden;}
        .rc-btn::before{content:'';position:absolute;inset:0;background:#c9a84c;transform:scaleX(0);transform-origin:left;transition:transform .35s ease;z-index:-1;}
        .rc-btn:hover{color:#0d1628;border-color:#c9a84c;}
        .rc-btn:hover::before{transform:scaleX(1);}
        .rc-dot{width:6px;height:6px;background:#c9a84c;border-radius:50%;flex-shrink:0;transition:background .35s;}
        .rc-btn:hover .rc-dot{background:#0d1628;}
      `}</style>

      <div style={{fontFamily:"'Instrument Sans',sans-serif",fontWeight:300,background:"linear-gradient(160deg,#0d1628 0%,#080d18 60%)",color:"#e8dfd0",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"3rem 1.5rem",textAlign:"center"}}>

        {/* Back */}
        <button type="button" onClick={() => navigate("/picker",{state:{filters}})} style={{position:"absolute",top:"2.5rem",left:"2rem",background:"none",border:"none",color:"rgba(232,223,208,.3)",fontSize:".68rem",letterSpacing:".2em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'Instrument Sans',sans-serif"}}>
          ← Picker
        </button>

        {/* Step label */}
        <p style={{fontSize:".62rem",letterSpacing:".32em",textTransform:"uppercase",color:"#c9a84c",marginBottom:"1rem"}}>Step 2 of 2</p>

        {/* Title */}
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"clamp(2.5rem,7vw,4rem)",fontWeight:300,color:"#e8dfd0",margin:"0 0 1rem",lineHeight:1.05}}>
          {done ? <><em style={{fontStyle:"italic",color:"#c9a84c"}}>Beautiful.</em> Ready to weave.</> : recording ? <>Listening<em style={{fontStyle:"italic",color:"#c9a84c"}}>…</em></> : <>Tell your <em style={{fontStyle:"italic",color:"#c9a84c"}}>story</em></>}
        </h1>
        <p style={{fontSize:".85rem",color:"rgba(232,223,208,.38)",maxWidth:400,lineHeight:1.6,marginBottom:"3rem"}}>
          {done ? "Your story has been captured. Generate the director prompt below." : recording ? "Speak naturally. Pause whenever you like. Tap again when you're done." : "Tap the button below and speak. We'll handle the rest."}
        </p>

        {micError && (
          <p style={{fontSize:".78rem",color:"#ffb4b4",maxWidth:500,margin:"0 0 1.5rem",lineHeight:1.6}}>{micError}</p>
        )}
        {submitError && (
          <p style={{fontSize:".78rem",color:"#ffb4b4",maxWidth:560,margin:"0 0 1.5rem",lineHeight:1.6}}>{submitError}</p>
        )}

        {/* Waveform */}
        <div style={{width:"100%",maxWidth:480,height:80,marginBottom:"2.5rem",borderRadius:12,overflow:"hidden",border:"1px solid rgba(201,168,76,.08)",background:"rgba(8,13,24,.5)"}}>
          <canvas ref={canvasRef} style={{width:"100%",height:"100%"}} />
        </div>

        {/* Timer */}
        {(recording || done) && (
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"2.5rem",fontWeight:300,color:"#c9a84c",marginBottom:"2rem",letterSpacing:".05em"}}>
            {fmt(seconds)}
          </div>
        )}

        {/* Record button */}
        {!done && (
          <button type="button" className={`rc-record-btn${recording?" active":""}`} onClick={toggleRecording} style={{marginBottom:"2rem"}}>
            {recording
              ? <div style={{width:28,height:28,background:"#c9a84c",borderRadius:4}} />
              : <div style={{width:28,height:28,background:"#c9a84c",borderRadius:"50%"}} />}
          </button>
        )}
        {!done && <p style={{fontSize:".7rem",letterSpacing:".15em",textTransform:"uppercase",color:"rgba(232,223,208,.25)",marginBottom:"3rem"}}>{recording ? "Tap to stop" : "Tap to begin"}</p>}

        {/* Generate / redo */}
        {done && (
          <div style={{display:"flex",flexWrap:"wrap",gap:"1rem",justifyContent:"center",marginBottom:"3rem"}}>
            <button type="button" onClick={resetRecording} style={{background:"none",border:"1px solid rgba(232,223,208,.12)",color:"rgba(232,223,208,.45)",borderRadius:"100px",padding:".85rem 2rem",fontFamily:"'Instrument Sans',sans-serif",fontSize:".8rem",letterSpacing:".12em",textTransform:"uppercase",cursor:"pointer",transition:"all .3s"}}>
              Record again
            </button>
            <button type="button" className="rc-btn" onClick={handleGeneratePrompt} disabled={generating} style={{opacity: generating ? 0.7 : 1, cursor: generating ? "wait" : "pointer"}}>
              <span className="rc-dot" />
              {generating ? "Generating..." : "Generate Prompt"}
            </button>
          </div>
        )}

        {(jobStage || jobResult) && (
          <div style={{width:"100%",maxWidth:700,marginBottom:"2rem",textAlign:"left",padding:"1rem",border:"1px solid rgba(201,168,76,.15)",borderRadius:12,background:"rgba(8,13,24,.45)"}}>
            {jobId && <p style={{margin:"0 0 .6rem",fontSize:".68rem",letterSpacing:".12em",textTransform:"uppercase",color:"rgba(232,223,208,.45)"}}>Job: {jobId}</p>}
            {jobStage && <p style={{margin:"0 0 .6rem",fontSize:".72rem",letterSpacing:".1em",textTransform:"uppercase",color:"#c9a84c"}}>Stage: {jobStage.replaceAll("_", " ")}</p>}
            {jobResult?.transcript && (
              <div style={{marginBottom:".8rem"}}>
                <p style={{margin:"0 0 .35rem",fontSize:".7rem",letterSpacing:".1em",textTransform:"uppercase",color:"rgba(232,223,208,.5)"}}>Speech to text</p>
                <p style={{margin:0,fontSize:".85rem",lineHeight:1.6,color:"rgba(232,223,208,.92)"}}>{jobResult.transcript}</p>
              </div>
            )}
            {jobResult?.directorPrompt && (
              <div>
                <p style={{margin:"0 0 .35rem",fontSize:".7rem",letterSpacing:".1em",textTransform:"uppercase",color:"rgba(232,223,208,.5)"}}>Director prompt</p>
                <p style={{margin:0,fontSize:".85rem",lineHeight:1.6,color:"rgba(232,223,208,.92)"}}>{jobResult.directorPrompt}</p>
              </div>
            )}
          </div>
        )}

        {done && audioUrl && (
          <div style={{width:"100%",maxWidth:520,marginBottom:"2rem",display:"flex",flexDirection:"column",gap:"0.75rem",alignItems:"center"}}>
            <audio ref={audioPlayerRef} controls src={audioUrl} style={{width:"100%",maxWidth:520}} />
            <button
              type="button"
              onClick={() => {
                if (!audioPlayerRef.current) return;
                audioPlayerRef.current.currentTime = 0;
                void audioPlayerRef.current.play();
              }}
              style={{background:"none",border:"1px solid rgba(201,168,76,.45)",color:"#e8dfd0",borderRadius:"100px",padding:".65rem 1.5rem",fontFamily:"'Instrument Sans',sans-serif",fontSize:".74rem",letterSpacing:".12em",textTransform:"uppercase",cursor:"pointer"}}
            >
              Replay Recording
            </button>
          </div>
        )}

        {/* Selected filters summary */}
        <div style={{display:"flex",flexWrap:"wrap",gap:".5rem",justifyContent:"center",maxWidth:500}}>
          {(["visualStyle","narratorVoice","readingLevel","tone","pacing"] as (keyof StoryFilters)[]).map(k => (
            <span key={k} className="rc-pill">{getFilterLabel(k, filters[k])}</span>
          ))}
        </div>

      </div>
    </>
  );
}
