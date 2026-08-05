import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { restorePressAgentV1Checkpoint } from "./pressAgentV1Runtime";
import {
  normalizeAgentDocumentIds,
  readPressAgentOperationId,
  resolveAgentSearchTopK,
} from "./pressAgentRuntime";

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
  assert.match(source, /workflow_id: PRESS_AGENT_WORKFLOW_ID/);
  assert.match(source, /workflow_version: PRESS_AGENT_VERSION/);
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
