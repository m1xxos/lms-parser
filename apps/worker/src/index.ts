import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import PDFDocument from "pdfkit";

dotenv.config();

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const exportDir = process.env.EXPORT_DIR ?? "/app/exports";

fs.mkdirSync(exportDir, { recursive: true });

function pickPdfFontPath(): string | null {
  const candidates = [
    process.env.PDF_FONT_PATH,
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
  ].filter((item): item is string => Boolean(item));

  for (const fontPath of candidates) {
    if (fs.existsSync(fontPath)) {
      return fontPath;
    }
  }

  return null;
}

const pdfFontPath = pickPdfFontPath();

interface ExportResource {
  courseId: number;
  courseName: string;
  sectionNumber: number;
  moduleName: string;
  moduleType: string;
  url: string | null;
  textContent: string;
}

interface ExportPayload {
  requestedAt: string;
  scope: "all" | "course" | "section";
  courseId: number | null;
  sectionNumber: number | null;
  resources: ExportResource[];
}

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null
});

function groupByCourse(resources: ExportResource[]): Map<string, ExportResource[]> {
  const grouped = new Map<string, ExportResource[]>();
  for (const item of resources) {
    const key = `${item.courseId}::${item.courseName}`;
    const current = grouped.get(key) ?? [];
    current.push(item);
    grouped.set(key, current);
  }
  return grouped;
}

async function renderPdf(filePath: string, payload: ExportPayload): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    if (pdfFontPath) {
      doc.font(pdfFontPath);
    }

    doc.fontSize(22).text("Moodle Course Materials Export");
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#555").text(`Requested at: ${payload.requestedAt}`);
    doc.text(`Scope: ${payload.scope}`);
    doc.text(`Items: ${payload.resources.length}`);
    doc.moveDown();

    doc.fillColor("#111");

    const byCourse = groupByCourse(payload.resources);

    for (const [key, items] of byCourse.entries()) {
      const [, courseName] = key.split("::");
      doc.fontSize(16).text(courseName);
      doc.moveDown(0.3);

      const sorted = [...items].sort((a, b) => {
        if (a.sectionNumber === b.sectionNumber) {
          return a.moduleName.localeCompare(b.moduleName);
        }
        return a.sectionNumber - b.sectionNumber;
      });

      for (const resource of sorted) {
        doc.fontSize(11).text(`Section ${resource.sectionNumber} · [${resource.moduleType}] ${resource.moduleName}`);
        doc.moveDown(0.2);
        doc.fontSize(10).fillColor("#1b2a2f").text(resource.textContent || "Текст материала недоступен.", {
          align: "left"
        });
        doc.fillColor("#111");

        if (resource.url) {
          doc.moveDown(0.2);
          doc.fillColor("#1f6feb").fontSize(9).text(`Источник: ${resource.url}`, {
            link: resource.url,
            underline: true
          });
          doc.fillColor("#111");
        }

        doc.moveDown(0.8);
      }

      doc.moveDown();
    }

    if (payload.resources.length === 0) {
      doc.fontSize(12).fillColor("#b54708").text("No resource/page materials found for selected scope.");
      doc.fillColor("#111");
    }

    doc.end();

    stream.on("finish", () => resolve());
    stream.on("error", (error) => reject(error));
  });
}

new Worker<ExportPayload>(
  "pdf-export",
  async (job) => {
    await job.updateProgress(10);

    const fileName = `export-${job.id}-${Date.now()}.pdf`;
    const filePath = path.join(exportDir, fileName);

    await job.updateProgress(40);
    await renderPdf(filePath, job.data);
    await job.updateProgress(100);

    return { fileName };
  },
  { connection: redis }
);

console.log("PDF worker started");
