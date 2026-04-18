import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { runPipelineStub } from "../pipeline/runPipeline.js";
import {
  createJob,
  getJob,
  updateJob,
} from "../store/jobsStore.js";
import { defaultFilters, storyFiltersSchema } from "../types/filters.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

export const jobsRouter = Router();

/** POST /api/jobs — multipart: audio file field `audio`, JSON filters optional */
jobsRouter.post("/", upload.single("audio"), (req, res) => {
  let filters = { ...defaultFilters };
  if (req.body.filters) {
    const raw =
      typeof req.body.filters === "string"
        ? JSON.parse(req.body.filters)
        : req.body.filters;
    const parsed = storyFiltersSchema.partial().safeParse(raw);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid filters", details: parsed.error.flatten() });
      return;
    }
    filters = { ...filters, ...parsed.data };
  } else {
    const parsed = createBodySchema.safeParse(req.body);
    if (parsed.success && parsed.data.filters) {
      filters = { ...filters, ...parsed.data.filters };
    }
  }

  if (!req.file) {
    res.status(400).json({ error: "Missing audio file (multipart field name: audio)" });
    return;
  }

  const job = createJob(filters);
  void runPipelineStub(job).catch((err) => {
    console.error("Pipeline error", job.id, err);
    updateJob(job.id, {
      stage: "failed",
      error: err instanceof Error ? err.message : "Pipeline failed",
    });
  });

  res.status(202).json({ jobId: job.id, stage: job.stage });
});

jobsRouter.get("/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

const refilterBodySchema = z.object({
  filters: storyFiltersSchema.partial(),
});

/** POST /api/jobs/:id/refilter — partial filter updates (cache invalidation TBD) */
jobsRouter.post("/:id/refilter", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const parsed = refilterBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  const next = updateJob(req.params.id, {
    filters: { ...job.filters, ...parsed.data.filters },
    stage: "queued",
  });
  if (!next) {
    res.status(500).json({ error: "Update failed" });
    return;
  }
  void runPipelineStub(next).catch((err) => {
    console.error("Refilter pipeline error", next.id, err);
    updateJob(next.id, {
      stage: "failed",
      error: err instanceof Error ? err.message : "Refilter failed",
    });
  });
  res.status(202).json({ jobId: next.id, stage: next.stage });
});
