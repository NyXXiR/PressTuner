import { z } from "zod";

import { sha256Canonical } from "./configurationIdentity";
import { evaluateAgentExperiment } from "./experimentEvaluation";
import {
  agentExperimentArtifactSchema,
  observationSchema,
  parseAgentExperimentArtifact,
} from "./experimentContracts";

export const AGENT_EXPERIMENT_CYCLE_VERSION =
  "agent-experiment-cycle/v2" as const;

const bodySchema = z
  .object({
    version: z.literal(AGENT_EXPERIMENT_CYCLE_VERSION),
    producer: z
      .object({ id: z.literal("press-tuner"), displayName: z.literal("PressTuner") })
      .strict(),
    cycleId: z.string().min(1),
    sequence: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    experiment: agentExperimentArtifactSchema,
    evaluation: z
      .object({
        evidenceClass: z.enum(["measured", "synthetic", "replay_derived", "judge_derived", "missing", "mixed"]),
        metrics: z.record(
          z.string(),
          z.object({ baseline: observationSchema, candidate: observationSchema }).strict(),
        ),
        checks: z.array(
          z
            .object({
              metricId: z.string().min(1),
              status: z.enum(["PASS", "FAIL", "NOT_EVALUABLE"]),
              baseline: z.number().nullable(),
              candidate: z.number().nullable(),
              reason: z.string().min(1),
            })
            .strict(),
        ),
        disposition: z.enum(["PROMOTE", "REJECT", "NOT_EVALUABLE"]),
        humanReview: z.enum(["PENDING", "APPROVED", "REJECTED"]),
        deploymentAuthorized: z.literal(false),
      })
      .strict(),
    feedbackCandidates: z.array(
      z
        .object({
          id: z.string().min(1),
          state: z.enum(["PENDING", "ACCEPTED", "REJECTED", "PROMOTED"]),
          provenance: z.array(z.string().min(1)),
        })
        .strict(),
    ),
    auditEvents: z.array(
      z
        .object({
          occurredAt: z.string().datetime({ offset: true }),
          eventType: z.string().min(1),
          failureCategory: z.string().min(1).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const agentExperimentCycleEvidenceSchema = bodySchema
  .extend({ evidenceHash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();

export type AgentExperimentCycleEvidence = z.infer<
  typeof agentExperimentCycleEvidenceSchema
>;

export function createAgentExperimentCycleEvidence(args: {
  cycleId: string;
  sequence: number;
  experiment: unknown;
  humanReview?: "PENDING" | "APPROVED" | "REJECTED";
  feedbackCandidates?: AgentExperimentCycleEvidence["feedbackCandidates"];
  auditEvents?: AgentExperimentCycleEvidence["auditEvents"];
}) {
  const experiment = parseAgentExperimentArtifact(args.experiment);
  const humanReview = args.humanReview ?? "PENDING";
  const evaluation = evaluateAgentExperiment(experiment, humanReview);
  const body = bodySchema.parse({
    version: AGENT_EXPERIMENT_CYCLE_VERSION,
    producer: { id: "press-tuner", displayName: "PressTuner" },
    cycleId: args.cycleId,
    sequence: args.sequence,
    createdAt: experiment.createdAt,
    experiment,
    evaluation: {
      evidenceClass: evaluation.evidenceClass,
      metrics: evaluation.metrics,
      checks: evaluation.checks,
      disposition: evaluation.disposition,
      humanReview,
      deploymentAuthorized: false,
    },
    feedbackCandidates: args.feedbackCandidates ?? [],
    auditEvents: args.auditEvents ?? [],
  });
  return agentExperimentCycleEvidenceSchema.parse({
    ...body,
    evidenceHash: sha256Canonical(body),
  });
}

export function parseAgentExperimentCycleEvidence(input: unknown) {
  const parsed = agentExperimentCycleEvidenceSchema.parse(input);
  const { evidenceHash, ...body } = parsed;
  if (evidenceHash !== sha256Canonical(body)) {
    throw new Error("AGENT_EXPERIMENT_CYCLE_EVIDENCE_HASH_MISMATCH");
  }
  parseAgentExperimentArtifact(parsed.experiment);
  return parsed;
}
