import { randomUUID } from "crypto";
import type { JobRecord, JobStage } from "../types/job.js";
import type { StoryFilters } from "../types/filters.js";
import { defaultFilters } from "../types/filters.js";

const jobs = new Map<string, JobRecord>();

export function createJob(filters: Partial<StoryFilters> = {}): JobRecord {
  const id = randomUUID();
  const now = new Date().toISOString();
  const record: JobRecord = {
    id,
    createdAt: now,
    updatedAt: now,
    stage: "queued",
    filters: { ...defaultFilters, ...filters },
  };
  jobs.set(id, record);
  return record;
}

export function getJob(id: string): JobRecord | undefined {
  return jobs.get(id);
}

export function updateJob(
  id: string,
  patch: Partial<Pick<JobRecord, "stage" | "error" | "result" | "filters">>
): JobRecord | undefined {
  const existing = jobs.get(id);
  if (!existing) return undefined;
  const next: JobRecord = {
    ...existing,
    ...patch,
    filters: patch.filters ?? existing.filters,
    result: patch.result
      ? { ...existing.result, ...patch.result }
      : existing.result,
    updatedAt: new Date().toISOString(),
  };
  jobs.set(id, next);
  return next;
}

export function setStage(id: string, stage: JobStage): void {
  updateJob(id, { stage });
}
