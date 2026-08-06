import { prisma } from "@/lib/prisma";
import { verifyAndIncrementQuota } from "@/lib/services/usageService";
import { startPressAgentRun } from "./pressAgentRuntime";
import {
  listPressAgentRagDebuggerRuns,
  replayPressAgentWorkflowEvents,
  type PressAgentWorkflowStreamObserver,
} from "./pressAgentWorkflowEventService";

export async function consumePressAgentRagDebuggerQuota(args: { teamId: string; userId: string; articleId?: string | null }) {
  await prisma.$transaction((tx) => verifyAndIncrementQuota(tx, {
    teamId: args.teamId,
    userId: args.userId,
    targetId: args.articleId ?? null,
    type: "ARTICLE",
    action: "press_panel_chat",
  }));
}

export async function executePressAgentRagDebuggerRun(args: {
  teamId: string;
  userId: string;
  prompt: string;
  articleId?: string | null;
  observer: PressAgentWorkflowStreamObserver;
}) {
  return startPressAgentRun({
    teamId: args.teamId,
    userId: args.userId,
    prompt: args.prompt,
    articleId: args.articleId,
    launchSurface: "RAG_DEBUGGER_V1",
    workflowObserver: args.observer,
  });
}

export { listPressAgentRagDebuggerRuns, replayPressAgentWorkflowEvents };
