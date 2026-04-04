import path from "path";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../../config.js";
import { sessionStore } from "../../store/session-store.js";
import { decryptString } from "../../utils/crypto.js";
import { MoodleWsClient } from "../moodle/ws-client.js";

type ExportScope = "all" | "course" | "section";

export interface ExportJobPayload {
  sessionId: string;
  scope: ExportScope;
  courseId?: number;
  sectionNumber?: number;
}

const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null
});

const exportQueue = new Queue("pdf-export", { connection: redis });

export async function createExportJob(payload: ExportJobPayload): Promise<string> {
  const session = sessionStore.get(payload.sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const token = decryptString(session.tokenEncrypted);
  const client = new MoodleWsClient(session.baseUrl, token);
  const courses = await client.getCourses(session.userId);

  const selectedCourseIds =
    payload.scope === "all"
      ? courses.map((course) => course.id)
      : payload.courseId
        ? [payload.courseId]
        : [];

  if (selectedCourseIds.length === 0) {
    throw new Error("No courses selected for export.");
  }

  const resources: Array<{
    courseId: number;
    courseName: string;
    sectionNumber: number;
    moduleName: string;
    moduleType: string;
    url: string | null;
  }> = [];

  for (const courseId of selectedCourseIds) {
    const sections = await client.getCourseContents(courseId);
    const courseName = courses.find((course) => course.id === courseId)?.fullname ?? `Course ${courseId}`;

    for (const section of sections) {
      if (payload.scope === "section" && payload.sectionNumber !== section.section) {
        continue;
      }

      for (const module of section.modules ?? []) {
        if (module.modname !== "resource" && module.modname !== "page") {
          continue;
        }

        resources.push({
          courseId,
          courseName,
          sectionNumber: section.section,
          moduleName: module.name,
          moduleType: module.modname,
          url: module.url ?? null
        });
      }
    }
  }

  const job = await exportQueue.add(
    "generate-pdf",
    {
      requestedAt: new Date().toISOString(),
      scope: payload.scope,
      courseId: payload.courseId ?? null,
      sectionNumber: payload.sectionNumber ?? null,
      resources
    },
    {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnFail: false,
      removeOnComplete: false
    }
  );

  return String(job.id);
}

export async function getExportJobStatus(jobId: string): Promise<{
  id: string;
  state: string;
  progress: number;
  downloadPath: string | null;
  error: string | null;
}> {
  const job = await exportQueue.getJob(jobId);
  if (!job) {
    throw new Error("Export job not found.");
  }

  const state = await job.getState();
  const result = (await job.returnvalue) as { fileName?: string } | undefined;

  return {
    id: job.id ? String(job.id) : jobId,
    state,
    progress: Number(job.progress ?? 0),
    downloadPath: result?.fileName ? path.posix.join("/exports", result.fileName) : null,
    error: job.failedReason ?? null
  };
}
