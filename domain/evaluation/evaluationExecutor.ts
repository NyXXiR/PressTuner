import type {
  ExperimentConfiguration,
  ExperimentDataset,
  ExperimentEnvironment,
  ExperimentExecution,
} from "./experimentContracts";

export type EvaluationExecutionRequest = {
  role: "baseline" | "candidate";
  configuration: ExperimentConfiguration;
  dataset: ExperimentDataset;
  environment: ExperimentEnvironment;
};

export interface EvaluationExecutor {
  readonly id: string;
  execute(request: EvaluationExecutionRequest): Promise<ExperimentExecution>;
}
