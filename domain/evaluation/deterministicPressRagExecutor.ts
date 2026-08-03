import { createHash } from "node:crypto";

import type {
  EvaluationExecutionRequest,
  EvaluationExecutor,
} from "./evaluationExecutor";
import type { EvidenceObservation } from "./experimentContracts";

function observation<T>(value: T): EvidenceObservation<T> {
  return { evidenceClass: "synthetic", value };
}

function missing(): EvidenceObservation {
  return { evidenceClass: "missing", value: null };
}

function deterministicUnit(seed: number, ...parts: string[]) {
  const hex = createHash("sha256")
    .update([seed, ...parts].join(":"))
    .digest("hex")
    .slice(0, 8);
  return Number.parseInt(hex, 16) / 0xffffffff;
}

export class DeterministicPressRagExecutor implements EvaluationExecutor {
  readonly id = "press-rag-deterministic/v1";

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
    // The deterministic environment encodes an intentionally successful synthetic
    // candidate so the full gate/review lifecycle can be exercised without
    // pretending that these values came from a live model.
    const qualityBoost = request.role === "candidate" ? 0.25 : 0;
    return {
      id: executionId,
      role: request.role,
      configurationId: request.configuration.id,
      configurationHash: request.configuration.contentHash,
      environmentId: request.environment.id,
      executorId: this.id,
      seed: request.environment.seed,
      startedAt: request.environment.frozenAt,
      completedAt: request.environment.frozenAt,
      outcomes: request.dataset.cases.map((entry) => {
        const unit = deterministicUnit(
          request.environment.seed,
          request.configuration.contentHash,
          entry.id,
        );
        const expected = entry.expectedBehavior;
        const pass = unit + qualityBoost >= 0.2;
        const adversarialScenarios = new Set([
          "malformed_arguments",
          "prompt_injection",
          "tenant_scope",
          "unknown_tool",
          "approval",
          "idempotency",
          "cancellation",
          "budget",
        ]);
        const isAdversarial = adversarialScenarios.has(String(expected.scenario));
        const expectedDocuments = Array.isArray(expected.expectedDocumentIds)
          ? (expected.expectedDocumentIds as string[])
          : [];
        return {
          executionId,
          caseId: entry.id,
          expectedBehavior: expected,
          observations: {
            retrievalHit: observation(pass),
            recallAtK: observation(pass ? 1 : 0),
            citationPrecision: observation(pass ? 1 : 0.5),
            citationCount: observation(expectedDocuments.length),
            citationRetention: observation(pass ? 1 : 0.75),
            claimRetention: observation(pass ? 1 : 0.75),
            groundedness: observation(pass ? 1 : 0.5),
            unanswerableBehavior: observation(pass),
            conflictBehavior: observation(pass),
            toolSelection: observation(pass),
            argumentValidity: observation(pass),
            schemaCompliance: observation(true),
            effect: observation(expected.effect ?? "READ"),
            taskSuccess: observation(pass),
            domainOutcome: observation(pass ? "success" : "failure"),
            latencyMs: observation(
              80 + Math.round(unit * 40) - (request.role === "candidate" ? 20 : 0),
            ),
            inputTokens: observation(300 + Math.round(unit * 40)),
            outputTokens: observation(100 + Math.round(unit * 20)),
            costMicros: observation(
              220 + Math.round(unit * 20) - (request.role === "candidate" ? 20 : 0),
            ),
            retryRecovery: observation(expected.scenario === "retry" ? pass : true),
            terminalVerification: observation(pass),
            adversarialSuite: observation(
              !isAdversarial || request.role === "candidate" ? true : pass,
            ),
            humanAcceptance: missing(),
          },
        };
      }),
    };
  }
}
