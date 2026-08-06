import { Prisma } from "@prisma/client";

import { sha256Canonical } from "@/domain/evaluation/configurationIdentity";
import { evaluateAgentExperiment } from "@/domain/evaluation/experimentEvaluation";
import {
  createAgentExperimentCycleEvidence,
  parseAgentExperimentCycleEvidence,
} from "@/domain/evaluation/experimentCycleEvidence";
import {
  parseAgentExperimentArtifact,
  parseExperimentDataset,
  parseExperimentEnvironment,
  type EvidenceObservation,
} from "@/domain/evaluation/experimentContracts";
import { prisma } from "@/lib/prisma";
import { getProcessRegistryHash } from "@/domain/press-ai-debugger/processRegistryHash";
import { ragQueryProcess } from "@/domain/press-ai-debugger/processRegistry";
import { mapExperimentOutcomes, mapHumanApproval } from "@/domain/ai-telemetry/pressMapper";
import { appendCanonicalEvent } from "@/lib/services/ai-telemetry/canonicalEventStore";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function executionEvidenceClass(
  outcomes: Array<{ observations: Record<string, EvidenceObservation> }>,
) {
  const classes = new Set(
    outcomes.flatMap(({ observations }) =>
      Object.values(observations).map(({ evidenceClass }) => evidenceClass),
    ),
  );
  if (classes.has("missing")) return "missing";
  return classes.size === 1 ? [...classes][0] : "mixed";
}

