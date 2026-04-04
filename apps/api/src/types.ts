export type AssignmentStatus =
  | "not_submitted"
  | "submitted_ungraded"
  | "submitted_graded"
  | "draft"
  | "overdue";

export interface CourseSummary {
  id: number;
  shortName: string;
  fullName: string;
  pointsEarned: number;
  pointsMax: number;
}

export interface AssignmentItem {
  id: number;
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

export interface DashboardSummary {
  total: number;
  done: number;
  submittedNotGraded: number;
  overdue: number;
  progressPercent: number;
}

export interface DashboardPayload {
  courses: CourseSummary[];
  assignments: AssignmentItem[];
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
