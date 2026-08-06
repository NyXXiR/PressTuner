import { z } from "zod";
import { ragQueryProcess } from "@/domain/press-ai-debugger/processRegistry";

export type PressAgentWorkflowStageId = (typeof ragQueryProcess.nodes)[number]["id"];
export type PressAgentWorkflowEdgeId = (typeof ragQueryProcess.edges)[number]["id"];

/** Compatibility exports. The registry is the only topology source of truth. */
export const PRESS_AGENT_WORKFLOW_STAGE_IDS = ragQueryProcess.nodes.map((node) => node.id) as [PressAgentWorkflowStageId, ...PressAgentWorkflowStageId[]];
export const PRESS_AGENT_WORKFLOW_EDGES = ragQueryProcess.edges.map(({ id, source, target }) => ({ id: id as PressAgentWorkflowEdgeId, source: source as PressAgentWorkflowStageId, target: target as PressAgentWorkflowStageId }));

const StageIdSchema = z.enum(PRESS_AGENT_WORKFLOW_STAGE_IDS);
const StageStateSchema = z.enum(["waiting", "running", "succeeded", "warning", "failed", "blocked", "skipped"]);
const EdgeStateSchema = z.enum(["pending", "moving", "taken", "taken-with-violation", "blocked", "not-taken"]);
const FindingCodeSchema = z.enum([
  "retrieval-empty", "retrieval-tool-failed", "evidence-conflict", "insufficient-evidence",
  "claim-verification-failed", "fallback-extractive", "fallback-abstention", "fallback-not-needed",
  "approval-required", "user-cancelled", "runtime-failed", "guardrail-warning",
]);

export type PressAgentWorkflowFindingCode = z.infer<typeof FindingCodeSchema>;

const SafeCountMetricsSchema = z.object({
  selectedSources: z.number().int().nonnegative().optional(),
  eligibleSources: z.number().int().nonnegative().optional(),
  conflicts: z.number().int().nonnegative().optional(),
  claims: z.number().int().nonnegative().optional(),
  supportedClaims: z.number().int().nonnegative().optional(),
  citations: z.number().int().nonnegative().optional(),
  failedTools: z.number().int().nonnegative().optional(),
}).strict();

const common = {
  schemaVersion: z.literal("press-agent-workflow-event/v1"),
  eventId: z.string().min(1).max(100),
  dedupeKey: z.string().min(1).max(200),
  runId: z.string().min(1).max(100),
  sequence: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: true }),
};

export const PressAgentWorkflowEventV1Schema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("run.started"), run: z.object({ status: z.literal("running") }).strict() }).strict(),
  z.object({ ...common, type: z.literal("stage.state"), stage: z.object({ id: StageIdSchema, state: StageStateSchema, findingCode: FindingCodeSchema.nullable(), metrics: SafeCountMetricsSchema.optional() }).strict() }).strict(),
  z.object({ ...common, type: z.literal("edge.state"), edge: z.object({ id: z.enum(PRESS_AGENT_WORKFLOW_EDGES.map((edge) => edge.id) as [PressAgentWorkflowEdgeId, ...PressAgentWorkflowEdgeId[]]), source: StageIdSchema, target: StageIdSchema, state: EdgeStateSchema, findingCode: FindingCodeSchema.nullable() }).strict() }).strict(),
  z.object({ ...common, type: z.literal("run.finished"), run: z.object({ status: z.enum(["succeeded", "warning", "failed", "cancelled", "blocked"]), findingCode: FindingCodeSchema.nullable() }).strict() }).strict(),
]);

export type PressAgentWorkflowEventV1 = z.infer<typeof PressAgentWorkflowEventV1Schema>;
export type PressAgentWorkflowStageState = z.infer<typeof StageStateSchema>;
export type PressAgentWorkflowEdgeState = z.infer<typeof EdgeStateSchema>;
export type PressAgentWorkflowEventInput =
  | { type: "run.started"; dedupeKey: string; run: { status: "running" } }
  | { type: "stage.state"; dedupeKey: string; stage: { id: PressAgentWorkflowStageId; state: PressAgentWorkflowStageState; findingCode: PressAgentWorkflowFindingCode | null; metrics?: Record<string, number> } }
  | { type: "edge.state"; dedupeKey: string; edge: { id: PressAgentWorkflowEdgeId; source: PressAgentWorkflowStageId; target: PressAgentWorkflowStageId; state: PressAgentWorkflowEdgeState; findingCode: PressAgentWorkflowFindingCode | null } }
  | { type: "run.finished"; dedupeKey: string; run: { status: "succeeded" | "warning" | "failed" | "cancelled" | "blocked"; findingCode: PressAgentWorkflowFindingCode | null } };