export async function persistAgentExperimentCycle(args: {
  teamId: string;
  userId: string;
  dataset: unknown;
  environment: unknown;
  artifact: unknown;
}) {
  const dataset = parseExperimentDataset(args.dataset);
  const environment = parseExperimentEnvironment(args.environment);
  const artifact = parseAgentExperimentArtifact(args.artifact);
  if (
    artifact.datasetHash !== dataset.contentHash ||
    artifact.environmentHash !== environment.contentHash
  ) {
    throw new Error("AGENT_EXPERIMENT_PERSISTENCE_INPUT_MISMATCH");
  }
  const evaluation = evaluateAgentExperiment(artifact, "PENDING");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${args.teamId}:agent-experiment-cycle`}))`;

    const configurations = await Promise.all(
      (["baseline", "candidate"] as const).map((role) => {
        const configuration = artifact.configurations[role];
        return tx.agentConfigurationVersion.upsert({
          where: { contentHash: configuration.contentHash },
          create: {
            teamId: args.teamId,
            contentHash: configuration.contentHash,
            identity: json(configuration.identity),
            createdById: args.userId,
          },
          update: {},
        });
      }),
    );

    let datasetVersion = await tx.agentDatasetVersion.findUnique({
      where: {
        teamId_contentHash: {
          teamId: args.teamId,
          contentHash: dataset.contentHash,
        },
      },
    });
    if (!datasetVersion) {
      datasetVersion = await tx.agentDatasetVersion.create({
        data: {
          teamId: args.teamId,
          name: dataset.version,
          contentHash: dataset.contentHash,
          createdById: args.userId,
        },
      });
      await tx.agentDatasetCase.createMany({
        data: dataset.cases.map((entry) => ({
          datasetVersionId: datasetVersion!.id,
          caseKey: entry.id,
          payload: json({
            question: entry.question,
            expectedBehavior: entry.expectedBehavior,
          }),
          contentHash: sha256Canonical(entry),
        })),
      });
    }

    const existing = await tx.agentExperimentCycle.findUnique({
      where: {
        teamId_artifactHash: {
          teamId: args.teamId,
          artifactHash: artifact.artifactHash,
        },
      },
    });
    if (existing) return existing;

    const latest = await tx.agentExperimentCycle.findFirst({
      where: { teamId: args.teamId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const sequence = (latest?.sequence ?? 0) + 1;
    const cycleEvidence = createAgentExperimentCycleEvidence({
      cycleId: `cycle_${artifact.artifactHash.slice(0, 24)}`,
      sequence,
      experiment: artifact,
      auditEvents: [
        {
          occurredAt: artifact.createdAt,
          eventType: "AGENT_EXPERIMENT_RECORDED",
          failureCategory: null,
        },
      ],
    });
    const cycle = await tx.agentExperimentCycle.create({
      data: {
        teamId: args.teamId,
        sequence,
        datasetVersionId: datasetVersion.id,
        baselineConfigurationId: configurations[0].id,
        candidateConfigurationId: configurations[1].id,
        environmentManifest: json(environment),
        artifactHash: artifact.artifactHash,
        artifact: json(cycleEvidence),
        gateChecks: json(evaluation.checks),
        disposition: evaluation.disposition,
        humanReview: "PENDING",
        evidenceClass: evaluation.evidenceClass,
        deploymentAuthorized: false,
      },
    });

    for (const role of ["baseline", "candidate"] as const) {
      const execution = artifact.executions[role];
      const storedExecution = await tx.agentExperimentExecution.create({
        data: {
          cycleId: cycle.id,
          role,
          externalExecutionId: execution.id,
          configurationId: configurations[role === "baseline" ? 0 : 1].id,
          executorId: execution.executorId,
          deterministicSeed: execution.seed,
          evidenceClass: executionEvidenceClass(execution.outcomes),
          startedAt: new Date(execution.startedAt),
          completedAt: new Date(execution.completedAt),
        },
      });
      await tx.agentExperimentCaseOutcome.createMany({
        data: execution.outcomes.map((outcome) => ({
          executionId: storedExecution.id,
          caseKey: outcome.caseId,
          expectedBehavior: json(outcome.expectedBehavior),
          observations: json(outcome.observations),
          artifactHash: sha256Canonical(outcome),
        })),
      });
    }

    await tx.agentRuntimeAuditEvent.create({
      data: {
        teamId: args.teamId,
        eventType: "AGENT_EXPERIMENT_RECORDED",
        details: json({
          cycleId: cycle.id,
          sequence: cycle.sequence,
          artifactHash: cycle.artifactHash,
          evidenceClass: cycle.evidenceClass,
          disposition: cycle.disposition,
          deploymentAuthorized: false,
        }),
      },
    });
    const telemetryContext = { teamId: args.teamId, runId: cycle.id, attemptId: cycle.id, processId: ragQueryProcess.id, processVersion: ragQueryProcess.version, registryHash: getProcessRegistryHash(ragQueryProcess), executionMode: "DETERMINISTIC" as const, occurredAt: artifact.createdAt };
    const canonical = mapExperimentOutcomes(telemetryContext, { sourceId: cycle.id, datasetId: datasetVersion.id, datasetVersion: dataset.version, baselineConfigurationId: configurations[0].id, candidateConfigurationId: configurations[1].id, disposition: evaluation.disposition, checks: evaluation.checks });
    await appendCanonicalEvent(tx, canonical.experiment);
    await appendCanonicalEvent(tx, canonical.regression);
    return cycle;
  });
}

export async function listAgentExperimentCycles(args: { teamId: string }) {
  return prisma.agentExperimentCycle.findMany({
    where: { teamId: args.teamId },
    orderBy: { sequence: "asc" },
  });
}

export async function reviewAgentExperimentCycle(args: {
  teamId: string;
  cycleId: string;
  reviewerId: string;
  decision: "APPROVED" | "REJECTED";
  note?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const cycle = await tx.agentExperimentCycle.findFirst({
      where: { id: args.cycleId, teamId: args.teamId, humanReview: "PENDING" },
    });
    if (!cycle) throw new Error("AGENT_EXPERIMENT_CYCLE_NOT_REVIEWABLE");
    const previousEvidence = parseAgentExperimentCycleEvidence(cycle.artifact);
    const evaluation = evaluateAgentExperiment(previousEvidence.experiment, args.decision);
    const reviewedAt = new Date();
    const nextEvidence = createAgentExperimentCycleEvidence({
      cycleId: previousEvidence.cycleId,
      sequence: previousEvidence.sequence,
      experiment: previousEvidence.experiment,
      humanReview: args.decision,
      feedbackCandidates: previousEvidence.feedbackCandidates,
      auditEvents: [
        ...previousEvidence.auditEvents,
        {
          occurredAt: reviewedAt.toISOString(),
          eventType: "AGENT_EXPERIMENT_REVIEWED",
          failureCategory: args.decision === "REJECTED" ? "HUMAN_REJECTED" : null,
        },
      ],
    });
    const updated = await tx.agentExperimentCycle.updateMany({
      where: { id: cycle.id, teamId: args.teamId, humanReview: "PENDING" },
      data: {
        disposition: evaluation.disposition,
        artifact: json(nextEvidence),
        gateChecks: json(evaluation.checks),
        humanReview: args.decision,
        reviewerId: args.reviewerId,
        reviewedAt,
        reviewNote: args.note?.trim() || null,
        deploymentAuthorized: false,
      },
    });
    if (updated.count !== 1) throw new Error("AGENT_EXPERIMENT_CYCLE_REVIEW_CONFLICT");
    await tx.agentRuntimeAuditEvent.create({
      data: {
        teamId: args.teamId,
        eventType: "AGENT_EXPERIMENT_REVIEWED",
        details: json({
          cycleId: cycle.id,
          decision: args.decision,
          disposition: evaluation.disposition,
          deploymentAuthorized: false,
        }),
      },
    });
    await appendCanonicalEvent(tx, mapHumanApproval({ teamId: args.teamId, runId: cycle.id, attemptId: cycle.id, processId: ragQueryProcess.id, processVersion: ragQueryProcess.version, registryHash: getProcessRegistryHash(ragQueryProcess), executionMode: "DETERMINISTIC", occurredAt: reviewedAt.toISOString() }, { sourceId: cycle.id, gateId: "experiment-human-review", phase: "RECORDED", decision: args.decision, actorId: args.reviewerId }));
    return tx.agentExperimentCycle.findFirstOrThrow({
      where: { id: cycle.id, teamId: args.teamId },
    });
  });
}
