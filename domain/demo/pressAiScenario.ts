import {
  PUBLIC_PRESS_RAG_GUIDED_MEMO,
  publicPressRagScenarioProcess,
  type PublicPressRagAttempt,
} from "./pressRagScenarioContract";

export const PRESS_AI_SCENARIO_NODES = publicPressRagScenarioProcess.nodes;

export function latestScenarioReviewNotes(attempt: PublicPressRagAttempt) {
  const checkpoint = [...attempt.checkpoints]
    .filter((item) => item.nodeId === "draft-review")
    .sort((left, right) => right.sequence - left.sequence)[0];
  const output = checkpoint?.output as { notes?: Array<{ id: string; message: string }> } | undefined;
  return output?.notes ?? [];
}

export function repairedScenarioMemo(memo = PUBLIC_PRESS_RAG_GUIDED_MEMO) {
  return memo
    .replace(/(2026\s*년\s*매출(?:액)?\s*)360(?=\s*억\s*원)/gu, "$1200")
    .trim();
}
