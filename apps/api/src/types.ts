export type AssignmentStatus =
  | "not_submitted"
  | "submitted_ungraded"
  | "submitted_graded"
  | "draft"
  | "overdue";

export type TaskType = "assignment" | "quiz";

export interface CourseSummary {
  id: number;
  shortName: string;
  fullName: string;
  pointsEarned: number;
  pointsMax: number;
}

export interface LearningItem {
  id: number;
  itemType: TaskType;
  courseId: number;
  courseName: string;
  name: string;
  dueAt: string | null;
  status: AssignmentStatus;
  submittedAt: string | null;
  grade: number | null;
  maxGrade: number | null;
  url: string;
}

export type AssignmentItem = LearningItem;

export interface DashboardSummary {
  total: number;
  done: number;
  remaining: number;
  remainingQuiz: number;
  remainingNonQuiz: number;
  submittedNotGraded: number;
  overdue: number;
  progressPercent: number;
}

export interface WeeklyProgressDay {
  date: string;
  submittedCount: number;
}

export interface WeeklyStreak {
  scopeDays: number;
  currentStreak: number;
  bestStreak: number;
  totalSubmitted: number;
  byDay: WeeklyProgressDay[];
}

export interface DashboardPayload {
  courses: CourseSummary[];
  items: LearningItem[];
  assignments: LearningItem[];
  summary: DashboardSummary;
  weeklyStreak: WeeklyStreak;
}

export interface CourseFeedPayload {
  course: CourseSummary;
  items: LearningItem[];
  summary: DashboardSummary;
}

export interface MoodleSession {
  id: string;
  baseUrl: string;
  userId: number;
  userFullName: string;
  siteName: string;
  version: string;
  tokenEncrypted: string;
  createdAt: string;
}
