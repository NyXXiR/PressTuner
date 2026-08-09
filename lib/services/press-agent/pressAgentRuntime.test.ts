import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { restorePressAgentV1Checkpoint } from "./pressAgentV1Runtime";
import {
  beginPressAgentObservability,
  normalizeAgentDocumentIds,
  readPressAgentOperationId,
  resolveAgentSearchTopK,
} from "./pressAgentRuntime";

test("Agent execution fails open when observability bootstrap rejects", async () => {
  const failures: string[] = [];
  const result = await beginPressAgentObservability({
    teamId: "team",
    userId: "user",
    runId: "run",
    traceId: "a".repeat(32),
  }, {
    buildManifest: async () => { throw new Error("manifest unavailable"); },
    recordFailure: async ({ result: failure }) => {
      if (failure.status === "failed") failures.push(failure.code);
    },
  });
  assert.equal(result.status, "failed");
  assert.deepEqual(failures, ["OPS_CONSOLE_PROTOCOL_ERROR"]);
});

test("Agent document filters accept only opaque persisted IDs, not user-facing labels", () => {
  assert.deepEqual(
    normalizeAgentDocumentIds([
      "PT-CAREER-001",
      "cmse1ptii003qny5uamal4sbq",
      " CE-PDFKIT-002 ",
    ]),
    ["cmse1ptii003qny5uamal4sbq"],
  );
  assert.equal(normalizeAgentDocumentIds(["PT-CAREER-001"]), undefined);
});

test("identifier-aware Agent search limits context to the explicit identifier count", () => {
  assert.equal(
    resolveAgentSearchTopK({
      query: "PT-CAREER-001와 PT-CAREER-002 비교",
      requestedTopK: 8,
      configurationId: "candidate-v3",
    }),
    2,
  );
  assert.equal(
    resolveAgentSearchTopK({
      query: "올해 매출",
      requestedTopK: 8,
      configurationId: "candidate-v3",
    }),
    8,
  );
  assert.equal(
    resolveAgentSearchTopK({
      query: "PT-CAREER-001",
      requestedTopK: 8,
      configurationId: "baseline-v1",
    }),
    8,
  );
});

test("only a UUID may cross the private Agent input boundary", () => {
  const operationId = "10000000-0000-4000-8000-000000000001";
  assert.equal(readPressAgentOperationId({ operationId }), operationId);
  assert.equal(readPressAgentOperationId({ operationId: "raw-user-id" }), null);
  assert.equal(readPressAgentOperationId({ prompt: "private prompt" }), null);
});

test("Agent v2 runtime separates retrieval sources, final citations, and verified hashes", () => {
  const source = readFileSync(join(__dirname, "pressAgentRuntime.ts"), "utf8");
  assert.match(source, /PRESS_AGENT_VERSION = "press-agent-v2"/);
  assert.match(source, /agentRetrievedSource\.findMany/);
  assert.match(source, /persistFinalAgentCitations/);
  assert.match(source, /assertAppliedDraftMatchesVerified/);
  assert.match(source, /verifyDraftClaimSpans/);
  assert.match(source, /verifyAgentAnswerClaimSpans/);
  assert.match(source, /result\.status === "PASS"/);
  assert.doesNotMatch(source, /grounded: claim\.sourceIds\.every/);
  assert.match(source, /quote: z\.string\(\)\.min\(1\)/);
  assert.match(source, /\.\.\.previousOutput/);
  assert.match(source, /claimVerification: finalClaimVerification/);
  assert.match(source, /PRESS_AGENT_FINAL_CLAIM_VERIFICATION_FAILED/);
  assert.match(source, /verificationFallback/);
  assert.match(source, /CLAIM_VERIFICATION_FALLBACK/);
  assert.match(source, /buildExtractiveVerificationFallback/);
  assert.match(source, /mode: extractive \? "EXTRACTIVE" : "ABSTENTION"/);
  assert.match(source, /cannotAnswer: true/);
  assert.match(source, /abstentionNormalization/);
  assert.match(source, /abstentionRecovery/);
  assert.match(source, /REQUESTED_DOCUMENT_EVIDENCE_PRESENT/);
  assert.match(source, /claims: \[\], sourceIds: \[\]/);
});

test("serialized v1 checkpoints retain their original version identity", () => {
  assert.equal(
    restorePressAgentV1Checkpoint(
      JSON.stringify({
        runId: "run-1",
        teamId: "team-1",
        agentVersion: "press-agent-v1",
        sdkState: "state",
      }),
      { runId: "run-1", teamId: "team-1" },
    ).sdkState,
    "state",
  );
});

test("Agent v2 propagates a private operation UUID across durable and trace boundaries", () => {
  const source = readFileSync(join(__dirname, "pressAgentRuntime.ts"), "utf8");
  assert.match(source, /beginOpsConsoleOperation/);
  assert.match(source, /traceLangSmithOperation/);
  assert.match(source, /phase: "initial"/);
  assert.match(source, /phase: "continuation"/);
  assert.match(source, /operationId: operation\.operationId/);
  assert.match(source, /operation_id: operation\.operationId/);
  assert.match(source, /OPS_PRODUCER_WORKFLOW_ID = "presstuner\.rag-query"/);
  assert.match(source, /OPS_PRODUCER_WORKFLOW_VERSION = "1\.0\.0"/);
  assert.doesNotMatch(source, /workflow_id: PRESS_AGENT_WORKFLOW_ID/);
  assert.doesNotMatch(source, /workflow_version: PRESS_AGENT_VERSION/);
  assert.doesNotMatch(source, /metadata:\s*\{\s*runId:[^}]*teamId:/);
  assert.match(source, /completePressAgentOperation/);
  assert.match(source, /readPressAgentOperationId/);
});