export function parsePressAgentWorkflowEvent(value: unknown): PressAgentWorkflowEventV1 {
  const event = PressAgentWorkflowEventV1Schema.parse(value);
  if (event.type === "edge.state") {
    const topology = PRESS_AGENT_WORKFLOW_EDGES.find((edge) => edge.id === event.edge.id);
    if (!topology || topology.source !== event.edge.source || topology.target !== event.edge.target) {
      throw new Error("PRESS_AGENT_WORKFLOW_EDGE_TOPOLOGY_INVALID");
    }
  }
  return event;
}

export const PRESS_AGENT_WORKFLOW_FINDING_COPY: Readonly<Record<PressAgentWorkflowFindingCode, string>> = {
  "retrieval-empty": "검색 가능한 근거가 없습니다.",
  "retrieval-tool-failed": "검색 도구 실행에 실패했습니다.",
  "evidence-conflict": "근거 사이의 충돌을 확인했습니다.",
  "insufficient-evidence": "답변하기에 근거가 충분하지 않습니다.",
  "claim-verification-failed": "일부 주장이 최종 근거 검증을 통과하지 못했습니다.",
  "fallback-extractive": "검증 가능한 발췌형 답변으로 안전하게 전환했습니다.",
  "fallback-abstention": "검증 가능한 답변을 만들 수 없어 답변을 유보했습니다.",
  "fallback-not-needed": "안전 대체가 필요하지 않았습니다.",
  "approval-required": "사용자 승인이 필요해 실행이 중단되었습니다.",
  "user-cancelled": "사용자가 실행을 취소했습니다.",
  "runtime-failed": "실행이 안전하게 종료되지 못했습니다.",
  "guardrail-warning": "안전 검토 경고가 있습니다.",
};

export function projectPressAgentWorkflow(
  input: readonly PressAgentWorkflowEventV1[],
  options: { now?: Date; stalledAfterMs?: number } = {},
) {
  const stages = Object.fromEntries(PRESS_AGENT_WORKFLOW_STAGE_IDS.map((id) => [id, { id, state: "waiting" as PressAgentWorkflowStageState, findingCode: null as PressAgentWorkflowFindingCode | null, metrics: undefined as Record<string, number> | undefined }])) as Record<PressAgentWorkflowStageId, { id: PressAgentWorkflowStageId; state: PressAgentWorkflowStageState; findingCode: PressAgentWorkflowFindingCode | null; metrics?: Record<string, number> }>;
  const edges = Object.fromEntries(PRESS_AGENT_WORKFLOW_EDGES.map((edge) => [edge.id, { ...edge, state: "pending" as PressAgentWorkflowEdgeState, findingCode: null as PressAgentWorkflowFindingCode | null }])) as Record<PressAgentWorkflowEdgeId, { id: PressAgentWorkflowEdgeId; source: PressAgentWorkflowStageId; target: PressAgentWorkflowStageId; state: PressAgentWorkflowEdgeState; findingCode: PressAgentWorkflowFindingCode | null }>;
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const events = [...input].sort((a, b) => a.sequence - b.sequence).filter((entry) => {
    if (seenIds.has(entry.eventId) || seenKeys.has(entry.dedupeKey)) return false;
    seenIds.add(entry.eventId); seenKeys.add(entry.dedupeKey); return true;
  });
  let runStatus: "idle" | "running" | "succeeded" | "warning" | "failed" | "cancelled" | "blocked" = "idle";
  let last: PressAgentWorkflowEventV1 | null = null;
  for (const entry of events) {
    if (["succeeded", "warning", "failed", "cancelled", "blocked"].includes(runStatus)) break;
    if (entry.type === "run.started") runStatus = "running";
    if (entry.type === "stage.state") stages[entry.stage.id] = { ...entry.stage };
    if (entry.type === "edge.state") edges[entry.edge.id] = { ...entry.edge };
    if (entry.type === "run.finished") runStatus = entry.run.status;
    last = entry;
  }
  const now = options.now ?? new Date();
  const stalled = runStatus === "running" && last !== null && now.getTime() - new Date(last.occurredAt).getTime() > (options.stalledAfterMs ?? 30_000);
  return { stages, edges, runStatus, stalled, lastEventAt: last?.occurredAt ?? null, lastSequence: last?.sequence ?? 0 };
}
