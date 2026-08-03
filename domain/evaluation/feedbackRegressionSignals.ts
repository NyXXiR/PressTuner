import { canonicalJson } from "./configurationIdentity";
import type { AgentFailureCategory } from "./failureTaxonomy";

type Rating = "POSITIVE" | "NEGATIVE" | null;

export type FeedbackRegressionSignal = {
  sourceTeamId: string;
  targetTeamId: string;
  terminal: true;
  consent: true;
  eligibleForEvaluation: true;
  containsProhibitedData: false;
  sourceKind: "negative_feedback" | "citation_accuracy";
  sourceId: string;
  excerpt: string;
  failureCategory: AgentFailureCategory;
  logicalSourceRefs: string[];
};

export function feedbackRegressionSignals(args: {
  runId: string;
  teamId: string;
  userId: string;
  input: unknown;
  output: unknown;
  sourceIds: string[];
  usefulness: Rating;
  citationAccuracy: Rating;
}): FeedbackRegressionSignal[] {
  const logicalSourceRefs = [...new Set(args.sourceIds)].sort();
  const evidence = canonicalJson({ input: args.input, output: args.output });
  const common = {
    sourceTeamId: args.teamId,
    targetTeamId: args.teamId,
    terminal: true as const,
    consent: true as const,
    eligibleForEvaluation: true as const,
    containsProhibitedData: false as const,
    logicalSourceRefs,
  };
  const signals: FeedbackRegressionSignal[] = [];
  if (args.usefulness === "NEGATIVE") {
    signals.push({
      ...common,
      sourceKind: "negative_feedback",
      sourceId: `${args.runId}:${args.userId}:usefulness`,
      excerpt: `dimension=usefulness\n${evidence}`,
      failureCategory: "UNKNOWN",
    });
  }
  if (args.citationAccuracy === "NEGATIVE") {
    signals.push({
      ...common,
      sourceKind: "citation_accuracy",
      sourceId: `${args.runId}:${args.userId}:citation-accuracy`,
      excerpt: `dimension=citation_accuracy\n${evidence}`,
      failureCategory: "UNSUPPORTED_CITATION",
    });
  }
  return signals;
}
