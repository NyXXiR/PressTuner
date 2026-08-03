import { CareerExperienceStatus } from "@prisma/client";

import type { CareerTransactionClient } from "./careerFactService";
import { enqueueCareerExperience } from "./careerSchedulerClient";

export type CareerIndexTarget = {
  experienceId: string;
  userId: string;
  embeddingRevision: number;
};

export async function invalidateCareerExperienceInTransaction(input: {
  tx: CareerTransactionClient;
  experienceId: string;
  userId: string;
}): Promise<CareerIndexTarget | null> {
  const invalidated = await input.tx.experienceBrick.updateMany({
    where: {
      id: input.experienceId,
      userId: input.userId,
      memoryStatus: CareerExperienceStatus.CONFIRMED,
    },
    data: {
      embeddingRevision: { increment: 1 },
      embeddedRevision: null,
      embeddingContentHash: null,
      embeddingModel: null,
      embeddedAt: null,
    },
  });
  if (invalidated.count !== 1) return null;
  const experience = await input.tx.experienceBrick.findFirstOrThrow({
    where: { id: input.experienceId, userId: input.userId },
    select: { id: true, embeddingRevision: true },
  });
  return {
    experienceId: experience.id,
    userId: input.userId,
    embeddingRevision: experience.embeddingRevision,
  };
}

export async function requestCareerExperienceIndex(
  target: CareerIndexTarget | null,
  dependencies: {
    enqueue?: typeof enqueueCareerExperience;
    warn?: (message: string, context: Record<string, unknown>) => void;
  } = {},
) {
  if (!target) return false;
  try {
    await (dependencies.enqueue ?? enqueueCareerExperience)(target);
    return true;
  } catch (error) {
    (dependencies.warn ?? ((message, context) => console.warn(message, context)))(
      "[career-index] enqueue failed; stale revision remains durable",
      {
        experienceId: target.experienceId,
        embeddingRevision: target.embeddingRevision,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      },
    );
    return false;
  }
}
