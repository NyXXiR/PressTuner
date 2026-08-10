import { randomUUID as nodeRandomUUID } from "node:crypto";

import {
  computeOpsConsoleWorkflowDefinitionHash,
  OPS_CONSOLE_EXECUTION_FACTS_BATCH_VERSION,
  OPS_CONSOLE_EXECUTION_FACT_VERSION,
  OPS_CONSOLE_PRODUCER,
  OPS_CONSOLE_PROTOCOL_VERSION,
  OpsConsoleExecutionFactBatchSchema,
  OpsConsoleWorkflowManifestSchema,
  type OpsConsoleExecutionFact,
  type OpsConsoleWorkflowManifest,
} from "@/domain/ai-telemetry/opsConsoleProducerContracts";
import { buildOpsConsoleWorkflowManifest } from "@/domain/press-ai-debugger/opsConsoleWorkflowManifest";
import {
  appendOpsConsoleExecutionFacts,
  beginOpsConsoleOperation,
  completeOpsConsoleOperation,
  registerOpsConsoleWorkflowManifest,
  type OpsConsoleOperationResult,
} from "./opsConsoleOperationClient";

export const OPS_TEST_WORKFLOW_ID = "presstuner.press-creation.demo-test";

export type OpsConsoleTestProcessDependencies = {
  now: () => Date;
  randomUUID: () => string;
  registerWorkflow: typeof registerOpsConsoleWorkflowManifest;
  beginOperation: typeof beginOpsConsoleOperation;
  appendFacts: typeof appendOpsConsoleExecutionFacts;
  completeOperation: typeof completeOpsConsoleOperation;
};

const defaults: OpsConsoleTestProcessDependencies = {
  now: () => new Date(),
  randomUUID: nodeRandomUUID,
  registerWorkflow: registerOpsConsoleWorkflowManifest,
  beginOperation: beginOpsConsoleOperation,
  appendFacts: appendOpsConsoleExecutionFacts,
  completeOperation: completeOpsConsoleOperation,
};

function requireStatus(
  result: OpsConsoleOperationResult,
  expected: "registered" | "reported" | "completed",
): void {
  if (result.status === expected) return;
  const code = "code" in result ? result.code : `OPS_CONSOLE_${expected.toUpperCase()}_FAILED`;
  throw Object.assign(new Error(code), { code, status: 503 });
}

function buildTestManifest(): OpsConsoleWorkflowManifest {
  const current = buildOpsConsoleWorkflowManifest("press-creation");
  const base = {
    ...current,
    workflow: { ...current.workflow, id: OPS_TEST_WORKFLOW_ID },
  };
  return OpsConsoleWorkflowManifestSchema.parse({
    ...base,
    definitionHash: computeOpsConsoleWorkflowDefinitionHash(base),
  });
}

function buildTestFacts(args: {
  manifest: OpsConsoleWorkflowManifest;
  operationId: string;
  startedAt: Date;
  randomUUID: () => string;
}): OpsConsoleExecutionFact[] {
  let sequence = 0;
  let timeOffset = 0;
  const occurredAt = () => new Date(args.startedAt.getTime() + timeOffset++ * 25).toISOString();
  const workflow = {
    ...args.manifest.workflow,
    definitionHash: args.manifest.definitionHash,
  };
  const common = () => ({
    schemaVersion: OPS_CONSOLE_EXECUTION_FACT_VERSION,
    protocolVersion: OPS_CONSOLE_PROTOCOL_VERSION,
    factId: args.randomUUID(),
    operationId: args.operationId,
    workflow,
    sequence: ++sequence,
    occurredAt: occurredAt(),
  });
  const occurrences = new Map(
    args.manifest.stages.map((stage) => [stage.id, args.randomUUID()]),
  );
  const facts: OpsConsoleExecutionFact[] = [];

  for (const stage of args.manifest.stages) {
    const occurrenceId = occurrences.get(stage.id)!;
    facts.push(
      { ...common(), kind: "node.lifecycle", occurrenceId, stageId: stage.id, state: "STARTED", reasonCode: null },
      { ...common(), kind: "node.lifecycle", occurrenceId, stageId: stage.id, state: "COMPLETED", reasonCode: null },
    );
    for (const gateId of stage.gateIds ?? []) {
      facts.push(
        { ...common(), kind: "human.review", gateId, occurrenceId, state: "REQUESTED" },
        { ...common(), kind: "human.review", gateId, occurrenceId, state: "APPROVED" },
      );
    }
    for (const edge of args.manifest.edges.filter((item) => item.sourceStageId === stage.id)) {
      const targetOccurrenceId = occurrences.get(edge.targetStageId)!;
      facts.push(
        { ...common(), kind: "transition.evaluation", edgeId: edge.id, sourceOccurrenceId: occurrenceId, targetOccurrenceId, decision: "ALLOW", reasonCode: "DEMO_TEST_ALLOWED" },
        { ...common(), kind: "edge.traversal", edgeId: edge.id, sourceOccurrenceId: occurrenceId, targetOccurrenceId, state: "TAKEN", reasonCode: "DEMO_TEST_PATH", evidenceRefIds: [] },
      );
    }
  }
  return facts;
}

export async function createOpsConsoleTestProcessData(
  args: { teamId: string; userId: string },
  overrides: Partial<OpsConsoleTestProcessDependencies> = {},
) {
  const dependencies = { ...defaults, ...overrides };
  const manifest = buildTestManifest();
  requireStatus(await dependencies.registerWorkflow(manifest), "registered");

  const startedAt = dependencies.now();
  const operation = await dependencies.beginOperation({
    teamId: args.teamId,
    userId: args.userId,
    workflowId: manifest.workflow.id,
    workflowVersion: manifest.workflow.version,
    traceId: dependencies.randomUUID().replaceAll("-", ""),
  });
  requireStatus(operation, "registered");

  const facts = buildTestFacts({
    manifest,
    operationId: operation.operationId,
    startedAt,
    randomUUID: dependencies.randomUUID,
  });
  const batch = OpsConsoleExecutionFactBatchSchema.parse({
    schemaVersion: OPS_CONSOLE_EXECUTION_FACTS_BATCH_VERSION,
    producer: OPS_CONSOLE_PRODUCER,
    facts,
  });
  requireStatus(await dependencies.appendFacts(batch), "reported");
  requireStatus(
    await dependencies.completeOperation({
      operationId: operation.operationId,
      completedAt: new Date(startedAt.getTime() + Math.max(1, facts.length) * 25),
    }),
    "completed",
  );

  return {
    status: "inserted" as const,
    operationId: operation.operationId,
    workflowId: manifest.workflow.id,
    factCount: facts.length,
  };
}
