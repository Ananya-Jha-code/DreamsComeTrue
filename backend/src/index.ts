import "dotenv/config";
import cors from "cors";
import express from "express";
import { jobsRouter } from "./routes/jobs.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "lullaby-api" });
});

app.use("/api/jobs", jobsRouter);

app.listen(PORT, () => {
  console.log(`Lullaby API listening on http://localhost:${PORT}`);
});
