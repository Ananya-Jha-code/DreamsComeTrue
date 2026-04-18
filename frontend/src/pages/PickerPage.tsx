import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FILTER_CONFIG, defaultFilters, getFilterLabel } from "../filters";
import type { StoryFilters } from "../types/job";

function FilterRow(props: {
  title: string;
  valueLabel: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { title, valueLabel, expanded, onToggle, children } = props;
  return (
    <div className="rounded-2xl border border-night-700 bg-night-800/70">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-4"
      >
        <div>
          <p className="text-xs uppercase tracking-wider text-amber-glow/60 font-sans">{title}</p>
          <p className="text-amber-soft">{valueLabel}</p>
        </div>
        <span className="text-amber-glow/60 font-sans text-xs">{expanded ? "Hide" : "Change"}</span>
      </button>
      {expanded ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}

export default function PickerPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<StoryFilters>(defaultFilters);
  const [openAxis, setOpenAxis] = useState<keyof StoryFilters | null>("visualStyle");

  const summary = useMemo(
    () =>
      `${getFilterLabel("visualStyle", filters.visualStyle)} • ${getFilterLabel("narratorVoice", filters.narratorVoice)} • ${getFilterLabel("readingLevel", filters.readingLevel)} • ${getFilterLabel("tone", filters.tone)} • ${getFilterLabel("pacing", filters.pacing)}`,
    [filters]
  );

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-xs font-sans text-amber-glow/60 hover:text-amber-glow/90 mb-4"
        >
          ← Back
        </button>
        <h1 className="text-3xl md:text-4xl text-amber-soft/95 tracking-tight mb-2">Choose your version</h1>
        <p className="text-amber-glow/70 text-sm mb-8">
          Pick one value in each axis. Defaults are already set so you can continue immediately.
        </p>

        <div className="space-y-4">
          {FILTER_CONFIG.map((axis) => (
            <div key={axis.key}>
              <FilterRow
                title={axis.title}
                valueLabel={getFilterLabel(axis.key, filters[axis.key])}
                expanded={openAxis === axis.key}
                onToggle={() =>
                  setOpenAxis((prev: keyof StoryFilters | null) =>
                    prev === axis.key ? null : axis.key
                  )
                }
              >
                <div className="grid sm:grid-cols-2 gap-2">
                  {axis.options.map((option) => {
                    const selected = filters[axis.key] === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setFilters((prev: StoryFilters) => ({
                            ...prev,
                            [axis.key]: option.value,
                          }))
                        }
                        className={`rounded-xl px-3 py-2 text-left border font-sans text-sm transition-colors ${
                          selected
                            ? "border-amber-glow/70 bg-amber-glow/20 text-amber-soft"
                            : "border-night-700 bg-night-900/40 text-amber-glow/75 hover:border-amber-glow/35"
                        }`}
                      >
                        <div>{option.label}</div>
                        {option.subtitle ? (
                          <div className="text-xs opacity-75 mt-1">{option.subtitle}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </FilterRow>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-night-700 bg-night-800/60 p-4">
          <p className="text-xs uppercase tracking-wider text-amber-glow/60 font-sans mb-2">Current configuration</p>
          <p className="text-sm text-amber-soft/90 leading-relaxed">{summary}</p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setFilters(defaultFilters)}
            className="rounded-full border border-night-700 text-amber-glow/80 px-5 py-2 text-sm font-sans hover:border-amber-glow/40"
          >
            Reset defaults
          </button>
          <button
            type="button"
            onClick={() => navigate("/record", { state: { filters } })}
            className="rounded-full bg-amber-glow/20 hover:bg-amber-glow/30 border border-amber-glow/40 text-amber-soft px-6 py-2 text-sm font-sans"
          >
            Continue to Record
          </button>
        </div>
      </div>
    </div>
  );
}

