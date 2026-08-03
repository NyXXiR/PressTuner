import {
  createAgentExperimentArtifact,
  parseExperimentConfiguration,
  parseExperimentDataset,
  parseExperimentEnvironment,
} from "./experimentContracts";
import type { EvaluationExecutor } from "./evaluationExecutor";

export async function runAgentExperiment(args: {
  executor: EvaluationExecutor;
  baseline: unknown;
  candidate: unknown;
  dataset: unknown;
  environment: unknown;
}) {
  const baseline = parseExperimentConfiguration(args.baseline);
  const candidate = parseExperimentConfiguration(args.candidate);
  const dataset = parseExperimentDataset(args.dataset);
  const environment = parseExperimentEnvironment(args.environment);
  if (environment.executorId !== args.executor.id) {
    throw new Error("AGENT_EXPERIMENT_EXECUTOR_ENVIRONMENT_MISMATCH");
  }
  const baselineExecution = await args.executor.execute({
    role: "baseline",
    configuration: baseline,
    dataset,
    environment,
  });
  const candidateExecution = await args.executor.execute({
    role: "candidate",
    configuration: candidate,
    dataset,
    environment,
  });
  return createAgentExperimentArtifact({
    version: "agent-experiment/v2",
    datasetId: dataset.id,
    datasetHash: dataset.contentHash,
    environmentId: environment.id,
    environmentHash: environment.contentHash,
    configurations: { baseline, candidate },
    executions: {
      baseline: baselineExecution,
      candidate: candidateExecution,
    },
    createdAt: environment.frozenAt,
  });
}
