import type { AgentFeedbackRating } from "@prisma/client";

import { feedbackRegressionSignals } from "@/domain/evaluation/feedbackRegressionSignals";
import { prisma } from "@/lib/prisma";
import { ingestRegressionCandidateWithClient } from "@/lib/services/press-agent/regressionCandidateService";

export type AgentRunFeedbackPatch = {
  usefulness?: AgentFeedbackRating | null;
  citationAccuracy?: AgentFeedbackRating | null;
};

export async function patchAgentRunFeedback(args: {
  runId: string;
  teamId: string;
  userId: string;
  patch: AgentRunFeedbackPatch;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${args.runId}:${args.userId}`}, 0))`;
    const run = await tx.agentRun.findFirst({
      where: { id: args.runId, teamId: args.teamId },
      select: {
        id: true,
        status: true,
        input: true,
        output: true,
        citations: { select: { sourceId: true } },
        _count: { select: { citations: true } },
      },
    });
    if (!run) throw new Error("PRESS_AGENT_RUN_NOT_FOUND");
    if (run.status !== "COMPLETED") {
      throw new Error("PRESS_AGENT_FEEDBACK_NOT_AVAILABLE");
    }
    if (
      "citationAccuracy" in args.patch &&
      args.patch.citationAccuracy !== null &&
      args.patch.citationAccuracy !== undefined &&
      run._count.citations === 0
    ) {
      throw new Error("PRESS_AGENT_CITATION_FEEDBACK_NOT_AVAILABLE");
    }
    const current = await tx.agentRunFeedback.findUnique({
      where: { runId_userId: { runId: run.id, userId: args.userId } },
    });
    const usefulness =
      "usefulness" in args.patch
        ? (args.patch.usefulness ?? null)
        : (current?.usefulness ?? null);
    const citationAccuracy =
      "citationAccuracy" in args.patch
        ? (args.patch.citationAccuracy ?? null)
        : (current?.citationAccuracy ?? null);
    if (!usefulness && !citationAccuracy) {
      if (current) {
        await tx.agentRunFeedback.delete({ where: { id: current.id } });
      }
      return null;
    }
    const feedback = await tx.agentRunFeedback.upsert({
      where: { runId_userId: { runId: run.id, userId: args.userId } },
      create: {
        runId: run.id,
        teamId: args.teamId,
        userId: args.userId,
        usefulness,
        citationAccuracy,
      },
      update: { usefulness, citationAccuracy },
    });
    for (const signal of feedbackRegressionSignals({
      runId: run.id,
      teamId: args.teamId,
      userId: args.userId,
      input: run.input,
      output: run.output,
      sourceIds: run.citations.map(({ sourceId }) => sourceId),
      usefulness,
      citationAccuracy,
    })) {
      await ingestRegressionCandidateWithClient(tx, signal);
    }
    return feedback;
  });
}
