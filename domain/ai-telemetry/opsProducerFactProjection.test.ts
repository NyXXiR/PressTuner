import assert from "node:assert/strict";
import test from "node:test";

import { ExecutionFactBatchSchema } from "@nyxxir/ops-producer";

import {
  mapEdgeTraversed,
  mapHumanApproval,
  mapNodeLifecycle,
  mapRunLifecycle,
  withCanonicalSequence,
} from "./pressMapper";
import { buildPressAiWorkflowManifest } from "@/domain/press-ai-debugger/opsProducerManifest";
import {
  OpsProducerFactProjectionError,
  projectCanonicalEventsToExecutionFactBatches,
} from "./opsProducerFactProjection";

const operationId = "e6a0f708-2ffc-4f83-8f58-d456fe94c705";
const context = {
  teamId: "team-private-sentinel",
  runId: "run-private-sentinel",
  attemptId: "attempt-private-sentinel",
  processId: "press-creation",
  processVersion: "2.0.0",
  occurredAt: "2026-08-09T10:00:00.000Z",
} as const;

test("canonical lifecycle, edge, and human events project to strict content-free execution facts", async () => {
  const manifest = await buildPressAiWorkflowManifest("press-creation");
  const events = [
    withCanonicalSequence(mapNodeLifecycle(context, {
      nodeId: "brief-normalization",
      commandId: "command-private-sentinel",
      phase: "STARTED",
    }), 1),
    withCanonicalSequence(mapHumanApproval(context, {
      sourceId: "transition-private-sentinel",
      edgeId: "brief-draft",
      gateId: "confirm-normalized-brief",
      phase: "RECORDED",
      decision: "ACKNOWLEDGED",
      actorId: "user-private-sentinel",
    }), 2),
    withCanonicalSequence(mapEdgeTraversed(context, {
      transitionId: "transition-private-sentinel",
      edgeId: "brief-draft",
      sourceNodeId: "brief-normalization",
      targetNodeId: "draft-generation",
      verdict: "WARN",
      acknowledged: true,
    }), 3),
  ];

  const batches = projectCanonicalEventsToExecutionFactBatches({ operationId, manifest, events });

  assert.equal(batches.length, 1);
  assert.equal(ExecutionFactBatchSchema.safeParse(batches[0]).success, true);
  assert.deepEqual(batches[0]!.facts.map((fact) => fact.kind), [
    "node.lifecycle",
    "human.review",
    "edge.traversal",
  ]);
  assert.equal(batches[0]!.facts[1]!.kind === "human.review" && batches[0]!.facts[1]!.state, "APPROVED");
  assert.equal(batches[0]!.facts[2]!.kind === "edge.traversal" && batches[0]!.facts[2]!.reasonCode, "GUARDRAIL_WARN");

  const serialized = JSON.stringify(batches);
  for (const forbidden of ["team-private-sentinel", "run-private-sentinel", "attempt-private-sentinel", "command-private-sentinel", "transition-private-sentinel", "user-private-sentinel", "actorRef", "attributes", "payload"]) {
    assert.equal(serialized.includes(forbidden), false, `must omit ${forbidden}`);
  }
});

test("fact projection rejects canonical references not declared by the manifest", async () => {
  const manifest = await buildPressAiWorkflowManifest("press-creation");
  const event = mapNodeLifecycle(context, {
    nodeId: "undeclared-stage",
    commandId: "command-private-sentinel",
    phase: "COMPLETED",
  });

  assert.throws(
    () => projectCanonicalEventsToExecutionFactBatches({ operationId, manifest, events: [event] }),
    (error) => error instanceof OpsProducerFactProjectionError
      && error.code === "OPS_PRODUCER_FACT_REFERENCE_INVALID",
  );
});

test("fact projection rejects an existing edge paired with the wrong source or target stage", async () => {
  const manifest = await buildPressAiWorkflowManifest("press-creation");
  const event = mapEdgeTraversed(context, {
    transitionId: "transition-private-sentinel",
    edgeId: "brief-draft",
    sourceNodeId: "article-initialization",
    targetNodeId: "draft-generation",
    verdict: "PASS",
    acknowledged: false,
  });

  assert.throws(
    () => projectCanonicalEventsToExecutionFactBatches({ operationId, manifest, events: [event] }),
    (error) => error instanceof OpsProducerFactProjectionError
      && error.code === "OPS_PRODUCER_FACT_REFERENCE_INVALID",
  );
});

test("cancelled run lifecycle projects to the declared terminal stage as CANCELLED", async () => {
  const manifest = await buildPressAiWorkflowManifest("press-creation");
  const batches = projectCanonicalEventsToExecutionFactBatches({
    operationId,
    manifest,
    events: [mapRunLifecycle(context, "CANCELLED", "USER_CANCELLED")],
  });
  assert.deepEqual(batches[0]!.facts.map((fact) => ({
    kind: fact.kind,
    stageId: fact.kind === "node.lifecycle" ? fact.stageId : null,
    state: fact.kind === "node.lifecycle" ? fact.state : null,
  })), [{ kind: "node.lifecycle", stageId: "selected-rewrite", state: "CANCELLED" }]);
});

test("started run lifecycle projects to the workflow entry stage", async () => {
  const manifest = await buildPressAiWorkflowManifest("press-creation");
  const batches = projectCanonicalEventsToExecutionFactBatches({
    operationId,
    manifest,
    events: [mapRunLifecycle(context, "STARTED")],
  });
  assert.deepEqual(batches[0]!.facts.map((fact) => ({
    kind: fact.kind,
    stageId: fact.kind === "node.lifecycle" ? fact.stageId : null,
    state: fact.kind === "node.lifecycle" ? fact.state : null,
  })), [{ kind: "node.lifecycle", stageId: "article-initialization", state: "STARTED" }]);
});
