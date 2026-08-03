export const CAREER_CAPTURE_LEASE_MS = 2 * 60_000;
export const CAREER_CAPTURE_MAX_AUTOMATIC_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000] as const;

export type CareerCaptureSnapshot = {
  userId: string;
  applicationId: string;
  questionId: string;
  answerHash: string;
  answerRevision: number;
};

export function nextCareerCaptureAttemptAt(
  completedAttemptCount: number,
  now: Date,
): Date | null {
  const delay = RETRY_DELAYS_MS[completedAttemptCount - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay);
}

export function canAutomaticallyClaimCareerCapture(input: {
  status:
    | "PENDING"
    | "PROCESSING"
    | "SUCCEEDED"
    | "FAILED"
    | "SKIPPED"
    | "SUPERSEDED";
  attemptCount: number;
  nextAttemptAt: Date | null;
  leaseExpiresAt: Date | null;
  now: Date;
}): boolean {
  if (input.attemptCount >= CAREER_CAPTURE_MAX_AUTOMATIC_ATTEMPTS) return false;
  if (input.status === "PENDING") {
    return !input.nextAttemptAt || input.nextAttemptAt <= input.now;
  }
  return (
    input.status === "PROCESSING" &&
    Boolean(input.leaseExpiresAt && input.leaseExpiresAt <= input.now)
  );
}

export function isCurrentCareerCaptureSnapshot(
  task: CareerCaptureSnapshot,
  question: CareerCaptureSnapshot & {
    isCompleted: boolean;
  },
): boolean {
  return (
    question.isCompleted &&
    task.userId === question.userId &&
    task.applicationId === question.applicationId &&
    task.questionId === question.questionId &&
    task.answerHash === question.answerHash &&
    task.answerRevision === question.answerRevision
  );
}

export function doesCareerCaptureBlockDone(status: string): boolean {
  return status === "PENDING" || status === "PROCESSING" || status === "FAILED";
}
