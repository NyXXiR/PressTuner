export type ImportStatus =
  | "WAITING_SOURCE"
  | "QUEUED"
  | "EXTRACTING"
  | "REVIEW_REQUIRED"
  | "COMPLETE"
  | "FAILED";

export const INITIAL_IMPORT_POLL_DELAY_MS = 2_000;
export const MAX_IMPORT_POLL_DELAY_MS = 30_000;

const PROCESSING_STATUSES = new Set<ImportStatus>([
  "WAITING_SOURCE",
  "QUEUED",
  "EXTRACTING",
]);
const REVIEWABLE_STATUSES = new Set<ImportStatus>(["REVIEW_REQUIRED", "COMPLETE"]);
const STATUS_ORDER: Record<ImportStatus, number> = {
  WAITING_SOURCE: 0,
  QUEUED: 1,
  EXTRACTING: 2,
  REVIEW_REQUIRED: 3,
  COMPLETE: 4,
  FAILED: 4,
};

export function isProcessingImportStatus(status: ImportStatus) {
  return PROCESSING_STATUSES.has(status);
}

export function canLoadImportCandidates(status: ImportStatus) {
  return REVIEWABLE_STATUSES.has(status);
}

export function shouldPollImport(status: ImportStatus, sourceStatus: string) {
  return sourceStatus !== "FAILED" && isProcessingImportStatus(status);
}

export function nextImportPollDelay(
  currentDelayMs: number,
  previousStatus: ImportStatus,
  nextStatus: ImportStatus,
) {
  if (STATUS_ORDER[nextStatus] > STATUS_ORDER[previousStatus]) {
    return INITIAL_IMPORT_POLL_DELAY_MS;
  }
  return Math.min(MAX_IMPORT_POLL_DELAY_MS, Math.max(INITIAL_IMPORT_POLL_DELAY_MS, currentDelayMs * 2));
}
