import { createHash } from "node:crypto";

import type {
  EvaluationExecutionRequest,
  EvaluationExecutor,
} from "@/domain/evaluation/evaluationExecutor";
import type { EvidenceObservation } from "@/domain/evaluation/experimentContracts";

export type ProductionCaseMeasurement = {
  observations: Record<string, EvidenceObservation>;
};

export class PressAgentEvaluationExecutor implements EvaluationExecutor {
  readonly id = "press-agent-production/v1";

  constructor(
    private readonly runCase: (
      request: EvaluationExecutionRequest,
      caseId: string,
    ) => Promise<ProductionCaseMeasurement>,
  ) {}

  async execute(request: EvaluationExecutionRequest) {
    if (request.environment.executorId !== this.id) {
      throw new Error("AGENT_EXPERIMENT_EXECUTOR_ENVIRONMENT_MISMATCH");
    }
    const executionId = `exec_${createHash("sha256")
      .update(
        [
          request.role,
          request.configuration.contentHash,
          request.dataset.contentHash,
          request.environment.contentHash,
        ].join(":"),
      )
      .digest("hex")}`;
    const startedAt = new Date().toISOString();
    const outcomes = [];
    for (const entry of request.dataset.cases) {
      const measured = await this.runCase(request, entry.id);
      if (
        Object.values(measured.observations).some(
          ({ evidenceClass }) => evidenceClass === "synthetic",
        )
      ) {
        throw new Error("PRODUCTION_EXECUTOR_CANNOT_EMIT_SYNTHETIC_EVIDENCE");
      }
      outcomes.push({
        executionId,
        caseId: entry.id,
        expectedBehavior: entry.expectedBehavior,
        observations: measured.observations,
      });
    }
    return {
      id: executionId,
      role: request.role,
      configurationId: request.configuration.id,
      configurationHash: request.configuration.contentHash,
      environmentId: request.environment.id,
      executorId: this.id,
      seed: request.environment.seed,
      startedAt,
      completedAt: new Date().toISOString(),
      outcomes,
    };
  }
}
