import { z } from "zod";

import { StartRagDebuggerRunRequestSchema } from "@/domain/evaluation/pressAgentRagDebugger";
import { executePressAgentRagDebuggerRun, validateSelectionAndConsumePressAgentRagDebuggerQuota } from "@/lib/services/press-agent/pressAgentRagDebuggerService";
import { ContinuePressCreationProcessSchema, StartPressCreationProcessSchema, continuePressCreationProcess, startPressCreationProcess } from "./pressCreationProcessService";

export const StartProcessDebugRunSchema = z.discriminatedUnion("processId", [
  StartPressCreationProcessSchema,
  StartRagDebuggerRunRequestSchema.extend({ processId: z.literal("rag-query") }).strict(),
]);
export { ContinuePressCreationProcessSchema as ContinueProcessDebugRunSchema };

export async function startProcessDebugRun(args: { teamId: string; userId: string; input: z.infer<typeof StartProcessDebugRunSchema>; onEvent: (event: unknown) => void | Promise<void> }) {
  if (args.input.processId === "press-creation") return startPressCreationProcess({ teamId: args.teamId, userId: args.userId, input: args.input, observer: args.onEvent });
  const input = { prompt: args.input.prompt, promptPresetId: args.input.promptPresetId, retrievalConfigurationId: args.input.retrievalConfigurationId, documentIds: args.input.documentIds, articleId: args.input.articleId };
  const selectedDocuments = await validateSelectionAndConsumePressAgentRagDebuggerQuota({ teamId: args.teamId, userId: args.userId, articleId: input.articleId, documentIds: input.documentIds });
  return executePressAgentRagDebuggerRun({ teamId: args.teamId, userId: args.userId, ...input, selectedDocuments, observer: args.onEvent as never });
}

export async function continueProcessDebugRun(args: { teamId: string; userId: string; runId: string; input: z.infer<typeof ContinuePressCreationProcessSchema>; onEvent?: (event: unknown) => void | Promise<void> }) {
  return continuePressCreationProcess({ ...args, observer: args.onEvent as never });
}
