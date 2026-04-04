import express from "express";
import cors from "cors";
import path from "path";
import { z } from "zod";
import { config } from "./config.js";
import { sessionStore } from "./store/session-store.js";
import { connectToMoodle } from "./modules/moodle/auth.js";
import { buildDashboard } from "./modules/assignments/assignments.service.js";
import { getCoursesWithPoints } from "./modules/grades/grades.service.js";
import { createExportJob, getExportJobStatus } from "./modules/export/export.service.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/exports", express.static(path.resolve(config.exportDir)));

const connectSchema = z.object({
  baseUrl: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1)
});

const sessionIdQuerySchema = z.object({
  sessionId: z.string().uuid()
});

const createExportSchema = z
  .object({
    sessionId: z.string().uuid(),
    scope: z.enum(["all", "course", "section"]),
    courseId: z.number().int().positive().optional(),
    sectionNumber: z.number().int().nonnegative().optional()
  })
  .superRefine((value, ctx) => {
    if ((value.scope === "course" || value.scope === "section") && !value.courseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["courseId"],
        message: "courseId is required for scope=course or section"
      });
    }

    if (value.scope === "section" && typeof value.sectionNumber !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sectionNumber"],
        message: "sectionNumber is required for scope=section"
      });
    }
  });

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/connect", async (req, res) => {
  try {
    const input = connectSchema.parse(req.body);
    const connected = await connectToMoodle(input);

    const session = sessionStore.create({
      baseUrl: connected.baseUrl,
      userId: connected.userId,
      userFullName: connected.userFullName,
      siteName: connected.siteName,
      version: connected.version,
      token: connected.token
    });

    res.json({
      sessionId: session.id,
      siteName: connected.siteName,
      version: connected.version,
      userFullName: connected.userFullName
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to connect to Moodle.";
    res.status(400).json({ error: message });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const { sessionId } = sessionIdQuerySchema.parse(req.query);
    const dashboard = await buildDashboard(sessionId);
    res.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard.";
    res.status(400).json({ error: message });
  }
});

app.get("/api/courses", async (req, res) => {
  try {
    const { sessionId } = sessionIdQuerySchema.parse(req.query);
    const courses = await getCoursesWithPoints(sessionId);
    res.json({ courses });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load courses.";
    res.status(400).json({ error: message });
  }
});

app.post("/api/export", async (req, res) => {
  try {
    const payload = createExportSchema.parse(req.body);
    const jobId = await createExportJob(payload);
    res.json({ jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start export.";
    res.status(400).json({ error: message });
  }
});

app.get("/api/export/:jobId", async (req, res) => {
  try {
    const status = await getExportJobStatus(req.params.jobId);
    res.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get export status.";
    res.status(404).json({ error: message });
  }
});

app.listen(config.apiPort, () => {
  console.log(`API listening on ${config.apiPort}`);
});
