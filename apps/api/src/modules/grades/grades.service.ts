import { CourseSummary } from "../../types.js";
import { sessionStore } from "../../store/session-store.js";
import { decryptString } from "../../utils/crypto.js";
import { buildDashboard } from "../assignments/assignments.service.js";
import { MoodleWsClient } from "../moodle/ws-client.js";

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function getCoursesWithPoints(sessionId: string): Promise<CourseSummary[]> {
  const session = sessionStore.get(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const token = decryptString(session.tokenEncrypted);
  const client = new MoodleWsClient(session.baseUrl, token);

  const dashboard = await buildDashboard(sessionId);

  const results = await Promise.all(
    dashboard.courses.map(async (course) => {
      try {
        const gradeItems = await client.getCourseGradeItems(course.id, session.userId);
        const pointsEarned = gradeItems.reduce((sum, item) => sum + safeNumber(item.graderaw), 0);
        const gradeMax = gradeItems.reduce((sum, item) => sum + safeNumber(item.grademax), 0);

        return {
          ...course,
          pointsEarned: Math.round(pointsEarned * 100) / 100,
          pointsMax: gradeMax > 0 ? Math.round(gradeMax * 100) / 100 : course.pointsMax
        };
      } catch {
        return course;
      }
    })
  );

  return results;
}
