import type { JobRecord, StoryFilters } from "../types/job";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function fetchHealth(): Promise<{ ok: boolean; service: string }> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json() as Promise<{ ok: boolean; service: string }>;
}

export async function createJob(
  audio: Blob,
  filters: StoryFilters
): Promise<{ jobId: string; stage: string }> {
  const form = new FormData();
  form.append("audio", audio, "recording.webm");
  form.append("filters", JSON.stringify(filters));
  const res = await fetch("/api/jobs", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err === "object" && err && "error" in err
        ? String((err as { error: string }).error)
        : `Create job failed: ${res.status}`
    );
  }
  return res.json() as Promise<{ jobId: string; stage: string }>;
}

export async function getJob(id: string): Promise<JobRecord> {
  const res = await fetch(`/api/jobs/${id}`);
  if (!res.ok) throw new Error(`Get job failed: ${res.status}`);
  return res.json() as Promise<JobRecord>;
}

export async function refilterJob(
  id: string,
  filters: Partial<StoryFilters>
): Promise<{ jobId: string; stage: string }> {
  const res = await fetch(`/api/jobs/${id}/refilter`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ filters }),
  });
  if (!res.ok) throw new Error(`Refilter failed: ${res.status}`);
  return res.json() as Promise<{ jobId: string; stage: string }>;
}
