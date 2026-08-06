import { z } from "zod";

import { PressAgentWorkflowEventV1Schema } from "@/domain/evaluation/pressAgentWorkflowEvents";
import { getPressAiProcessDefinition, isPressAiProcessId, type PressAiProcessId } from "./processRegistry";

const NodeStateSchema = z.enum(["waiting", "running", "succeeded", "warning", "failed", "blocked", "skipped"]);
const EdgeStateSchema = z.enum(["pending", "moving", "taken", "taken-with-violation", "blocked", "not-taken"]);
const common = {
  schemaVersion: z.literal("press-ai-process-event/v1"), processId: z.string().min(1), processVersion: z.string().min(1),
  eventId: z.string().min(1).max(100), dedupeKey: z.string().min(1).max(200), runId: z.string().min(1).max(100),
  sequence: z.number().int().positive(), occurredAt: z.string().datetime({ offset: true }),
};

const RawEventSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("run.started"), run: z.object({ status: z.literal("running") }).strict() }).strict(),
  z.object({ ...common, type: z.literal("node.state"), node: z.object({ id: z.string(), state: NodeStateSchema, findingCode: z.string().nullable(), metrics: z.record(z.string(), z.number().int().nonnegative()).optional() }).strict() }).strict(),
  z.object({ ...common, type: z.literal("edge.state"), edge: z.object({ id: z.string(), source: z.string(), target: z.string(), state: EdgeStateSchema, findingCode: z.string().nullable() }).strict() }).strict(),
  z.object({ ...common, type: z.literal("run.waiting-input"), gate: z.object({ id: z.string(), nodeId: z.string() }).strict() }).strict(),
  z.object({ ...common, type: z.literal("run.finished"), run: z.object({ status: z.enum(["succeeded", "warning", "failed", "cancelled", "blocked"]), findingCode: z.string().nullable() }).strict() }).strict(),
]);

export type PressAiProcessEvent = z.infer<typeof RawEventSchema> & { processId: PressAiProcessId };
type EventIdentityKeys = "schemaVersion" | "processId" | "processVersion" | "eventId" | "runId" | "sequence" | "occurredAt";
export type PressAiProcessEventInput = PressAiProcessEvent extends infer Event ? Event extends PressAiProcessEvent ? Omit<Event, EventIdentityKeys> : never : never;

function assertIdentity(event: z.infer<typeof RawEventSchema>) {
  if (!isPressAiProcessId(event.processId)) throw new Error("PRESS_AI_PROCESS_ID_INVALID");
  const process = getPressAiProcessDefinition(event.processId);
  if (event.processVersion !== process.version) throw new Error("PRESS_AI_PROCESS_VERSION_INVALID");
  if (event.type === "node.state") {
    const node = process.nodes.find((entry) => entry.id === event.node.id);
    if (!node) throw new Error("PRESS_AI_PROCESS_NODE_INVALID");
    if (event.node.findingCode && !(node.findingIds as readonly string[]).includes(event.node.findingCode)) throw new Error("PRESS_AI_PROCESS_FINDING_INVALID");
    if (event.node.metrics && Object.keys(event.node.metrics).some((id) => !(node.metricIds as readonly string[]).includes(id))) throw new Error("PRESS_AI_PROCESS_METRIC_INVALID");
  }
  if (event.type === "edge.state") {
    const edge = process.edges.find((entry) => entry.id === event.edge.id);
    if (!edge || edge.source !== event.edge.source || edge.target !== event.edge.target) throw new Error("PRESS_AI_PROCESS_EDGE_TOPOLOGY_INVALID");
  }
  if (event.type === "run.waiting-input") {
    const node = process.nodes.find((entry) => entry.id === event.gate.nodeId);
    if (!node?.gate || node.gate.id !== event.gate.id) throw new Error("PRESS_AI_PROCESS_GATE_INVALID");
  }
  return event as PressAiProcessEvent;
}

export function parsePressAiProcessEvent(value: unknown): PressAiProcessEvent {
  const legacy = PressAgentWorkflowEventV1Schema.safeParse(value);
  if (legacy.success) {
    const process = getPressAiProcessDefinition("rag-query");
    const event = legacy.data;
    if (event.type === "stage.state") return { ...event, schemaVersion: "press-ai-process-event/v1", processId: process.id, processVersion: process.version, type: "node.state", node: event.stage } as PressAiProcessEvent;
    return { ...event, schemaVersion: "press-ai-process-event/v1", processId: process.id, processVersion: process.version } as PressAiProcessEvent;
  }
  return assertIdentity(RawEventSchema.parse(value));
}

export function projectPressAiProcessEvents(processId: PressAiProcessId, input: readonly PressAiProcessEvent[]) {
  const process = getPressAiProcessDefinition(processId);
  const nodes: Record<string, { id: string; state: z.infer<typeof NodeStateSchema>; findingCode: string | null; metrics?: Record<string, number> }> = Object.fromEntries(process.nodes.map((node) => [node.id, { id: node.id, state: "waiting", findingCode: null }]));
  const edges: Record<string, { id: string; source: string; target: string; state: z.infer<typeof EdgeStateSchema>; findingCode: string | null }> = Object.fromEntries(process.edges.map((edge) => [edge.id, { id: edge.id, source: edge.source, target: edge.target, state: "pending", findingCode: null }]));
  const ids = new Set<string>(); const keys = new Set<string>();
  const events = input.filter((event) => event.processId === processId).sort((a, b) => a.sequence - b.sequence).filter((event) => { if (ids.has(event.eventId) || keys.has(event.dedupeKey)) return false; ids.add(event.eventId); keys.add(event.dedupeKey); return true; });
  let runStatus: "idle" | "running" | "waiting-input" | "succeeded" | "warning" | "failed" | "cancelled" | "blocked" = "idle";
  let waitingGate: { id: string; nodeId: string } | null = null;
  let lastSequence = 0;
  for (const event of events) {
    if (["succeeded", "warning", "failed", "cancelled", "blocked"].includes(runStatus)) break;
    if (event.type === "run.started") runStatus = "running";
    if (event.type === "node.state") nodes[event.node.id] = { ...event.node };
    if (event.type === "edge.state") edges[event.edge.id] = { ...event.edge };
    if (event.type === "run.waiting-input") { runStatus = "waiting-input"; waitingGate = event.gate; }
    if (event.type === "run.finished") { runStatus = event.run.status; waitingGate = null; }
    lastSequence = event.sequence;
  }
  return { process, nodes, edges, runStatus, waitingGate, lastSequence };
}