test("Agent v2 instruments stable RAG boundaries and completes inside the active root", () => {
  const source = readFileSync(join(__dirname, "pressAgentRuntime.ts"), "utf8");
  const retrieval = source.slice(source.indexOf("const searchKnowledgeTool"), source.indexOf("const compareSourcesTool"));
  const persistence = source.slice(source.indexOf("async function persistRunResult"), source.indexOf("export async function startPressAgentRun"));

  assert.match(retrieval, /traceLangSmithRagStage\(\{\s*stageId: "retrieval-execution"/);
  assert.match(retrieval, /selectedSourceCount: retrieval\.citations\.length/);
  assert.match(retrieval, /eligibleSourceCount: retrieval\.evidenceDecision\.eligibleSourceIds\.length/);
  assert.match(retrieval, /recordLangSmithRagObservation\("evidence-decision"/);
  assert.match(retrieval, /decisionInputHash: result\.evidenceDecision\.decisionInputHash/);

  assert.match(persistence, /recordLangSmithRagObservation\("verification"/);
  assert.match(persistence, /recordLangSmithRagObservation\("fallback"/);
  assert.match(persistence, /recordLangSmithRagObservation\("response-behavior"/);
  assert.match(persistence, /primaryClaimVerificationStatus = finalClaimVerification\.status/);
  assert.match(persistence, /kind: "TOOL", status: "FAILED"/);
  assert.match(source, /reportLangSmithRootFeedback\(derivePressAgentRagFeedback\(verdicts\)\)/);
  assert.match(source, /execute: async \(\) => \{[\s\S]*?await persistRunResult\(runRecord, result, startedAtMs, operationId\);/);
});

test("waiting approval is non-terminal and terminal OTLP export is centralized before completion", () => {
  const source = readFileSync(join(__dirname, "pressAgentRuntime.ts"), "utf8");
  const persistence = source.slice(source.indexOf("async function persistRunResult"), source.indexOf("export async function startPressAgentRun"));
  const finalizedBranch = persistence.indexOf("if (finalized.count === 1)");
  const terminalBranch = persistence.indexOf("if (interruptions.length === 0) {", finalizedBranch);
  const waitingBranch = persistence.indexOf("} else {", terminalBranch);
  const terminalFinish = persistence.indexOf('type: "run.finished"', terminalBranch);
  assert.ok(finalizedBranch >= 0 && terminalBranch > finalizedBranch);
  assert.ok(terminalFinish > terminalBranch && terminalFinish < waitingBranch);
  const waiting = persistence.slice(waitingBranch);
  assert.doesNotMatch(waiting, /type: "run\.finished"/);

  const complete = source.slice(source.indexOf("async function completePressAgentOperation"), source.indexOf("function readVerificationFallbackMode"));
  const factIndex = complete.indexOf("exportRunExecutionFacts");
  const otlpIndex = complete.indexOf("exportRunTelemetry");
  const completionIndex = complete.indexOf("completeOpsConsoleOperation");
  assert.ok(factIndex >= 0 && factIndex < otlpIndex && otlpIndex < completionIndex);
  assert.doesNotMatch(persistence, /exportRunTelemetry/);
});

test("cancellation aborts active execution before canonical fact and operation export", () => {
  const source = readFileSync(join(__dirname, "pressAgentRuntime.ts"), "utf8");
  const cancellation = source.slice(source.indexOf("export async function cancelPressAgentRun"), source.indexOf("export async function decidePressAgentApproval"));
  const abortIndex = cancellation.indexOf(".abort()");
  assert.ok(abortIndex >= 0);
  assert.ok(abortIndex < cancellation.indexOf("persistPressAgentCancellationWorkflow"));
  assert.ok(abortIndex < cancellation.indexOf("finalizeProcessRunObservability"));
  assert.ok(abortIndex < cancellation.indexOf("completePressAgentOperation"));
});

test("the optional debugger launch surface preserves default callers and uses durable workflow publishing", () => {
  const source = readFileSync(join(__dirname, "pressAgentRuntime.ts"), "utf8");
  assert.match(source, /launchSurface\?: "RAG_DEBUGGER_V1"/);
  assert.match(source, /selectedDocumentIds\?: string\[\]/);
  assert.match(source, /context\.selectedDocumentIds \?\? normalizeAgentDocumentIds\(input\.documentIds\)/);
  assert.match(source, /preVerificationOutput: finalOutput/);
  assert.match(source, /workflowObserver\?: PressAgentWorkflowStreamObserver/);
  assert.match(source, /if \(args\.workflowObserver\)/);
  assert.match(source, /if \(!hasPressAgentWorkflowObserver\(\)\) return null/);
  assert.match(source, /persistDurablePressAgentWorkflowEvent/);
  assert.match(source, /deriveGuardrailVerdicts/);
  assert.match(source, /run: \{ status: warning \? "warning" : "succeeded"/);
});
