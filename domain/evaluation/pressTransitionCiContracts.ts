import { z } from "zod";
import { sha256Canonical } from "./configurationIdentity";

const caseSchema = z.object({
  id: z.string().min(1).max(100), edgeId: z.string().min(1).max(100),
  sourceInput: z.unknown(), sourceOutput: z.unknown(), targetPayload: z.unknown(),
  expectedVerdict: z.enum(["PASS", "WARN", "BLOCK"]),
  article: z.object({ id: z.string(), teamId: z.string().nullable(), type: z.string() }).strict().optional(),
  expectations: z.array(z.object({ id: z.string(), field: z.enum(["contains", "notContains"]), value: z.string(), verdict: z.enum(["WARN", "BLOCK"]).optional() }).strict()).max(50).default([]),
  forbiddenMetadataTokens: z.array(z.string().min(1).max(200)).max(50).default([]),
}).strict();

export const PressTransitionCiDatasetSchema = z.object({
  schemaVersion: z.literal("press-transition-dataset/v1"), version: z.string().min(1).max(100),
  processId: z.literal("press-creation"), processVersion: z.string().min(1).max(100), registryHash: z.string().min(8).max(128),
  createdAt: z.string().datetime({ offset: true }), contentHash: z.string().regex(/^[0-9a-f]{64}$/), cases: z.array(caseSchema).min(1).max(200), requiredEdgeIds: z.array(z.string()).min(1).max(20),
}).strict();

export const PressTransitionCiBaselineSchema = z.object({ schemaVersion: z.literal("press-transition-baseline/v1"), datasetVersion: z.string(), datasetHash: z.string().regex(/^[0-9a-f]{64}$/), metrics: z.record(z.string(), z.number().min(0).max(1)), thresholds: z.record(z.string(), z.number().min(0).max(1)) }).strict();
export type PressTransitionCiDataset = z.infer<typeof PressTransitionCiDatasetSchema>;
export type PressTransitionCiBaseline = z.infer<typeof PressTransitionCiBaselineSchema>;

export function pressTransitionDatasetContentHash(value: Omit<PressTransitionCiDataset, "contentHash"> | PressTransitionCiDataset) {
  const content = { ...value } as Partial<PressTransitionCiDataset>;
  delete content.contentHash;
  return sha256Canonical(content);
}

export function parsePressTransitionCiDataset(value: unknown) {
  const dataset = PressTransitionCiDatasetSchema.parse(value);
  if (pressTransitionDatasetContentHash(dataset) !== dataset.contentHash) throw new Error("PRESS_TRANSITION_DATASET_HASH_MISMATCH");
  if (new Set(dataset.cases.map(({ id }) => id)).size !== dataset.cases.length) throw new Error("PRESS_TRANSITION_DATASET_CASE_IDS_DUPLICATE");
  return dataset;
}
