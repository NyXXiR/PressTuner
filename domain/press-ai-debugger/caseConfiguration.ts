import { z } from "zod";

import { pressCreationProcess } from "./processRegistry";
import { validatePressTopologyEdgeIds } from "./transitionCompatibility";

export const PRESS_AI_CASE_TOPOLOGY_SCHEMA_VERSION = "press-ai-case-topology/v1" as const;
export const PRESS_AI_REGISTERED_EDGE_IDS = pressCreationProcess.edges.map((edge) => edge.id) as [string, ...string[]];
export type PressAiRegisteredEdgeId = (typeof pressCreationProcess.edges)[number]["id"];

export const PressAiCaseTopologySchema = z.object({
  schemaVersion: z.literal(PRESS_AI_CASE_TOPOLOGY_SCHEMA_VERSION),
  enabledEdgeIds: z.array(z.enum(PRESS_AI_REGISTERED_EDGE_IDS)),
  maxIterations: z.number().int().min(1).max(5),
}).strict().superRefine((value, context) => {
  try { validatePressTopologyEdgeIds(value.enabledEdgeIds); }
  catch (error) { context.addIssue({ code: "custom", path: ["enabledEdgeIds"], message: error instanceof Error ? error.message : "PRESS_AI_TOPOLOGY_INVALID" }); }
});

export type PressAiCaseTopology = z.infer<typeof PressAiCaseTopologySchema>;

export const DEFAULT_PRESS_AI_CASE_TOPOLOGY: PressAiCaseTopology = Object.freeze({
  schemaVersion: PRESS_AI_CASE_TOPOLOGY_SCHEMA_VERSION,
  enabledEdgeIds: [...PRESS_AI_REGISTERED_EDGE_IDS],
  maxIterations: 3,
});

export const LEGACY_PRESS_AI_CASE_TOPOLOGY: PressAiCaseTopology = Object.freeze({
  schemaVersion: PRESS_AI_CASE_TOPOLOGY_SCHEMA_VERSION,
  enabledEdgeIds: PRESS_AI_REGISTERED_EDGE_IDS.filter((edgeId) => edgeId !== "rewrite-review"),
  maxIterations: 3,
});

export const PressAiGuardrailSnapshotSchema = z.array(z.object({
  id: z.string().min(1),
  edgeId: z.enum(PRESS_AI_REGISTERED_EDGE_IDS),
  instruction: z.string().min(1).max(4000),
  severity: z.enum(["WARN", "BLOCK"]),
  evaluatorId: z.string().min(1),
  evaluatorVersion: z.string().min(1),
  displayOrder: z.number().int().min(0),
}).strict());

export function parsePressAiCaseTopology(value: unknown): PressAiCaseTopology {
  return PressAiCaseTopologySchema.parse(value);
}

export function rebasePressAiArticleReferences(value: unknown, oldArticleId: string, newArticleId: string): unknown {
  if (value === oldArticleId) return newArticleId;
  if (Array.isArray(value)) return value.map((item) => rebasePressAiArticleReferences(item, oldArticleId, newArticleId));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key === oldArticleId ? newArticleId : key, rebasePressAiArticleReferences(item, oldArticleId, newArticleId)]));
  return value;
}
