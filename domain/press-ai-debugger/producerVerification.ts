import { z } from "zod";

export const PRODUCER_VERIFICATION_SCHEMA_VERSION = "presstuner/producer-verification/v1" as const;

const count = z.number().int().nonnegative();
const canonicalCounts = z.object({
  "run.lifecycle": count,
  "span.lifecycle": count,
  "transition.evaluation": count,
  "human.approval": count,
  "edge.traversed": count,
  "dataset.item.captured": count,
  "replay.started": count,
  "experiment.outcome": count,
  "regression.outcome": count,
}).strict();
const factCounts = z.object({
  "node.lifecycle": count,
  "edge.traversal": count,
  "human.review": count,
}).strict();

export const ProducerVerificationReportSchema = z.object({
  schemaVersion: z.literal(PRODUCER_VERIFICATION_SCHEMA_VERSION),
  manifest: z.object({
    status: z.enum(["verified", "mismatch"]),
    protocolVersion: z.literal("ops-console/producer-protocol/v1"),
    sdkVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/),
    workflowId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/),
    workflowVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/),
    definitionHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    storedRegistryHash: z.string().regex(/^fnv1a32:[0-9a-f]{8}$/),
    registryMatches: z.boolean(),
    stageCount: count,
    edgeCount: count,
    gateCount: count,
  }).strict(),
  canonical: z.object({
    status: z.enum(["observed", "empty", "invalid", "limit_exceeded"]),
    totalCount: count,
    counts: canonicalCounts,
  }).strict(),
  facts: z.object({
    status: z.enum(["ready", "empty", "invalid", "limit_exceeded"]),
    factCount: count,
    batchCount: count,
    counts: factCounts,
    deterministicIds: z.boolean(),
    replaySafe: z.boolean(),
  }).strict(),
  otlp: z.object({
    status: z.enum(["ready", "empty", "invalid", "limit_exceeded"]),
    contentFree: z.boolean(),
    spanCount: count,
    requestCount: count,
  }).strict(),
  delivery: z.object({
    operationConfiguration: z.enum(["enabled", "disabled"]),
    otlpConfiguration: z.enum(["enabled", "disabled"]),
    operationLinkage: z.enum(["linked", "failed", "disabled", "not_observed"]),
    factDelivery: z.enum(["failed", "disabled", "not_observed"]),
    otlpDelivery: z.enum(["failed", "disabled", "not_observed"]),
    completionDelivery: z.enum(["failed", "disabled", "not_observed"]),
  }).strict(),
  replay: z.object({
    canonicalCount: count,
    uniqueDeterministicFactCount: count,
    aggregateSpanCount: count,
    replaySafe: z.boolean(),
  }).strict(),
}).strict();

export type ProducerVerificationReport = z.infer<typeof ProducerVerificationReportSchema>;
