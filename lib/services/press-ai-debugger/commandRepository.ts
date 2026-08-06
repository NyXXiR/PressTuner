import { createHash } from "node:crypto";
import { Prisma, type PressAiDebugCommand } from "@prisma/client";
import { boundProcessDetail } from "@/domain/press-ai-debugger/processDetails";

export class PressAiDebugConflictError extends Error { readonly status = 409; constructor(readonly code: string) { super(code); } }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`; return JSON.stringify(value); }
export function hashPressAiDebugCommand(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }

export async function replayOrRunCommand<T>(args: { tx: Prisma.TransactionClient; teamId: string; attemptId: string; commandId: string; kind: string; expectedRevision: number; request: unknown; mutate: (attempt: { id: string; revision: number }) => Promise<T> }): Promise<{ replayed: boolean; response: T }> {
  const hash = hashPressAiDebugCommand(args.request);
  await args.tx.$queryRaw`SELECT id FROM press_ai_debug_attempt WHERE id = ${args.attemptId} AND team_id = ${args.teamId} FOR UPDATE`;
  const existing = await args.tx.pressAiDebugCommand.findUnique({ where: { attemptId_commandId: { attemptId: args.attemptId, commandId: args.commandId } } });
  if (existing) { if (existing.requestHash !== hash || existing.kind !== args.kind || existing.expectedRevision !== args.expectedRevision) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_REUSE_CONFLICT"); return { replayed: true, response: existing.response as T }; }
  const attempt = await args.tx.pressAiDebugAttempt.findFirst({ where: { id: args.attemptId, teamId: args.teamId }, select: { id: true, revision: true } });
  if (!attempt) throw Object.assign(new Error("PRESS_AI_DEBUG_ATTEMPT_NOT_FOUND"), { status: 404 });
  if (attempt.revision !== args.expectedRevision) throw new PressAiDebugConflictError("PRESS_AI_DEBUG_COMMAND_STALE");
  const response = await args.mutate(attempt);
  await args.tx.pressAiDebugCommand.create({ data: { attemptId: args.attemptId, commandId: args.commandId, kind: args.kind, expectedRevision: args.expectedRevision, requestHash: hash, response: boundProcessDetail(response) as Prisma.InputJsonValue } });
  return { replayed: false, response };
}

export function commandPublicReceipt(command: PressAiDebugCommand) { return boundProcessDetail(command.response); }
