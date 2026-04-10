import path from "path";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import * as cheerio from "cheerio";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
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

function htmlToText(raw: string): string {
  const $ = cheerio.load(raw);
  const text = $.text().replace(/\s+/g, " ").trim();
  return text;
}

function htmlDocumentToText(rawHtml: string): string {
  const $ = cheerio.load(rawHtml);
  $("script, style, noscript").remove();

  const candidateSelectors = [
    ".mod_page-content",
    ".generalbox",
    "#region-main",
    "main",
    "body"
  ];

  for (const selector of candidateSelectors) {
    const text = $(selector).first().text().replace(/\s+/g, " ").trim();
    if (text && text.length > 40) {
      return text;
    }
  }

  return $.text().replace(/\s+/g, " ").trim();
}

function isLoginLikeText(value: string): boolean {
  const lowered = value.toLowerCase();
  return (
    (lowered.includes("зайти на") && lowered.includes("логин")) ||
    lowered.includes("login or email") ||
    lowered.includes("forgotten your username or password")
  );
}

function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

async function extractModuleText(module: {
  modname: string;
  url?: string;
  description?: string;
  contents?: Array<{
    content?: string;
    fileurl?: string;
    mimetype?: string;
    filename?: string;
  }>;
}, client: MoodleWsClient): Promise<string> {
  const chunks: string[] = [];

  if (module.description) {
    const descriptionText = htmlToText(module.description);
    if (descriptionText) {
      chunks.push(descriptionText);
    }
  }

  for (const content of module.contents ?? []) {
    if (content.content) {
      const parsedContent = htmlToText(content.content);
      if (parsedContent) {
        chunks.push(parsedContent);
      }
    }

    if (content.fileurl) {
      const normalizedMime = content.mimetype?.toLowerCase() ?? "";
      const normalizedFileName = content.filename?.toLowerCase() ?? "";

      const isPdf = normalizedMime === "application/pdf" || normalizedFileName.endsWith(".pdf");
      const isDocx =
        normalizedMime ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        normalizedFileName.endsWith(".docx");

      if (isPdf) {
        const pdfBuffer = await client.downloadFileBuffer(content.fileurl).catch(() => null);
        if (pdfBuffer) {
          const parsed = await pdfParse(pdfBuffer).catch(() => null);
          const pdfText = parsed?.text?.trim();
          if (pdfText) {
            chunks.push(pdfText);
          }
        }
      } else if (isDocx) {
        const docxBuffer = await client.downloadFileBuffer(content.fileurl).catch(() => null);
        if (docxBuffer) {
          const parsed = await mammoth.extractRawText({ buffer: docxBuffer }).catch(() => null);
          const docxText = parsed?.value?.trim();
          if (docxText) {
            chunks.push(docxText);
          }
        }
      } else {
        const fileText = await client.downloadTextFromFile(content.fileurl, content.mimetype).catch(() => null);
        if (fileText) {
          chunks.push(fileText);
        }
      }
    }
  }

  const merged = chunks
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!merged && module.url) {
    const pageHtml = await client.downloadHtmlFromUrl(module.url).catch(() => null);
    if (pageHtml) {
      const pageText = htmlDocumentToText(pageHtml);
      if (pageText && !isLoginLikeText(pageText)) {
        return clipText(pageText, 24000);
      }
    }
  }

  if (!merged) {
    return "Текстовое содержимое недоступно для этого материала (возможно бинарный формат или ограниченный доступ).";
  }

  return clipText(merged, 24000);
}

function extractSectionSummaryText(summary?: string): string | null {
  if (!summary) {
    return null;
  }

  const text = htmlToText(summary);
  return text || null;
}

export async function createExportJob(payload: ExportJobPayload): Promise<string> {
  const session = await sessionStore.get(payload.sessionId);
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
    textContent: string;
  }> = [];

  for (const courseId of selectedCourseIds) {
    const sections = await client.getCourseContents(courseId);
    const pages = await client.getPagesByCourses([courseId]).catch(() => []);
    const courseName = courses.find((course) => course.id === courseId)?.fullname ?? `Course ${courseId}`;
    const pageTextByModuleId = new Map<number, string>();

    for (const page of pages) {
      const pageText = [page.intro, page.content]
        .map((item) => (item ? htmlToText(item) : ""))
        .filter(Boolean)
        .join("\n\n")
        .trim();

      if (pageText) {
        pageTextByModuleId.set(page.coursemodule, clipText(pageText, 24000));
      }
    }

    for (const section of sections) {
      if (payload.scope === "section" && payload.sectionNumber !== section.section) {
        continue;
      }

      const sectionSummary = extractSectionSummaryText(section.summary);
      if (sectionSummary) {
        resources.push({
          courseId,
          courseName,
          sectionNumber: section.section,
          moduleName: section.name || `Section ${section.section}`,
          moduleType: "section-summary",
          url: null,
          textContent: clipText(sectionSummary, 24000)
        });
      }

      for (const module of section.modules ?? []) {
        if (!["resource", "page", "label", "book", "folder", "url"].includes(module.modname)) {
          continue;
        }

        const textContent =
          module.modname === "page" && pageTextByModuleId.has(module.id)
            ? pageTextByModuleId.get(module.id) ?? ""
            : await extractModuleText(module, client);

        resources.push({
          courseId,
          courseName,
          sectionNumber: section.section,
          moduleName: module.name,
          moduleType: module.modname,
          url: module.url ?? null,
          textContent
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
