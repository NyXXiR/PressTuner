export type KnowledgeDocumentPresentationInput = {
  status: "UPLOADED" | "QUEUED" | "PARSING" | "INDEXING" | "READY" | "FAILED";
  replacesDocumentId: string | null;
  hasPendingReplacement: boolean;
};

const PROCESSING_STATUSES = new Set([
  "QUEUED",
  "PARSING",
  "INDEXING",
] as const);

export function knowledgeDocumentPresentation(
  document: KnowledgeDocumentPresentationInput,
) {
  const processing = PROCESSING_STATUSES.has(
    document.status as "QUEUED" | "PARSING" | "INDEXING",
  );
  const retryLabel =
    document.status === "UPLOADED"
      ? "처리 시작"
      : document.status === "FAILED"
        ? "재시도"
        : null;

  return {
    canReplace:
      document.status === "READY" && !document.hasPendingReplacement,
    canRetry: retryLabel !== null,
    retryLabel,
    showSpinner: processing,
    shouldPoll: processing,
    showPendingReplacementCopy:
      Boolean(document.replacesDocumentId) && document.status !== "READY",
    canDelete: !processing && document.status !== "UPLOADED",
  };
}
