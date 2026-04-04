import { DashboardPayload } from "../../types.js";
import { sessionStore } from "../../store/session-store.js";
import { decryptString } from "../../utils/crypto.js";
import { normalizeAssignmentStatus, parseSubmissionGrade } from "../moodle/normalizer.js";
import { MoodleWsClient } from "../moodle/ws-client.js";

function toIsoOrNull(unixSeconds?: number): string | null {
  if (!unixSeconds || unixSeconds <= 0) {
    return null;
  }
  return new Date(unixSeconds * 1000).toISOString();
}

export async function buildDashboard(sessionId: string): Promise<DashboardPayload> {
  const session = sessionStore.get(sessionId);
  if (!session) {
    throw new Error("Session not found.");
  }

  const token = decryptString(session.tokenEncrypted);
  const client = new MoodleWsClient(session.baseUrl, token);

  const courses = await client.getCourses(session.userId);
  const assignments = await client.getAssignments(courses.map((course) => course.id));
  const submissionsByAssignment = await client.getSubmissions(assignments.map((item) => item.id));

  const courseById = new Map(courses.map((course) => [course.id, course]));

  const normalizedAssignments = assignments.map((assignment) => {
    const submission = (submissionsByAssignment.get(assignment.id) ?? []).find(
      (row) => row.userid === session.userId
    ) ?? null;

    const status = normalizeAssignmentStatus({ assignment, submission });
    const grade = parseSubmissionGrade(submission);

    return {
      id: assignment.id,
      courseId: assignment.course,
      courseName: courseById.get(assignment.course)?.fullname ?? "Unknown course",
      name: assignment.name,
      dueAt: toIsoOrNull(assignment.duedate),
      status,
      submittedAt: toIsoOrNull(submission?.timemodified),
      grade,
      maxGrade: typeof assignment.grade === "number" ? assignment.grade : null,
      url: `${session.baseUrl}/mod/assign/view.php?id=${assignment.cmid ?? assignment.id}`
    };
  });

  const done = normalizedAssignments.filter(
    (item) => item.status === "submitted_ungraded" || item.status === "submitted_graded"
  ).length;
  const total = normalizedAssignments.length;
  const submittedNotGraded = normalizedAssignments.filter(
    (item) => item.status === "submitted_ungraded"
  ).length;
  const overdue = normalizedAssignments.filter((item) => item.status === "overdue").length;

  const summary = {
    total,
    done,
    submittedNotGraded,
    overdue,
    progressPercent: total === 0 ? 0 : Math.round((done / total) * 100)
  };

  const courseSummaries = courses.map((course) => ({
    id: course.id,
    shortName: course.shortname,
    fullName: course.fullname,
    pointsEarned: 0,
    pointsMax: normalizedAssignments
      .filter((item) => item.courseId === course.id)
      .reduce((sum, item) => sum + (item.maxGrade ?? 0), 0)
  }));

  return {
    courses: courseSummaries,
    assignments: normalizedAssignments.sort((a, b) => {
      if (!a.dueAt) {
        return 1;
      }
      if (!b.dueAt) {
        return -1;
      }
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    }),
    summary
  };
}
