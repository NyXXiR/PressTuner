import { createHash } from "node:crypto";

export const PRESS_AGENT_TOOLS = [
  { name: "search_knowledge", schemaVersion: "v2-role-scoped", effect: "READ", requiresApproval: false },
  { name: "compare_sources", schemaVersion: "v1", effect: "READ", requiresApproval: false },
  { name: "draft_press_release", schemaVersion: "v1", effect: "READ", requiresApproval: false },
  { name: "verify_claims", schemaVersion: "v2-exact-quote", effect: "READ", requiresApproval: false },
  { name: "apply_press_release", schemaVersion: "v1", effect: "WRITE", requiresApproval: true },
] as const;

export type PressAgentToolName = (typeof PRESS_AGENT_TOOLS)[number]["name"];
export type PressAgentRunStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "CANCEL_REQUESTED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED";

export type PressAgentRunState = {
  status: PressAgentRunStatus;
  retryCount: number;
};

export type PressAgentRunEvent =
  | { type: "START" }
  | { type: "APPROVAL_REQUIRED" }
  | { type: "APPROVED" }
  | { type: "REJECTED" }
  | { type: "COMPLETE" }
  | { type: "FAIL" }
  | { type: "RETRY" }
  | { type: "CANCEL_REQUEST" }
  | { type: "CANCEL" };

export function readPressAgentArticleVersion(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const value = (input as { articleUpdatedAt?: unknown }).articleUpdatedAt;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return value;
}

export function assertPressAgentArticleVersion(
  expectedUpdatedAt: string | null,
  currentUpdatedAt: Date,
): void {
  if (
    !expectedUpdatedAt ||
    Date.parse(expectedUpdatedAt) !== currentUpdatedAt.getTime()
  ) {
    throw new Error("PRESS_AGENT_ARTICLE_VERSION_CONFLICT");
  }
}

const NEXT_STATUS: Record<
  PressAgentRunStatus,
  Partial<Record<PressAgentRunEvent["type"], PressAgentRunStatus>>
> = {
  PENDING: { START: "RUNNING", CANCEL_REQUEST: "CANCEL_REQUESTED" },
  RUNNING: {
    APPROVAL_REQUIRED: "WAITING_APPROVAL",
    COMPLETE: "COMPLETED",
    FAIL: "FAILED",
    CANCEL_REQUEST: "CANCEL_REQUESTED",
  },
  WAITING_APPROVAL: {
    APPROVED: "RUNNING",
    REJECTED: "RUNNING",
    FAIL: "FAILED",
    CANCEL_REQUEST: "CANCEL_REQUESTED",
  },
  CANCEL_REQUESTED: { CANCEL: "CANCELED" },
  COMPLETED: {},
  FAILED: { RETRY: "RUNNING" },
  CANCELED: {},
};

export function transitionPressAgentRun(
  state: PressAgentRunState,
  event: PressAgentRunEvent,
): PressAgentRunState {
  const status = NEXT_STATUS[state.status][event.type];
  if (!status) {
    throw new Error(
      `PRESS_AGENT_ILLEGAL_TRANSITION:${state.status}->${event.type}`,
    );
  }
  return {
    status,
    retryCount: event.type === "RETRY" ? state.retryCount + 1 : state.retryCount,
  };
}

type PressAgentCheckpoint = {
  runId: string;
  teamId: string;
  agentVersion: string;
  sdkState: string;
};

export function restorePressAgentCheckpoint(
  serialized: string,
  expected: Omit<PressAgentCheckpoint, "sdkState">,
): PressAgentCheckpoint {
  let checkpoint: PressAgentCheckpoint;
  try {
    checkpoint = JSON.parse(serialized) as PressAgentCheckpoint;
  } catch {
    throw new Error("PRESS_AGENT_CHECKPOINT_INVALID");
  }
  if (
    checkpoint.runId !== expected.runId ||
    checkpoint.teamId !== expected.teamId ||
    checkpoint.agentVersion !== expected.agentVersion ||
    typeof checkpoint.sdkState !== "string"
  ) {
    throw new Error("PRESS_AGENT_CHECKPOINT_MISMATCH");
  }
  return checkpoint;
}

export function buildAgentStepIdempotencyKey(args: {
  runId: string;
  sequence: number;
  toolName: string;
}) {
  return createHash("sha256")
    .update(`${args.runId}:${args.sequence}:${args.toolName}`)
    .digest("hex");
}

export function buildAgentMutationIdempotencyKey(args: {
  runId: string;
  toolName: string;
  mutationIdentity: unknown;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        runId: args.runId,
        toolName: args.toolName,
        mutationIdentity: args.mutationIdentity,
      }),
    )
    .digest("hex");
}

export function assertFinalSourceIds(
  selectedSourceIds: readonly string[],
  retrievedFactSourceIds: readonly string[],
): string[] {
  const allowed = new Set(retrievedFactSourceIds);
  const selected = [...new Set(selectedSourceIds)];
  if (selected.some((sourceId) => !allowed.has(sourceId))) {
    throw new Error("PRESS_AGENT_FINAL_SOURCE_INVALID");
  }
  return selected;
}

export function hashVerifiedAgentDraft(args: {
  title: string;
  body: string;
  sourceIds: readonly string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: args.title,
        body: args.body,
        sourceIds: [...args.sourceIds],
      }),
    )
    .digest("hex");
}

export function assertAppliedDraftMatchesVerified(
  verifiedHash: string | null,
  draft: { title: string; body: string; sourceIds: readonly string[] },
): void {
  if (!verifiedHash || hashVerifiedAgentDraft(draft) !== verifiedHash) {
    throw new Error("PRESS_AGENT_VERIFIED_DRAFT_MISMATCH");
  }
}
