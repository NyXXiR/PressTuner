import { createHash } from "node:crypto";

export const PRESS_RAG_RECORDED_EXECUTION_REF_VERSION =
  "press-rag-recorded-execution-ref/v1" as const;
export const PRESS_RAG_RECORDED_EXECUTION_REF_SCHEME = "pragop_v1" as const;

const DOMAIN_SEPARATOR = "press-rag-recorded-operation/sha256-v1\0";
const MAX_RECORDED_EXECUTION_ID_LENGTH = 160;

export function derivePressRagRecordedExecutionRef(caseRunId: string): string {
  if (
    typeof caseRunId !== "string" ||
    caseRunId.length === 0 ||
    caseRunId.length > MAX_RECORDED_EXECUTION_ID_LENGTH
  ) {
    throw new Error("PRESS_RAG_RECORDED_EXECUTION_ID_INVALID");
  }
  const digest = createHash("sha256")
    .update(DOMAIN_SEPARATOR)
    .update(caseRunId)
    .digest("hex");
  return `${PRESS_RAG_RECORDED_EXECUTION_REF_SCHEME}_${digest}`;
}
