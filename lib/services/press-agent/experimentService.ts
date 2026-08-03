import type { EvaluationExecutor } from "@/domain/evaluation/evaluationExecutor";
import { DeterministicPressRagExecutor } from "@/domain/evaluation/deterministicPressRagExecutor";
import { runAgentExperiment } from "@/domain/evaluation/experimentRunner";

export async function executePressRagExperiment(args: {
  executor: "deterministic" | "live";
  allowModelSpend: boolean;
  operatorAuthorized: boolean;
  liveExecutor?: EvaluationExecutor;
  baseline: unknown;
  candidate: unknown;
  dataset: unknown;
  environment: unknown;
}) {
  let executor: EvaluationExecutor;
  if (args.executor === "live") {
    if (!args.allowModelSpend || !args.operatorAuthorized) {
      throw new Error("LIVE_EXECUTION_REQUIRES_OPERATOR_AND_SPEND_AUTHORIZATION");
    }
    if (!args.liveExecutor) throw new Error("LIVE_EXECUTOR_NOT_CONFIGURED");
    executor = args.liveExecutor;
  } else {
    executor = new DeterministicPressRagExecutor();
  }
  return runAgentExperiment({ ...args, executor });
}
