import { prisma } from "@/lib/prisma";
import { verifyAndIncrementQuota } from "@/lib/services/usageService";
import type { PressAgentRagDebuggerDocumentSnapshot, PressAgentRagDebuggerPromptPresetId, PressAgentRagDebuggerRetrievalConfigurationId } from "@/domain/evaluation/pressAgentRagDebugger";
import { startPressAgentRun } from "./pressAgentRuntime";
import {
  listPressAgentRagDebuggerRuns,
  replayPressAgentWorkflowEvents,
  type PressAgentWorkflowStreamObserver,
} from "./pressAgentWorkflowEventService";

export class PressAgentRagDebuggerSelectionError extends Error {
  code = "PRESS_AGENT_DEBUG_DOCUMENT_SELECTION_INVALID";
  status = 422;
  constructor() { super("PRESS_AGENT_DEBUG_DOCUMENT_SELECTION_INVALID"); }
}

export async function validateSelectionAndConsumePressAgentRagDebuggerQuota(args: { teamId: string; userId: string; articleId?: string | null; documentIds: string[] }): Promise<PressAgentRagDebuggerDocumentSnapshot[]> {
  return prisma.$transaction(async (tx) => {
    const documents = await tx.knowledgeDocument.findMany({
      where: {
        id: { in: args.documentIds }, teamId: args.teamId, deletedAt: null,
        status: "READY", replacementDocument: null, activeGenerationId: { not: null }, chunkCount: { gt: 0 },
        activeGeneration: { is: { indexStatus: "READY", chunks: { some: {} } } },
      },
      select: { id: true, originalName: true, pageCount: true, chunkCount: true },
    });
    if (documents.length !== args.documentIds.length) throw new PressAgentRagDebuggerSelectionError();
    const byId = new Map(documents.map((document) => [document.id, document]));
    const snapshots = args.documentIds.map((id) => {
      const document = byId.get(id);
      if (!document) throw new PressAgentRagDebuggerSelectionError();
      return { id: document.id, name: document.originalName, readiness: "READY" as const, pageCount: document.pageCount, chunkCount: document.chunkCount };
    });
    await verifyAndIncrementQuota(tx, { teamId: args.teamId, userId: args.userId, targetId: args.articleId ?? null, type: "ARTICLE", action: "press_panel_chat" });
    return snapshots;
  });
}

export async function executePressAgentRagDebuggerRun(args: {
  teamId: string;
  userId: string;
  prompt: string;
  promptPresetId: PressAgentRagDebuggerPromptPresetId | null;
  retrievalConfigurationId: PressAgentRagDebuggerRetrievalConfigurationId;
  selectedDocuments: PressAgentRagDebuggerDocumentSnapshot[];
  articleId?: string | null;
  observer: PressAgentWorkflowStreamObserver;
}) {
  return startPressAgentRun({
    teamId: args.teamId,
    userId: args.userId,
    prompt: args.prompt,
    articleId: args.articleId,
    promptPresetId: args.promptPresetId,
    retrievalConfigurationId: args.retrievalConfigurationId,
    selectedDocumentIds: args.selectedDocuments.map((document) => document.id),
    selectedDocuments: args.selectedDocuments,
    launchSurface: "RAG_DEBUGGER_V1",
    workflowObserver: args.observer,
  });
}

export { listPressAgentRagDebuggerRuns, replayPressAgentWorkflowEvents };
