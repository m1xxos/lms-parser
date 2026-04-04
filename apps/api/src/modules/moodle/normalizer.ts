import { AssignmentStatus } from "../../types.js";
import { MoodleAssignment, MoodleSubmission } from "./ws-client.js";

function hasNumericGrade(submission: MoodleSubmission | null): boolean {
  if (!submission) {
    return false;
  }

  const candidate = submission.grade?.grade;
  return typeof candidate === "number" && Number.isFinite(candidate);
}

export function normalizeAssignmentStatus(params: {
  assignment: MoodleAssignment;
  submission: MoodleSubmission | null;
  now?: Date;
}): AssignmentStatus {
  const now = params.now ?? new Date();
  const dueDateMs = params.assignment.duedate ? params.assignment.duedate * 1000 : null;

  if (!params.submission) {
    if (dueDateMs && dueDateMs < now.getTime()) {
      return "overdue";
    }
    return "not_submitted";
  }

  const submissionStatus = params.submission.status ?? "";
  if (submissionStatus === "draft") {
    return "draft";
  }

  if (params.submission.gradingstatus === "graded" || hasNumericGrade(params.submission)) {
    return "submitted_graded";
  }

  return "submitted_ungraded";
}

export function parseSubmissionGrade(submission: MoodleSubmission | null): number | null {
  const value = submission?.grade?.grade;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}
