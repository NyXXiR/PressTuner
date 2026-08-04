import type { PressRagDemoViewModel, PressRagRecordedOutcome } from "./pressRagDemoPresenter";
import { PRESS_RAG_WORKFLOW_STAGE_IDS, type PressRagWorkflowNodeId } from "./pressRagWorkflowView";

export const PRESS_RAG_EXECUTION_EVIDENCE_VERSION = "press-rag/execution-evidence/v1" as const;
type ExecutionState = "SUCCEEDED" | "FAILED" | "SKIPPED" | "UNKNOWN";
type Evidence = { id: string; key: string; label: string; value: unknown; evidenceClass: "MEASURED" | "MISSING"; availability: "RECORDED" | "MISSING"; reasonCode: string | null };
type Assertion = { id: string; label: string; operator: "EQUALS" | "SET_RELATION" | "NUMERIC" | "CLASSIFICATION"; evidenceKeys: string[]; expected?: unknown; relation?: "CONTAINS_ALL" | "SUBSET_OF"; comparator?: "GTE"; classification?: "NOT_APPLICABLE" | "NOT_EVALUABLE"; reasonCode?: string };
type Stage = { stageId: PressRagWorkflowNodeId; executionState: ExecutionState; evidence: Evidence[]; assertions: Assertion[] };

const recorded = (runId: string, stageId: string, key: string, value: unknown, label = key): Evidence => ({ id: `${runId}:${stageId}:${key}`, key, label, value, evidenceClass: "MEASURED", availability: "RECORDED", reasonCode: null });
const missing = (runId: string, stageId: string, key: string, reasonCode: string): Evidence => ({ id: `${runId}:${stageId}:${key}`, key, label: key, value: null, evidenceClass: "MISSING", availability: "MISSING", reasonCode });
const assertion = (runId: string, stageId: string, id: string, value: Omit<Assertion, "id">): Assertion => ({ id: `${runId}:${stageId}:${id}`, ...value });

