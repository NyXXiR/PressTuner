import { createHash } from "node:crypto";
import { z } from "zod";

export const OPS_CONSOLE_PROTOCOL_VERSION = "ops-console/producer-protocol/v1" as const;
export const OPS_CONSOLE_WORKFLOW_MANIFEST_VERSION = "ops-console/workflow-manifest/v2" as const;
export const OPS_CONSOLE_EXECUTION_FACT_VERSION = "ops-console/execution-fact/v2" as const;
export const OPS_CONSOLE_EXECUTION_FACTS_BATCH_VERSION = "ops-console/execution-facts-batch/v2" as const;
export const OPS_CONSOLE_PRODUCER = Object.freeze({ id: "press-tuner", sdkVersion: "presstuner-local-v1" });
export const OPS_CONSOLE_MAX_REQUEST_BYTES = 128 * 1024;
export const OPS_CONSOLE_MAX_FACTS_PER_BATCH = 100;
export const OPS_CONSOLE_MAX_CANONICAL_EVENTS = 1_000;
export const OPS_CONSOLE_MAX_FACT_BATCHES = 10;

const stableIdentifier = (maximum: number) => z.string().min(1).max(maximum).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const identifierList = z.array(stableIdentifier(80)).max(20).refine((items) => new Set(items).size === items.length, "duplicate identifier");
const label = z.string().min(1).max(80).regex(/^[\p{L}\p{N}][\p{L}\p{N}\p{M} .,'()&+/_-]*$/u).refine((value) => value === value.trim() && value === value.normalize("NFC"));
const description = z.string().min(1).max(240).regex(/^[\p{L}\p{N}][\p{L}\p{N}\p{M} .,'()&+/_-]*$/u).refine((value) => value === value.trim() && value === value.normalize("NFC"));
const timestamp = z.string().datetime({ offset: true });
const uuid = z.string().uuid();
const definitionHash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const capability = z.enum(["operation.lifecycle.v1", "trace.hierarchy.v1", "workflow.manifest.v1", "execution.traversal.v1", "human.review.v1", "quality.guardrail.v1", "workflow.manifest.v2", "transition.evaluation.v2"]);
const capabilities = z.array(capability).min(1).max(8).refine((items) => new Set(items).size === items.length, "duplicate capability");

const producer = z.object({ id: stableIdentifier(80), sdkVersion: stableIdentifier(80) }).strict();
const workflow = z.object({ id: stableIdentifier(120), version: stableIdentifier(120) }).strict();
const workflowReference = workflow.extend({ definitionHash }).strict();
const stage = z.object({
  id: stableIdentifier(80), label,
  kind: z.enum(["INTAKE", "TRANSFORM", "TOOL_EXECUTION", "DECISION", "RESPONSE", "VERIFICATION", "FALLBACK", "GATE", "HUMAN_REVIEW", "TERMINAL"]),
  gateIds: identifierList.optional(), description: description.optional(), guardrailIds: identifierList.optional(),
}).strict();
const edge = z.object({
  id: stableIdentifier(80), sourceStageId: stableIdentifier(80), targetStageId: stableIdentifier(80),
  transitionType: z.enum(["SEQUENCE", "BRANCH", "GUARD", "RETRY", "RECOVERY", "FALLBACK", "TERMINAL"]),
  label, description: description.optional(), guardrailIds: identifierList.optional(),
}).strict();

export const OpsConsoleWorkflowManifestSchema = z.object({
  schemaVersion: z.literal(OPS_CONSOLE_WORKFLOW_MANIFEST_VERSION), protocolVersion: z.literal(OPS_CONSOLE_PROTOCOL_VERSION),
  producer, workflow, topology: z.enum(["DAG", "STATE_MACHINE"]), capabilities,
  stages: z.array(stage).min(1).max(100), edges: z.array(edge).max(200), definitionHash,
}).strict().superRefine((manifest, context) => {
  const stageIds = new Set(manifest.stages.map((item) => item.id));
  if (stageIds.size !== manifest.stages.length) context.addIssue({ code: "custom", path: ["stages"], message: "stage ids must be unique" });
  if (new Set(manifest.edges.map((item) => item.id)).size !== manifest.edges.length) context.addIssue({ code: "custom", path: ["edges"], message: "edge ids must be unique" });
  if (!manifest.capabilities.includes("workflow.manifest.v2")) context.addIssue({ code: "custom", path: ["capabilities"], message: "workflow.manifest.v2 is required" });
  manifest.edges.forEach((item, index) => {
    if (!stageIds.has(item.sourceStageId)) context.addIssue({ code: "custom", path: ["edges", index, "sourceStageId"], message: "unknown source stage" });
    if (!stageIds.has(item.targetStageId)) context.addIssue({ code: "custom", path: ["edges", index, "targetStageId"], message: "unknown target stage" });
  });
});

const factCommon = {
  schemaVersion: z.literal(OPS_CONSOLE_EXECUTION_FACT_VERSION), protocolVersion: z.literal(OPS_CONSOLE_PROTOCOL_VERSION),
  factId: uuid, operationId: uuid, workflow: workflowReference, sequence: z.number().int().min(1).max(2_147_483_647), occurredAt: timestamp,
};
const nodeFact = z.object({ ...factCommon, kind: z.literal("node.lifecycle"), occurrenceId: uuid, stageId: stableIdentifier(120), state: z.enum(["STARTED", "COMPLETED", "FAILED", "CANCELLED"]), reasonCode: stableIdentifier(120).nullable() }).strict();
const traversalFact = z.object({ ...factCommon, kind: z.literal("edge.traversal"), edgeId: stableIdentifier(120), sourceOccurrenceId: uuid, targetOccurrenceId: uuid.nullable(), state: z.enum(["TAKEN", "NOT_TAKEN", "UNKNOWN"]), reasonCode: stableIdentifier(120).nullable(), evidenceRefIds: z.array(stableIdentifier(160)).max(20) }).strict().refine((item) => new Set(item.evidenceRefIds).size === item.evidenceRefIds.length, "duplicate evidence reference");
const reviewFact = z.object({ ...factCommon, kind: z.literal("human.review"), gateId: stableIdentifier(120), occurrenceId: uuid, state: z.enum(["REQUESTED", "APPROVED", "REJECTED", "CANCELLED"]) }).strict();
const evaluationFact = z.object({ ...factCommon, kind: z.literal("transition.evaluation"), edgeId: stableIdentifier(120), sourceOccurrenceId: uuid, targetOccurrenceId: uuid.nullable().optional(), decision: z.enum(["ALLOW", "BLOCK", "FALLBACK", "RETRY", "UNKNOWN"]), reasonCode: stableIdentifier(120) }).strict();
export const OpsConsoleExecutionFactSchema = z.discriminatedUnion("kind", [nodeFact, traversalFact, reviewFact, evaluationFact]);
export const OpsConsoleExecutionFactBatchSchema = z.object({ schemaVersion: z.literal(OPS_CONSOLE_EXECUTION_FACTS_BATCH_VERSION), producer, facts: z.array(OpsConsoleExecutionFactSchema).min(1).max(OPS_CONSOLE_MAX_FACTS_PER_BATCH) }).strict().superRefine((batch, context) => {
  const first = batch.facts[0]; let previous = 0; const ids = new Set<string>(); const sequences = new Set<number>();
  batch.facts.forEach((fact, index) => {
    if (ids.has(fact.factId)) context.addIssue({ code: "custom", path: ["facts", index, "factId"], message: "duplicate fact id" });
    if (sequences.has(fact.sequence) || fact.sequence <= previous) context.addIssue({ code: "custom", path: ["facts", index, "sequence"], message: "sequences must increase monotonically" });
    if (first && (fact.operationId !== first.operationId || fact.workflow.id !== first.workflow.id || fact.workflow.version !== first.workflow.version || fact.workflow.definitionHash !== first.workflow.definitionHash)) context.addIssue({ code: "custom", path: ["facts", index], message: "batch must reference one operation and workflow" });
    ids.add(fact.factId); sequences.add(fact.sequence); previous = fact.sequence;
  });
});

export type OpsConsoleWorkflowManifest = z.infer<typeof OpsConsoleWorkflowManifestSchema>;
export type OpsConsoleExecutionFact = z.infer<typeof OpsConsoleExecutionFactSchema>;
export type OpsConsoleExecutionFactBatch = z.infer<typeof OpsConsoleExecutionFactBatchSchema>;

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

export function computeOpsConsoleWorkflowDefinitionHash(manifest: Omit<OpsConsoleWorkflowManifest, "definitionHash">): string {
  const normalized = {
    producerId: manifest.producer.id,
    workflow: { id: manifest.workflow.id, version: manifest.workflow.version },
    topology: manifest.topology,
    capabilities: [...manifest.capabilities].sort(),
    stages: [...manifest.stages].sort((a, b) => compareText(a.id, b.id)).map((item) => ({
      id: item.id, label: item.label, kind: item.kind,
      ...(item.gateIds ? { gateIds: [...item.gateIds].sort() } : {}),
      ...(item.description ? { description: item.description } : {}),
      ...(item.guardrailIds ? { guardrailIds: [...item.guardrailIds].sort() } : {}),
    })),
    edges: [...manifest.edges].sort((a, b) => compareText(a.id, b.id)).map((item) => ({
      id: item.id, sourceStageId: item.sourceStageId, targetStageId: item.targetStageId,
      transitionType: item.transitionType, label: item.label,
      ...(item.description ? { description: item.description } : {}),
      ...(item.guardrailIds ? { guardrailIds: [...item.guardrailIds].sort() } : {}),
    })),
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(normalized)).digest("hex")}`;
}

export function assertOpsConsoleRequestSize(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > OPS_CONSOLE_MAX_REQUEST_BYTES) throw new Error("OPS_CONSOLE_PAYLOAD_TOO_LARGE");
}
