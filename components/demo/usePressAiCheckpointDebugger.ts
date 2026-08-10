"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import {
  readAttemptIdFromSearch,
  withAttemptParam,
} from "@/lib/pressAiDebuggerAttemptUrl";
import {
  advancePressAiCheckpointEdge,
  createPressAiCheckpointAttempt,
  executePressAiCheckpointNode,
  fetchPressAiCheckpointAttempt,
  retryPressAiCheckpointAttempt,
  savePressAiDebugCase,
  type PressAiCheckpointAttempt,
} from "@/lib/pressAiProcessDebuggerClient";

const errorCode = (reason: unknown, fallback: string) =>
  reason instanceof Error ? reason.message : fallback;

export function usePressAiCheckpointDebugger() {
  const [attempt, setAttempt] = useState<PressAiCheckpointAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commands = useRef(new Map<string, string>());
  const loadToken = useRef(0);
  const selectedAttemptId = useRef<string | null>(null);

  const replaceAttemptUrl = useCallback((attemptId: string | null) => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${withAttemptParam(window.location.search, attemptId)}${window.location.hash}`,
    );
  }, []);

  const selectAttempt = useCallback(
    (nextAttempt: PressAiCheckpointAttempt, invalidatePendingLoads = true) => {
      if (invalidatePendingLoads) loadToken.current += 1;
      if (selectedAttemptId.current !== nextAttempt.id) commands.current.clear();
      selectedAttemptId.current = nextAttempt.id;
      setAttempt(nextAttempt);
      replaceAttemptUrl(nextAttempt.id);
    },
    [replaceAttemptUrl],
  );

  const loadAttempt = useCallback(
    async (attemptId: string, clearUrlOnError = false) => {
      const token = ++loadToken.current;
      setLoading(true);
      setError(null);
      try {
        const loaded = await fetchPressAiCheckpointAttempt(attemptId);
        if (token !== loadToken.current) return;
        selectAttempt(loaded, false);
      } catch (reason) {
        if (token !== loadToken.current) return;
        setError(errorCode(reason, "PRESS_AI_DEBUG_ATTEMPT_LOAD_FAILED"));
        if (clearUrlOnError) replaceAttemptUrl(null);
      } finally {
        if (token === loadToken.current) setLoading(false);
      }
    },
    [replaceAttemptUrl, selectAttempt],
  );

  // Layout effect prevents the blank creation form flashing before URL restore.
  useLayoutEffect(() => {
    const attemptId = readAttemptIdFromSearch(window.location.search);
    if (attemptId) void loadAttempt(attemptId, true);
    return () => {
      loadToken.current += 1;
    };
  }, [loadAttempt]);

  const clear = useCallback(() => {
    loadToken.current += 1;
    commands.current.clear();
    selectedAttemptId.current = null;
    setAttempt(null);
    setLoading(false);
    setError(null);
    replaceAttemptUrl(null);
  }, [replaceAttemptUrl]);

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
    ): Promise<T | undefined> => {
      const token = loadToken.current;
      setBusy(true);
      setError(null);
      try {
        const value = await task(command(key));
        commands.current.delete(key);
        if (reload && attempt) {
          const loaded = await fetchPressAiCheckpointAttempt(attempt.id);
          if (token === loadToken.current) selectAttempt(loaded, false);
        }
        return value;
      } catch (reason) {
        if (token === loadToken.current) {
          setError(errorCode(reason, "PRESS_AI_DEBUG_FAILED"));
        }
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [attempt, selectAttempt],
  );

  const create = async (input: {
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
      selectAttempt(value.attempt);
      return value.attempt;
    } catch (reason) {
      setError(errorCode(reason, "PRESS_AI_DEBUG_CREATE_FAILED"));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const open = useCallback(
    (attemptId: string) => {
      void loadAttempt(attemptId);
    },
    [loadAttempt],
  );

  const execute = (nodeId: string, input: Record<string, unknown> = {}) => {
    if (!attempt) return;
    void act(`execute:${nodeId}:${attempt.revision}`, (commandId) =>
      executePressAiCheckpointNode(attempt.id, nodeId, {
        ...input,
        commandId,
        expectedRevision: attempt.revision,
      }),
    );
  };

  const advance = (
    edgeId: string,
    acknowledgeWarn: boolean,
    acknowledgeHumanGate: boolean,
  ) => {
    if (!attempt) return;
    void act(`advance:${edgeId}:${attempt.revision}`, (commandId) =>
      advancePressAiCheckpointEdge(attempt.id, edgeId, {
        commandId,
        expectedRevision: attempt.revision,
        acknowledgeWarn,
        acknowledgeHumanGate,
      }),
    );
  };

  const retry = (retryNodeId: string) => {
    if (!attempt) return;
    const token = loadToken.current;
    void (async () => {
      const result = await act(
        `retry:${retryNodeId}:${attempt.revision}`,
        (commandId) =>
          retryPressAiCheckpointAttempt(attempt.id, {
            commandId,
            expectedRevision: attempt.revision,
            retryNodeId,
          }),
        false,
      );
      if (!result || token !== loadToken.current) return;
      await loadAttempt(result.attemptId);
    })();
  };

  const saveCase = (
    checkpointId: string,
    name: string,
    expectations: Array<{
      id: string;
      field: "contains" | "notContains";
      value: string;
      verdict: "WARN" | "BLOCK";
    }>,
  ) => {
    if (!attempt) return;
    void act(`case:${checkpointId}:${attempt.revision}`, (commandId) =>
      savePressAiDebugCase({
        attemptId: attempt.id,
        checkpointId,
        name,
        expectations,
        commandId,
        expectedRevision: attempt.revision,
      }),
    );
  };

  return {
    attempt,
    busy,
    loading,
    error,
    clear,
    create,
    open,
    execute,
    advance,
    retry,
    saveCase,
  };
}
