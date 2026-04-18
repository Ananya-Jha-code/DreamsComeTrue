import { useLocation, useNavigate } from "react-router-dom";
import { defaultFilters, getFilterLabel } from "../filters";
import type { StoryFilters } from "../types/job";

type RecordLocationState = { filters?: StoryFilters };

export default function RecordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as RecordLocationState | null) ?? null;
  const filters = state?.filters ?? defaultFilters;

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => navigate("/picker", { state: { filters } })}
          className="text-xs font-sans text-amber-glow/60 hover:text-amber-glow/90 mb-4"
        >
          ← Back to Picker
        </button>
        <h1 className="text-3xl md:text-4xl text-amber-soft/95 tracking-tight mb-2">Record</h1>
        <p className="text-amber-glow/70 text-sm mb-8">
          Recording flow scaffolding placeholder. Wire microphone capture + silence detection next.
        </p>
        <div className="rounded-2xl border border-night-700 bg-night-800/60 p-5">
          <p className="text-xs uppercase tracking-wider text-amber-glow/60 font-sans mb-2">Selected Filters</p>
          <ul className="space-y-1 text-sm text-amber-soft/90">
            <li>Visual: {getFilterLabel("visualStyle", filters.visualStyle)}</li>
            <li>Voice: {getFilterLabel("narratorVoice", filters.narratorVoice)}</li>
            <li>Reading Level: {getFilterLabel("readingLevel", filters.readingLevel)}</li>
            <li>Tone: {getFilterLabel("tone", filters.tone)}</li>
            <li>Pacing: {getFilterLabel("pacing", filters.pacing)}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