function stages(runId: string, outcome: PressRagRecordedOutcome, expectation: PressRagDemoViewModel["scenarios"][number]["expectation"]): Stage[] {
  const outputMissing = outcome.status === "FAILED" && outcome.cannotAnswer === null;
  const expectedDocumentIds = expectation.expectedDocuments.map(({ logicalId }) => logicalId).sort();
  const retrievedDocumentIds = [...new Set(outcome.retrieval.map(({ logicalDocumentId }) => logicalDocumentId))].sort();
  const executedTools = outcome.tools.filter(({ status }) => status === "COMPLETED").map(({ toolName }) => toolName).sort();
  const expectedMode = expectation.answerability === "ABSTAIN" ? "ABSTAIN" : "ANSWER";
  const responseMode = outcome.cannotAnswer === null ? null : outcome.cannotAnswer ? "ABSTAIN" : "ANSWER";
  const downstream = (stageId: PressRagWorkflowNodeId): Stage => ({ stageId, executionState: "UNKNOWN", evidence: [missing(runId, stageId, "stageOutput", `OUTPUT_MISSING_AFTER:${outcome.errorCode ?? "UNKNOWN_ERROR"}`)], assertions: [assertion(runId, stageId, "not-evaluable", { label: "Stage output was not recorded", operator: "CLASSIFICATION", evidenceKeys: ["stageOutput"], classification: "NOT_EVALUABLE", reasonCode: "OUTPUT_MISSING" })] });
  const result: Stage[] = [
    { stageId: "request-intake", executionState: "SUCCEEDED", evidence: [recorded(runId, "request-intake", "runIndex", outcome.runIndex), recorded(runId, "request-intake", "recordedExecutionStatus", outcome.status)], assertions: [] },
    { stageId: "retrieval-execution", executionState: outcome.tools.some(({ status }) => status === "FAILED") ? "FAILED" : "SUCCEEDED",
      evidence: [recorded(runId, "retrieval-execution", "retrievedDocumentIds", retrievedDocumentIds), recorded(runId, "retrieval-execution", "executedTools", executedTools), recorded(runId, "retrieval-execution", "failedTools", outcome.tools.filter(({ status }) => status === "FAILED").map(({ toolName }) => toolName).sort()), recorded(runId, "retrieval-execution", "retrievalCount", outcome.retrieval.length)],
      assertions: [
        assertion(runId, "retrieval-execution", "expected-documents", { label: "Expected documents were retrieved", operator: "SET_RELATION", evidenceKeys: ["retrievedDocumentIds"], relation: "CONTAINS_ALL", expected: expectedDocumentIds }),
        assertion(runId, "retrieval-execution", "expected-tools", { label: "Expected tools completed", operator: "SET_RELATION", evidenceKeys: ["executedTools"], relation: "CONTAINS_ALL", expected: [...expectation.expectedTools].sort() }),
      ] },
  ];
  if (outputMissing) result.push(downstream("evidence-decision"), downstream("response-behavior"), downstream("verification"), downstream("fallback"));
  else {
    result.push(
      { stageId: "evidence-decision", executionState: responseMode === null ? "UNKNOWN" : "SUCCEEDED", evidence: responseMode === null ? [missing(runId, "evidence-decision", "responseMode", "CANNOT_ANSWER_NOT_RECORDED")] : [recorded(runId, "evidence-decision", "responseMode", responseMode)], assertions: [assertion(runId, "evidence-decision", "answerability", { label: "Recorded response mode matches expectation", operator: "EQUALS", evidenceKeys: ["responseMode"], expected: expectedMode })] },
      { stageId: "response-behavior", executionState: responseMode === null ? "UNKNOWN" : "SUCCEEDED", evidence: responseMode === null ? [missing(runId, "response-behavior", "responseMode", "RESPONSE_NOT_RECORDED")] : [recorded(runId, "response-behavior", "responseMode", responseMode), recorded(runId, "response-behavior", "citationDocumentIds", [...new Set(outcome.citations.map(({ logicalDocumentId }) => logicalDocumentId))].sort()), recorded(runId, "response-behavior", "citationCount", outcome.citations.length)], assertions: [assertion(runId, "response-behavior", "response-mode", { label: "Response branch matches expectation", operator: "EQUALS", evidenceKeys: ["responseMode"], expected: expectedMode }), ...(responseMode === "ANSWER" ? [assertion(runId, "response-behavior", "citation-sources", { label: "Citations use expected documents", operator: "SET_RELATION", evidenceKeys: ["citationDocumentIds"], relation: "SUBSET_OF", expected: expectedDocumentIds })] : [])] },
      outcome.verification.mode === null || outcome.verification.status === null
        ? { stageId: "verification", executionState: "SKIPPED", evidence: [recorded(runId, "verification", "verificationMode", null)], assertions: [assertion(runId, "verification", "not-applicable", { label: "Explicit verification was not recorded", operator: "CLASSIFICATION", evidenceKeys: ["verificationMode"], classification: "NOT_APPLICABLE", reasonCode: "VERIFICATION_NOT_RUN" })] }
        : { stageId: "verification", executionState: outcome.verification.status === "PASS" ? "SUCCEEDED" : "FAILED", evidence: [recorded(runId, "verification", "verificationStatus", outcome.verification.status), recorded(runId, "verification", "supportedClaims", outcome.verification.supportedClaims), recorded(runId, "verification", "totalClaims", outcome.verification.totalClaims)], assertions: [assertion(runId, "verification", "verification-pass", { label: "Verifier completed successfully", operator: "EQUALS", evidenceKeys: ["verificationStatus"], expected: "PASS" }), assertion(runId, "verification", "claim-coverage", { label: "All claims are supported", operator: "NUMERIC", evidenceKeys: ["supportedClaims", "totalClaims"], comparator: "GTE" })] },
      outcome.fallback.mode === null
        ? { stageId: "fallback", executionState: "SKIPPED", evidence: [recorded(runId, "fallback", "fallbackMode", null)], assertions: [assertion(runId, "fallback", "not-applicable", { label: "No fallback was recorded", operator: "CLASSIFICATION", evidenceKeys: ["fallbackMode"], classification: "NOT_APPLICABLE", reasonCode: "FALLBACK_NOT_USED" })] }
        : { stageId: "fallback", executionState: "SUCCEEDED", evidence: [recorded(runId, "fallback", "fallbackMode", outcome.fallback.mode)], assertions: [] },
    );
  }
  result.push({ stageId: "terminal-evaluation", executionState: outcome.status === "COMPLETED" ? "SUCCEEDED" : "FAILED", evidence: [recorded(runId, "terminal-evaluation", "executionStatus", outcome.status), recorded(runId, "terminal-evaluation", "errorCode", outcome.errorCode)], assertions: [assertion(runId, "terminal-evaluation", "completed", { label: "Execution completed", operator: "EQUALS", evidenceKeys: ["executionStatus"], expected: "COMPLETED" })] });
  if (result.map(({ stageId }) => stageId).join("|") !== PRESS_RAG_WORKFLOW_STAGE_IDS.join("|")) throw new Error("PRESS_RAG_EXECUTION_STAGE_ORDER_INVALID");
  return result;
}

export function buildPressRagExecutionEvidence(model: PressRagDemoViewModel) {
  return {
    schemaVersion: PRESS_RAG_EXECUTION_EVIDENCE_VERSION, evaluationId: "press-rag-controlled-live-execution-001", cycleId: "press-rag-51907efcdf316c26", generatedAt: "2026-08-04T00:00:00.000Z",
    producer: { id: "press-tuner", contractVersion: PRESS_RAG_EXECUTION_EVIDENCE_VERSION },
    provenance: { dataset: { id: model.evidence.datasetVersion }, environment: { id: "controlled-live-recorded" }, executor: { id: "press-rag-controlled-live", version: "1" }, sourceArtifacts: ["dataset-v4.approved.json", "baseline-v1.json", "candidate-v3-optimized.json"] },
    configurations: { baseline: { id: "baseline-v1", hash: model.evidence.baseline.configurationHash }, candidate: { id: "candidate-v3-optimized", hash: model.evidence.candidate.configurationHash } },
    pipeline: { id: "press-rag", version: "1", stages: [...PRESS_RAG_WORKFLOW_STAGE_IDS] },
    runs: model.scenarios.flatMap((scenario) => scenario.runs.flatMap((run) => (["BASELINE", "CANDIDATE"] as const).map((role) => {
      const outcome = role === "BASELINE" ? run.baseline : run.candidate; const runId = `${scenario.caseId}:${run.runIndex}:${role.toLowerCase()}`;
      return { id: runId, caseId: scenario.caseId, label: `${scenario.label} · run ${run.runIndex} · ${role.toLowerCase()}`, role, configurationId: role === "BASELINE" ? "baseline-v1" : "candidate-v3-optimized", executionState: outcome.status === "COMPLETED" ? "SUCCEEDED" as const : "FAILED" as const, stages: stages(runId, outcome, scenario.expectation) };
    }))),
  } as const;
}
