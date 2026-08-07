import { consumeAiQuota } from "@/domain/quota/aiQuota";

type PanelScope =
  | "press:guide"
  | "press:plan"
  | "resume:guide"
  | "resume:plan"
  | "resume:command"
  | "resume:ingest-bricks";

export async function assertAndLogAiPanelUsage(params: {
  teamId: string;
  userId: string;
  scope: PanelScope;
  meta?: Record<string, unknown>;
}) {
  await consumeAiQuota({
    teamId: params.teamId,
    userId: params.userId,
    action: params.scope.startsWith("press:") ? "press_panel_chat" : "resume_chat",
    meta: {
      scope: params.scope,
      ...(params.meta ?? {}),
    },
  });
}
