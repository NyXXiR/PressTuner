export type EvidenceCandidateDecision = "PENDING" | "ACCEPTED" | "REJECTED";
export type ArticleFactOrigin = "RAG" | "USER";

export type ArticleFactPolicyRecord = {
  text: string;
  origin: ArticleFactOrigin;
  candidateId: string | null;
  documentId: string | null;
  chunkId: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  excerpt: string | null;
};

export function decideEvidenceCandidate(
  current: EvidenceCandidateDecision,
  requested: Exclude<EvidenceCandidateDecision, "PENDING">,
): { decision: EvidenceCandidateDecision; changed: boolean } {
  if (current === requested) return { decision: current, changed: false };
  return { decision: requested, changed: true };
}

export function detachRagFactForUserEdit(
  fact: ArticleFactPolicyRecord,
  text: string,
): ArticleFactPolicyRecord {
  return {
    ...fact,
    text,
    origin: "USER",
    candidateId: null,
    documentId: null,
    chunkId: null,
    pageStart: null,
    pageEnd: null,
    excerpt: null,
  };
}

export function incrementGroundingRevision(
  revision: number,
  changed: boolean,
): number {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("GROUNDING_REVISION_INVALID");
  }
  return changed ? revision + 1 : revision;
}

export function isGroundingRevisionCurrent(
  verificationRevision: number,
  currentRevision: number,
): boolean {
  return verificationRevision === currentRevision;
}
