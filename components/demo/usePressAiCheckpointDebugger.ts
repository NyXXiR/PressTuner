"use client";
import { useCallback, useRef, useState } from "react";
import {
  advancePressAiCheckpointEdge,
  createPressAiCheckpointAttempt,
  executePressAiCheckpointNode,
  fetchPressAiCheckpointAttempt,
  retryPressAiCheckpointAttempt,
  savePressAiDebugCase,
  type PressAiCheckpointAttempt,
} from "@/lib/pressAiProcessDebuggerClient";

export function usePressAiCheckpointDebugger() {
  const [attempt, setAttempt] = useState<PressAiCheckpointAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commands = useRef(new Map<string, string>());
  const command = (key: string) => {
    const prior = commands.current.get(key);
    if (prior) return prior;
    const id = crypto.randomUUID();
    commands.current.set(key, id);
    return id;
  };
  const act = useCallback(
    async <T>(
      key: string,
      task: (commandId: string) => Promise<T>,
      reload = true,
    ) => {
      setBusy(true);
      setError(null);
      try {
        const value = await task(command(key));
        commands.current.delete(key);
        if (reload && attempt)
          setAttempt(await fetchPressAiCheckpointAttempt(attempt.id));
        return value;
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "PRESS_AI_DEBUG_FAILED",
        );
        throw reason;
      } finally {
        setBusy(false);
      }
    },
    [attempt],
  );
  return {
    attempt,
    busy,
    error,
    create: async (input: {
      rawText: string;
      tone: string;
      reviewInstruction?: string;
      rewriteInstruction?: string;
    }) => {
      setBusy(true);
      setError(null);
      const key = "create";
      try {
        const value = await createPressAiCheckpointAttempt({
          ...input,
          commandId: command(key),
          expectedRevision: 0,
        });
        commands.current.delete(key);
        setAttempt(value.attempt);
        return value.attempt;
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "PRESS_AI_DEBUG_CREATE_FAILED",
        );
        throw reason;
      } finally {
        setBusy(false);
      }
    },
    open: async (id: string) =>
      setAttempt(await fetchPressAiCheckpointAttempt(id)),
    execute: (nodeId: string, input: Record<string, unknown> = {}) =>
      attempt &&
      act(`execute:${nodeId}:${attempt.revision}`, (commandId) =>
        executePressAiCheckpointNode(attempt.id, nodeId, {
          ...input,
          commandId,
          expectedRevision: attempt.revision,
        }),
      ),
    advance: (
      edgeId: string,
      acknowledgeWarn: boolean,
      acknowledgeHumanGate: boolean,
    ) =>
      attempt &&
      act(`advance:${edgeId}:${attempt.revision}`, (commandId) =>
        advancePressAiCheckpointEdge(attempt.id, edgeId, {
          commandId,
          expectedRevision: attempt.revision,
          acknowledgeWarn,
          acknowledgeHumanGate,
        }),
      ),
    retry: async (retryNodeId?: string) => {
      if (!attempt) return;
      const result = (await act(
        `retry:${retryNodeId ?? "default"}:${attempt.revision}`,
        (commandId) =>
          retryPressAiCheckpointAttempt(attempt.id, {
            commandId,
            expectedRevision: attempt.revision,
            ...(retryNodeId ? { retryNodeId } : {}),
          }),
        false,
      )) as { attemptId: string };
      setAttempt(await fetchPressAiCheckpointAttempt(result.attemptId));
    },
    saveCase: (
      checkpointId: string,
      name: string,
      expectations: Array<{
        id: string;
        field: "contains" | "notContains";
        value: string;
        verdict: "WARN" | "BLOCK";
      }>,
    ) =>
      attempt &&
      act(`case:${checkpointId}:${attempt.revision}`, (commandId) =>
        savePressAiDebugCase({
          attemptId: attempt.id,
          checkpointId,
          name,
          expectations,
          commandId,
          expectedRevision: attempt.revision,
        }),
      ),
  };
}
