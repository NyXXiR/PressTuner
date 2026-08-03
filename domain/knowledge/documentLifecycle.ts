export const KNOWLEDGE_DOCUMENT_STATUSES = [
  "UPLOADED",
  "QUEUED",
  "PARSING",
  "INDEXING",
  "READY",
  "FAILED",
] as const;

export type KnowledgeDocumentStatus =
  (typeof KNOWLEDGE_DOCUMENT_STATUSES)[number];

export type KnowledgeDocumentEvent =
  | "QUEUE"
  | "START_PARSING"
  | "START_INDEXING"
  | "COMPLETE"
  | "FAIL"
  | "RETRY";

const TRANSITIONS: Readonly<
  Partial<
    Record<
      KnowledgeDocumentStatus,
      Partial<Record<KnowledgeDocumentEvent, KnowledgeDocumentStatus>>
    >
  >
> = {
  UPLOADED: { QUEUE: "QUEUED" },
  QUEUED: { START_PARSING: "PARSING", FAIL: "FAILED" },
  PARSING: { START_INDEXING: "INDEXING", FAIL: "FAILED" },
  INDEXING: { COMPLETE: "READY", FAIL: "FAILED" },
  FAILED: { RETRY: "QUEUED" },
};

export function transitionKnowledgeDocument(
  status: KnowledgeDocumentStatus,
  event: KnowledgeDocumentEvent,
): KnowledgeDocumentStatus {
  const next = TRANSITIONS[status]?.[event];
  if (!next) {
    throw new Error(`KNOWLEDGE_DOCUMENT_ILLEGAL_TRANSITION:${status}->${event}`);
  }
  return next;
}

export type KnowledgeChunkProvenance = {
  documentId: string;
  ordinal: number;
  pageStart: number;
  pageEnd: number;
};

export function validateKnowledgeChunkProvenance(
  provenance: KnowledgeChunkProvenance,
): KnowledgeChunkProvenance {
  const isValid =
    provenance.documentId.trim().length > 0 &&
    Number.isInteger(provenance.ordinal) &&
    provenance.ordinal >= 0 &&
    Number.isInteger(provenance.pageStart) &&
    provenance.pageStart >= 1 &&
    Number.isInteger(provenance.pageEnd) &&
    provenance.pageEnd >= provenance.pageStart;

  if (!isValid) {
    throw new Error("KNOWLEDGE_CHUNK_INVALID_PROVENANCE");
  }

  return provenance;
}

export function assertKnowledgeScope(args: {
  activeTeamId: string;
  resourceTeamId: string;
}): void {
  if (
    args.activeTeamId.trim().length === 0 ||
    args.resourceTeamId.trim().length === 0 ||
    args.activeTeamId !== args.resourceTeamId
  ) {
    throw new Error("KNOWLEDGE_SCOPE_MISMATCH");
  }
}

export type KnowledgeUploadMetadata = {
  originalName: string;
  mimeType: string;
  byteSize: number;
};

export function validateKnowledgeUpload(
  upload: KnowledgeUploadMetadata,
  bytes?: Buffer,
  maxFileBytes = 20 * 1024 * 1024,
): KnowledgeUploadMetadata {
  if (
    upload.mimeType !== "application/pdf" ||
    !upload.originalName.toLowerCase().endsWith(".pdf")
  ) {
    throw new Error("KNOWLEDGE_UPLOAD_UNSUPPORTED_TYPE");
  }
  const actualByteSize = bytes?.length ?? upload.byteSize;
  if (
    !Number.isInteger(actualByteSize) ||
    actualByteSize <= 0 ||
    actualByteSize > maxFileBytes
  ) {
    throw new Error("KNOWLEDGE_UPLOAD_TOO_LARGE");
  }
  if (bytes && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("KNOWLEDGE_UPLOAD_INVALID_PDF");
  }
  return { ...upload, byteSize: actualByteSize };
}
