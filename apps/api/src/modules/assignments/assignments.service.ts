import { CourseFeedPayload, DashboardPayload, DashboardSummary, LearningItem, WeeklyStreak } from "../../types.js";
import { sessionStore } from "../../store/session-store.js";
import { decryptString } from "../../utils/crypto.js";
import { normalizeAssignmentStatus, parseSubmissionGrade } from "../moodle/normalizer.js";
import {
  MoodleAssignment,
  MoodleQuiz,
  MoodleQuizAttempt,
  MoodleSubmission,
  MoodleWsClient
} from "../moodle/ws-client.js";

function toIsoOrNull(unixSeconds?: number): string | null {
  if (!unixSeconds || unixSeconds <= 0) {
    return null;
  }
  return new Date(unixSeconds * 1000).toISOString();
}

const DONE_STATUSES = new Set(["submitted_ungraded", "submitted_graded"]);

function buildSummary(items: LearningItem[]): DashboardSummary {
  const total = items.length;
  const done = items.filter((item) => DONE_STATUSES.has(item.status)).length;
  const submittedNotGraded = items.filter((item) => item.status === "submitted_ungraded").length;
  const overdue = items.filter((item) => item.status === "overdue").length;

  return {
    total,
    done,
    submittedNotGraded,
    overdue,
    progressPercent: total === 0 ? 0 : Math.round((done / total) * 100)
  };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildWeeklyStreak(items: LearningItem[], scopeDays = 7): WeeklyStreak {
  const today = startOfDay(new Date());
  const firstDay = new Date(today);
  firstDay.setDate(today.getDate() - (scopeDays - 1));

  const byDaySeed: Array<{ date: Date; key: string; submittedCount: number }> = [];
  for (let i = 0; i < scopeDays; i += 1) {
    const day = new Date(firstDay);
    day.setDate(firstDay.getDate() + i);
    byDaySeed.push({
      date: day,
      key: formatDateKey(day),
      submittedCount: 0
    });
  }

  const dayMap = new Map(byDaySeed.map((day) => [day.key, day]));

  for (const item of items) {
    if (!item.submittedAt) {
      continue;
    }

    const submittedDate = startOfDay(new Date(item.submittedAt));
    if (Number.isNaN(submittedDate.getTime()) || submittedDate < firstDay || submittedDate > today) {
      continue;
    }

    const key = formatDateKey(submittedDate);
    const bucket = dayMap.get(key);
    if (bucket) {
      bucket.submittedCount += 1;
    }
  }

  const byDay = byDaySeed.map((day) => ({
    date: day.key,
    submittedCount: day.submittedCount
  }));

  let currentStreak = 0;
  for (let i = byDay.length - 1; i >= 0; i -= 1) {
    if (byDay[i].submittedCount > 0) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  let bestStreak = 0;
  let running = 0;
  for (const day of byDay) {
    if (day.submittedCount > 0) {
      running += 1;
      bestStreak = Math.max(bestStreak, running);
    } else {
      running = 0;
    }
  }

  const totalSubmitted = byDay.reduce((sum, day) => sum + day.submittedCount, 0);

  return {
    scopeDays,
    currentStreak,
    bestStreak,
    totalSubmitted,
    byDay
  };
}

function normalizeQuizStatus(quiz: MoodleQuiz, attempts: MoodleQuizAttempt[]): {
  status: LearningItem["status"];
  submittedAt: string | null;
  grade: number | null;
  maxGrade: number | null;
} {
  const now = Date.now();
  const dueDateMs = quiz.timeclose ? quiz.timeclose * 1000 : null;
  const finishedAttempt = attempts.find((attempt) => attempt.state === "finished");
  const inProgressAttempt = attempts.find((attempt) => attempt.state === "inprogress" || attempt.state === "overdue");

  if (finishedAttempt) {
    return {
      status: "submitted_graded",
      submittedAt: toIsoOrNull(finishedAttempt.timefinish ?? finishedAttempt.timemodified),
      grade: typeof finishedAttempt.sumgrades === "number" ? finishedAttempt.sumgrades : null,
      maxGrade:
        typeof quiz.sumgrades === "number"
          ? quiz.sumgrades
          : typeof quiz.grade === "number"
            ? quiz.grade
            : null
    };
  }

  if (inProgressAttempt) {
    return {
      status: dueDateMs && dueDateMs < now ? "overdue" : "draft",
      submittedAt: toIsoOrNull(inProgressAttempt.timemodified),
      grade: null,
      maxGrade:
        typeof quiz.sumgrades === "number"
          ? quiz.sumgrades
          : typeof quiz.grade === "number"
            ? quiz.grade
            : null
    };
  }

  return {
    status: dueDateMs && dueDateMs < now ? "overdue" : "not_submitted",
    submittedAt: null,
    grade: null,
    maxGrade:
      typeof quiz.sumgrades === "number"
        ? quiz.sumgrades
        : typeof quiz.grade === "number"
          ? quiz.grade
          : null
  };
}

function buildAssignmentItems(params: {
  baseUrl: string;
  userId: number;
  assignments: MoodleAssignment[];
  submissionsByAssignment: Map<number, MoodleSubmission[]>;
  courseById: Map<number, { fullname: string }>;
}): LearningItem[] {
  return params.assignments.map((assignment) => {
    const submission = (params.submissionsByAssignment.get(assignment.id) ?? []).find(
      (row) => row.userid === params.userId
    ) ?? null;

    const status = normalizeAssignmentStatus({ assignment, submission });
    const grade = parseSubmissionGrade(submission);

    return {
      id: assignment.id,
      itemType: "assignment",
      courseId: assignment.course,
      courseName: params.courseById.get(assignment.course)?.fullname ?? "Unknown course",
      name: assignment.name,
      dueAt: toIsoOrNull(assignment.duedate),
      status,
      submittedAt: toIsoOrNull(submission?.timemodified),
      grade,
      maxGrade: typeof assignment.grade === "number" ? assignment.grade : null,
      url: `${params.baseUrl}/mod/assign/view.php?id=${assignment.cmid ?? assignment.id}`
    };
  });
}

async function buildQuizItems(params: {
  baseUrl: string;
  userId: number;
  quizzes: MoodleQuiz[];
  client: MoodleWsClient;
  courseById: Map<number, { fullname: string }>;
}): Promise<LearningItem[]> {
  const attempts = await Promise.all(
    params.quizzes.map(async (quiz) => {
      try {
        const quizAttempts = await params.client.getQuizAttempts(quiz.id, params.userId);
        return [quiz.id, quizAttempts] as const;
      } catch {
        return [quiz.id, [] as MoodleQuizAttempt[]] as const;
      }
    })
  );

  const attemptsByQuiz = new Map<number, MoodleQuizAttempt[]>(attempts);

  return params.quizzes.map((quiz) => {
    const quizAttempts = attemptsByQuiz.get(quiz.id) ?? [];
    const normalized = normalizeQuizStatus(quiz, quizAttempts);

    return {
      id: quiz.id,
      itemType: "quiz",
      courseId: quiz.course,
      courseName: params.courseById.get(quiz.course)?.fullname ?? "Unknown course",
      name: quiz.name,
      dueAt: toIsoOrNull(quiz.timeclose),
      status: normalized.status,
      submittedAt: normalized.submittedAt,
      grade: normalized.grade,
      maxGrade: normalized.maxGrade,
      url: `${params.baseUrl}/mod/quiz/view.php?id=${quiz.coursemodule ?? quiz.id}`
    };
  });
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
  const quizzes = await client.getQuizzes(courses.map((course) => course.id)).catch(() => []);

  const courseById = new Map(courses.map((course) => [course.id, course]));

  const assignmentItems = buildAssignmentItems({
    baseUrl: session.baseUrl,
    userId: session.userId,
    assignments,
    submissionsByAssignment,
    courseById
  });

  const quizItems = await buildQuizItems({
    baseUrl: session.baseUrl,
    userId: session.userId,
    quizzes,
    client,
    courseById
  });

  const allItems = [...assignmentItems, ...quizItems].sort((a, b) => {
    if (!a.dueAt) {
      return 1;
    }
    if (!b.dueAt) {
      return -1;
    }
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });

  const summary = buildSummary(allItems);

  const courseSummaries = courses.map((course) => ({
    id: course.id,
    shortName: course.shortname,
    fullName: course.fullname,
    pointsEarned: 0,
    pointsMax: allItems
      .filter((item) => item.courseId === course.id)
      .reduce((sum, item) => sum + (item.maxGrade ?? 0), 0)
  }));

  return {
    courses: courseSummaries,
    items: allItems,
    assignments: allItems,
    summary,
    weeklyStreak: buildWeeklyStreak(allItems)
  };
}

export async function buildCourseFeed(sessionId: string, courseId: number): Promise<CourseFeedPayload> {
  const dashboard = await buildDashboard(sessionId);
  const course = dashboard.courses.find((item) => item.id === courseId);
  if (!course) {
    throw new Error("Course not found for this user.");
  }

  const items = dashboard.items.filter((item) => item.courseId === courseId);
  return {
    course,
    items,
    summary: buildSummary(items)
  };
}
