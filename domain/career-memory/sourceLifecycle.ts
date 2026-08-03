export const CAREER_SOURCE_STATUSES = [
  "UPLOADED",
  "QUEUED",
  "PARSING",
  "INDEXING",
  "EXTRACTING",
  "READY",
  "FAILED",
] as const;

export type CareerSourceStatusValue = (typeof CAREER_SOURCE_STATUSES)[number];

const allowedTransitions: Readonly<
  Record<CareerSourceStatusValue, readonly CareerSourceStatusValue[]>
> = {
  UPLOADED: ["QUEUED", "FAILED"],
  QUEUED: ["PARSING", "FAILED"],
  PARSING: ["INDEXING", "FAILED"],
  INDEXING: ["EXTRACTING", "FAILED"],
  EXTRACTING: ["READY", "FAILED"],
  READY: [],
  FAILED: ["QUEUED"],
};

export function assertCareerSourceTransition(
  from: CareerSourceStatusValue,
  to: CareerSourceStatusValue,
) {
  if (!allowedTransitions[from].includes(to)) {
    throw new Error(`Invalid career source transition: ${from} -> ${to}`);
  }
}

export function canRetryCareerSource(status: CareerSourceStatusValue) {
  return status === "FAILED";
}

export function isCareerSourceBusy(status: CareerSourceStatusValue) {
  return (
    status === "UPLOADED" ||
    status === "QUEUED" ||
    status === "PARSING" ||
    status === "INDEXING" ||
    status === "EXTRACTING"
  );
}
