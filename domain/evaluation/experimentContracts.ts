import { z } from "zod";

import {
  agentConfigurationIdentitySchema,
  sha256Canonical,
} from "./configurationIdentity";

export const AGENT_EXPERIMENT_VERSION = "agent-experiment/v2" as const;
export const EVIDENCE_CLASSES = [
  "measured",
  "synthetic",
  "replay_derived",
  "judge_derived",
  "missing",
] as const;

const nonEmpty = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceClass = z.enum(EVIDENCE_CLASSES);

export const observationSchema = z
  .object({ evidenceClass, value: z.unknown().nullable() })
  .strict()
  .superRefine((observation, context) => {
    if (
      (observation.evidenceClass === "missing") !==
      (observation.value === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "missing evidence must have a null value and only missing evidence may be null",
      });
    }
  });

export type EvidenceObservation<T = unknown> = {
  evidenceClass: (typeof EVIDENCE_CLASSES)[number];
  value: T | null;
};

export const experimentConfigurationSchema = z
  .object({
    id: nonEmpty,
    contentHash: sha256,
    identity: agentConfigurationIdentitySchema,
  })
  .strict();

export const experimentDatasetSchema = z
  .object({
    id: nonEmpty,
    contentHash: sha256,
    version: nonEmpty,
    cases: z
      .array(
        z
          .object({
            id: nonEmpty,
            question: z.string(),
            expectedBehavior: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const experimentEnvironmentSchema = z
  .object({
    id: nonEmpty,
    contentHash: sha256,
    executorId: nonEmpty,
    seed: z.number().int().nonnegative(),
    frozenAt: z.string().datetime({ offset: true }),
  })
  .strict();

const caseOutcomeSchema = z
  .object({
    executionId: nonEmpty,
    caseId: nonEmpty,
    expectedBehavior: z.record(z.string(), z.unknown()),
    observations: z.record(z.string(), observationSchema),
  })
  .strict();

const executionSchema = z
  .object({
    id: nonEmpty,
    role: z.enum(["baseline", "candidate"]),
    configurationId: nonEmpty,
    configurationHash: sha256,
    environmentId: nonEmpty,
    executorId: nonEmpty,
    seed: z.number().int().nonnegative(),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
    outcomes: z.array(caseOutcomeSchema).min(1),
  })
  .strict()
  .superRefine((execution, context) => {
    if (Date.parse(execution.completedAt) < Date.parse(execution.startedAt)) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "execution cannot complete before it starts",
      });
    }
  });

const artifactBodySchema = z
  .object({
    version: z.literal(AGENT_EXPERIMENT_VERSION),
    datasetId: nonEmpty,
    datasetHash: sha256,
    environmentId: nonEmpty,
    environmentHash: sha256,
    configurations: z
      .object({
        baseline: experimentConfigurationSchema,
        candidate: experimentConfigurationSchema,
      })
      .strict(),
    executions: z
      .object({ baseline: executionSchema, candidate: executionSchema })
      .strict(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const agentExperimentArtifactSchema = artifactBodySchema
  .extend({ artifactHash: sha256 })
  .strict();

export type ExperimentConfiguration = z.infer<
  typeof experimentConfigurationSchema
>;
export type ExperimentDataset = z.infer<typeof experimentDatasetSchema>;
export type ExperimentEnvironment = z.infer<
  typeof experimentEnvironmentSchema
>;
export type ExperimentExecution = z.infer<typeof executionSchema>;
export type AgentExperimentArtifact = z.infer<
  typeof agentExperimentArtifactSchema
>;
export type AgentExperimentArtifactBody = z.infer<typeof artifactBodySchema>;

function assertHash(actual: string, value: unknown, code: string) {
  if (actual !== sha256Canonical(value)) throw new Error(code);
}

export function parseExperimentConfiguration(
  input: unknown,
): ExperimentConfiguration {
  const parsed = experimentConfigurationSchema.parse(input);
  assertHash(
    parsed.contentHash,
    parsed.identity,
    "AGENT_EXPERIMENT_CONFIGURATION_HASH_MISMATCH",
  );
  if (parsed.id !== `cfg_${parsed.contentHash}`) {
    throw new Error("AGENT_EXPERIMENT_CONFIGURATION_ID_MISMATCH");
  }
  return parsed;
}

export function parseExperimentDataset(input: unknown): ExperimentDataset {
  const parsed = experimentDatasetSchema.parse(input);
  const seen = new Set<string>();
  for (const entry of parsed.cases) {
    if (seen.has(entry.id)) throw new Error("AGENT_EXPERIMENT_DUPLICATE_CASE_ID");
    seen.add(entry.id);
  }
  assertHash(
    parsed.contentHash,
    { version: parsed.version, cases: parsed.cases },
    "AGENT_EXPERIMENT_DATASET_HASH_MISMATCH",
  );
  return parsed;
}

export function parseExperimentEnvironment(input: unknown): ExperimentEnvironment {
  const parsed = experimentEnvironmentSchema.parse(input);
  assertHash(
    parsed.contentHash,
    {
      executorId: parsed.executorId,
      seed: parsed.seed,
      frozenAt: parsed.frozenAt,
    },
    "AGENT_EXPERIMENT_ENVIRONMENT_HASH_MISMATCH",
  );
  return parsed;
}

export function createAgentExperimentArtifact(
  body: AgentExperimentArtifactBody,
): AgentExperimentArtifact {
  return parseAgentExperimentArtifact({
    ...body,
    artifactHash: sha256Canonical(body),
  });
}

export function parseAgentExperimentArtifact(
  input: unknown,
): AgentExperimentArtifact {
  const parsed = agentExperimentArtifactSchema.parse(input);
  const { artifactHash, ...body } = parsed;
  assertHash(
    artifactHash,
    body,
    "AGENT_EXPERIMENT_ARTIFACT_HASH_MISMATCH",
  );
  const baselineConfiguration = parseExperimentConfiguration(
    parsed.configurations.baseline,
  );
  const candidateConfiguration = parseExperimentConfiguration(
    parsed.configurations.candidate,
  );
  const baseline = parsed.executions.baseline;
  const candidate = parsed.executions.candidate;
  if (baseline.role !== "baseline" || candidate.role !== "candidate") {
    throw new Error("AGENT_EXPERIMENT_EXECUTION_ROLE_MISMATCH");
  }
  if (baseline.id === candidate.id) {
    throw new Error("AGENT_EXPERIMENT_EXECUTION_IDS_MUST_DIFFER");
  }
  if (baseline.executorId !== candidate.executorId) {
    throw new Error("AGENT_EXPERIMENT_EXECUTOR_IDS_MUST_MATCH");
  }
  const baselineCaseIds = baseline.outcomes.map(({ caseId }) => caseId);
  const candidateCaseIds = candidate.outcomes.map(({ caseId }) => caseId);
  if (
    new Set(baselineCaseIds).size !== baselineCaseIds.length ||
    new Set(candidateCaseIds).size !== candidateCaseIds.length
  ) {
    throw new Error("AGENT_EXPERIMENT_DUPLICATE_OUTCOME_CASE_ID");
  }
  if (
    baselineCaseIds.length !== candidateCaseIds.length ||
    baselineCaseIds.some((caseId, index) => candidateCaseIds[index] !== caseId)
  ) {
    throw new Error("AGENT_EXPERIMENT_EXECUTION_CASES_MUST_MATCH");
  }
  for (let index = 0; index < baseline.outcomes.length; index += 1) {
    if (
      sha256Canonical(baseline.outcomes[index].expectedBehavior) !==
      sha256Canonical(candidate.outcomes[index].expectedBehavior)
    ) {
      throw new Error("AGENT_EXPERIMENT_EXPECTED_BEHAVIOR_MUST_MATCH");
    }
  }
  for (const [execution, configuration] of [
    [baseline, baselineConfiguration],
    [candidate, candidateConfiguration],
  ] as const) {
    if (
      execution.configurationId !== configuration.id ||
      execution.configurationHash !== configuration.contentHash ||
      execution.environmentId !== parsed.environmentId ||
      execution.outcomes.some((outcome) => outcome.executionId !== execution.id)
    ) {
      throw new Error("AGENT_EXPERIMENT_EXECUTION_PROVENANCE_MISMATCH");
    }
  }
  return parsed;
}
