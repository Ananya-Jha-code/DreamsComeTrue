import { useCallback, useEffect, useRef, useState } from "react";
import { createJob, fetchHealth, getJob } from "./api/jobs";
import type { JobRecord, StoryFilters } from "./types/job";

const defaultFilters: StoryFilters = {
  visualStyle: "watercolor",
  narratorVoice: "warm_mother",
  readingLevel: "early_reader",
  tone: "cozy",
  pacing: "unhurried",
};

export default function App() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    fetchHealth()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
  }, []);

  const pollJob = useCallback(async (id: string) => {
    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
      const j = await getJob(id);
      setJob(j);
      if (j.stage === "ready" || j.stage === "failed") break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }, []);

  const clearRecording = useCallback(() => {
    setRecordingBlob(null);
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
    }
    setRecordingUrl(null);
  }, [recordingUrl]);

  const stopStreamTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    if (typeof window === "undefined" || !("MediaRecorder" in window)) {
      setError("This browser does not support audio recording.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const selectedType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = selectedType
        ? new MediaRecorder(stream, { mimeType: selectedType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopStreamTracks();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        clearRecording();
        setRecordingBlob(blob);
        setRecordingUrl(URL.createObjectURL(blob));
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (e) {
      stopStreamTracks();
      setError(e instanceof Error ? e.message : "Microphone permission failed.");
    }
  }, [clearRecording, stopStreamTracks]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") {
      setIsRecording(false);
      stopStreamTracks();
      return;
    }
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  }, [stopStreamTracks]);

  const submitRecording = useCallback(async (audio: Blob) => {
    setError(null);
    setJob(null);
    setIsSubmitting(true);
    try {
      const { jobId } = await createJob(audio, defaultFilters);
      await pollJob(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setIsSubmitting(false);
    }
  }, [pollJob]);

  useEffect(() => {
    return () => {
      stopRecording();
      stopStreamTracks();
      if (recordingUrl) {
        URL.revokeObjectURL(recordingUrl);
      }
    };
  }, [recordingUrl, stopRecording, stopStreamTracks]);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Record</h1>

      <p className="mb-4 text-sm">
        API status: {apiOk === null ? "checking" : apiOk ? "connected" : "unreachable"}
      </p>

      <section className="mb-8 space-y-3 rounded border border-white/20 p-4">
        <p className="text-sm">Capture audio and submit it to create a job.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={isRecording || isSubmitting}
            className="rounded border border-white/30 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Start recording
          </button>
          <button
            type="button"
            onClick={stopRecording}
            disabled={!isRecording || isSubmitting}
            className="rounded border border-white/30 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Stop recording
          </button>
          <button
            type="button"
            onClick={() => {
              if (recordingBlob) {
                void submitRecording(recordingBlob);
              }
            }}
            disabled={!recordingBlob || isRecording || isSubmitting}
            className="rounded border border-white/30 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {isSubmitting ? "Submitting..." : "Submit recording"}
          </button>
          <button
            type="button"
            onClick={clearRecording}
            disabled={isRecording || isSubmitting || !recordingBlob}
            className="rounded border border-white/30 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Clear
          </button>
        </div>
        <p className="text-xs">
          State: {isRecording ? "recording" : recordingBlob ? "recorded" : "idle"}
        </p>
        {recordingUrl && <audio controls src={recordingUrl} className="w-full" />}
      </section>

      <section className="mb-8 space-y-2 rounded border border-white/20 p-4">
        <p className="text-sm">Fallback: upload a local audio file.</p>
        <input
          type="file"
          accept="audio/*"
          disabled={isRecording || isSubmitting}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void submitRecording(file);
            e.target.value = "";
          }}
        />
      </section>

      {error && <p className="mb-6 text-sm text-red-300">{error}</p>}

      {job && (
        <section className="space-y-2 rounded border border-white/20 p-4 text-sm">
          <p>Job ID: {job.id}</p>
          <p>Stage: {job.stage}</p>
          {job.error && <p className="text-red-300">Error: {job.error}</p>}
          {job.result?.transcript && <p>Transcript: {job.result.transcript}</p>}
        </section>
      )}
    </main>
  );
}
