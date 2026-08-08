import type { PressAiKnowledgeDocument } from "@/lib/pressAiProcessDebuggerClient";

/**
 * Mirrors BUSY_STATUSES in lib/services/knowledge/knowledgeDocumentService.ts.
 * The server refuses to delete a document in any of these, so the UI must not
 * offer the action — and must keep polling until the document leaves the set.
 */
export const KNOWLEDGE_BUSY_STATUSES = [
  "QUEUED",
  "PARSING",
  "INDEXING",
] as const;

export function isKnowledgeDocumentBusy(status: string): boolean {
  return (KNOWLEDGE_BUSY_STATUSES as readonly string[]).includes(status);
}

const STATUS_LABELS: Record<string, string> = {
  UPLOADED: "업로드됨",
  QUEUED: "대기 중",
  PARSING: "파싱 중",
  INDEXING: "인덱싱 중",
  READY: "준비됨",
  FAILED: "실패",
};

/** Unknown values stay raw: this is a debugger, an invented label would mislead. */
export function knowledgeStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const ERROR_MESSAGES: Record<string, string> = {
  KNOWLEDGE_DOCUMENT_BUSY:
    "인덱싱이 진행 중이라 아직 제거할 수 없습니다. 끝나면 다시 시도해 주세요.",
  KNOWLEDGE_REPLACEMENT_IN_PROGRESS:
    "새 버전으로 교체하는 중이라 제거할 수 없습니다.",
  KNOWLEDGE_DOCUMENT_NOT_FOUND: "이미 제거된 문서입니다.",
  KNOWLEDGE_UPLOAD_RATE_LIMITED:
    "업로드 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
  KNOWLEDGE_INDEX_QUEUE_FAILED:
    "문서는 저장했지만 인덱싱 작업을 예약하지 못했습니다.",
};

export function knowledgeErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? code;
}

export function formatIndexingElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}초 경과`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}분 ${seconds}초 경과` : `${minutes}분 경과`;
}

export type KnowledgeSummary = {
  text: string;
  /** Something is mid-flight or broken; the panel opens itself to show it. */
  needsAttention: boolean;
  /** At least one document is still moving, so polling should continue. */
  busy: boolean;
};

export function summarizeKnowledgeDocuments(
  documents: readonly PressAiKnowledgeDocument[],
): KnowledgeSummary {
  if (documents.length === 0)
    return { text: "마운트된 문서 없음", needsAttention: false, busy: false };

  const busyCount = documents.filter((item) =>
    isKnowledgeDocumentBusy(item.status),
  ).length;
  const failedCount = documents.filter((item) => item.status === "FAILED").length;

  const parts = [`${documents.length}개`];
  if (busyCount) parts.push(`${busyCount}개 인덱싱 중`);
  if (failedCount) parts.push(`${failedCount}개 실패`);
  if (!busyCount && !failedCount) parts.push("모두 준비됨");

  return {
    text: parts.join(" · "),
    needsAttention: busyCount > 0 || failedCount > 0,
    busy: busyCount > 0,
  };
}
