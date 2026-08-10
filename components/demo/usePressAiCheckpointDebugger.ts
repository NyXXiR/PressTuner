"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { CustomExpectation } from "@/domain/press-ai-debugger/caseExpectations";
import type { PressAiCaseActionPhase } from "./PressAiCasePanel";

import {
  readAttemptIdFromSearch,
  withAttemptParam,
} from "@/lib/pressAiDebuggerAttemptUrl";
import {
  advancePressAiCheckpointEdge,
  createPressAiCheckpointAttempt,
  executePressAiCheckpointNode,
  fetchPressAiDebugCase,
  fetchPressAiCheckpointAttempt,
  retryPressAiCheckpointAttempt,
  savePressAiDebugCase,
  type PressAiCheckpointAttempt,
  type PressAiDebugCase,
} from "@/lib/pressAiProcessDebuggerClient";

const errorCode = (reason: unknown, fallback: string) =>
  reason instanceof Error ? reason.message : fallback;

export function usePressAiCheckpointDebugger() {
  const [attempt, setAttempt] = useState<PressAiCheckpointAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachedCase, setAttachedCase] = useState<PressAiDebugCase | null>(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseError, setCaseError] = useState<string | null>(null);
  const [caseSaved, setCaseSaved] = useState(false);
  const [caseActionStatus, setCaseActionStatus] = useState<PressAiCaseActionPhase>("IDLE");
  const commands = useRef(new Map<string, string>());
  const loadToken = useRef(0);
  const selectedAttemptId = useRef<string | null>(null);
  const caseLoadToken = useRef(0);
  const pendingBranch = useRef<null | {
    parentAttemptId: string;
    checkpointId: string;
    name: string;
    expectations: CustomExpectation[];
    retryNodeId: string;
    savedRevision: number;
    caseId: string;
  }>(null);

  const loadCase = useCallback(async (caseId: string) => {
    const token = ++caseLoadToken.current; setCaseLoading(true); setCaseError(null);
    try { const loaded = await fetchPressAiDebugCase(caseId); if (token === caseLoadToken.current) setAttachedCase(loaded); }
    catch (reason) { if (token === caseLoadToken.current) { setAttachedCase(null); setCaseError(errorCode(reason, "PRESS_AI_DEBUG_CASE_LOAD_FAILED")); } }
    finally { if (token === caseLoadToken.current) setCaseLoading(false); }
  }, []);

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
      if (selectedAttemptId.current !== nextAttempt.id) { commands.current.clear(); setCaseSaved(false); }
      selectedAttemptId.current = nextAttempt.id;
      setAttempt(nextAttempt);
      if (nextAttempt.caseId) void loadCase(nextAttempt.caseId);
      else { caseLoadToken.current += 1; setAttachedCase(null); setCaseLoading(false); setCaseError(null); }
      replaceAttemptUrl(nextAttempt.id);
    },
    [loadCase, replaceAttemptUrl],
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
    caseLoadToken.current += 1;
    setAttachedCase(null);
    setCaseLoading(false);
    setCaseError(null);
    setCaseSaved(false);
    setCaseActionStatus("IDLE");
    pendingBranch.current = null;
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
    expectations: CustomExpectation[],
  ) => {
    if (!attempt) return;
    setCaseSaved(false);
    setCaseActionStatus("SAVING");
    void (async () => {
      const receipt = await act(`case:${checkpointId}:${attempt.revision}`, (commandId) => savePressAiDebugCase({
        attemptId: attempt.id,
        checkpointId,
        name,
        expectations,
        commandId,
        expectedRevision: attempt.revision,
      }));
      if (receipt) { setCaseSaved(true); setCaseActionStatus("SAVED"); await loadCase(receipt.response.caseId); }
      else setCaseActionStatus("IDLE");
    })();
  };

  const saveCaseAndBranch = (
    checkpointId: string,
    name: string,
    expectations: CustomExpectation[],
    retryNodeId: string,
  ) => {
    if (!attempt) return;
    const parent = attempt;
    const recoverable = pendingBranch.current;
    const canRetryBranchOnly = caseActionStatus === "PARTIAL_FAILURE"
      && recoverable?.parentAttemptId === parent.id
      && recoverable.checkpointId === checkpointId
      && recoverable.name === name
      && recoverable.retryNodeId === retryNodeId
      && JSON.stringify(recoverable.expectations) === JSON.stringify(expectations);
    const token = loadToken.current;
    setBusy(true);
    setError(null);
    setCaseError(null);
    setCaseSaved(false);
    void (async () => {
      let saved = canRetryBranchOnly ? recoverable : null;
      try {
        if (!saved) {
          setCaseActionStatus("SAVING");
          const saveKey = `case-branch-save:${checkpointId}:${parent.revision}`;
          const receipt = await savePressAiDebugCase({
            attemptId: parent.id,
            checkpointId,
            name,
            expectations,
            commandId: command(saveKey),
            expectedRevision: parent.revision,
          });
          commands.current.delete(saveKey);
          saved = {
            parentAttemptId: parent.id,
            checkpointId,
            name,
            expectations: [...expectations],
            retryNodeId,
            savedRevision: receipt.response.revision,
            caseId: receipt.response.caseId,
          };
          pendingBranch.current = saved;
          setCaseSaved(true);
          setCaseActionStatus("SAVED");
          await loadCase(saved.caseId);
        }

        setCaseActionStatus("BRANCHING");
        const retryKey = `case-branch-retry:${retryNodeId}:${saved.savedRevision}`;
        const child = await retryPressAiCheckpointAttempt(parent.id, {
          commandId: command(retryKey),
          expectedRevision: saved.savedRevision,
          retryNodeId,
        });
        if (token !== loadToken.current) return;
        const childAttempt = await fetchPressAiCheckpointAttempt(child.attemptId);
        if (token !== loadToken.current) return;
        commands.current.delete(retryKey);
        pendingBranch.current = null;
        selectAttempt(childAttempt);
        setCaseSaved(true);
        setCaseActionStatus("BRANCHED");
      } catch (reason) {
        if (token !== loadToken.current) return;
        const message = errorCode(reason, "PRESS_AI_DEBUG_SAVE_AND_BRANCH_FAILED");
        setError(message);
        if (saved) {
          setCaseSaved(true);
          setCaseActionStatus("PARTIAL_FAILURE");
          setCaseError("규칙 저장은 완료되었지만 분기 또는 자식 시도 열기에 실패했습니다. 분기만 다시 시도하세요.");
          try {
            const reloaded = await fetchPressAiCheckpointAttempt(parent.id);
            if (token === loadToken.current) selectAttempt(reloaded, false);
          } catch {
            // The saved receipt remains authoritative even if refreshing the parent fails.
          }
        } else {
          setCaseActionStatus("IDLE");
        }
      } finally {
        setBusy(false);
      }
    })();
  };

  return {
    attempt,
    busy,
    loading,
    error,
    attachedCase,
    caseLoading,
    caseError,
    caseSaved,
    caseActionStatus,
    clear,
    create,
    open,
    execute,
    advance,
    retry,
    saveCase,
    saveCaseAndBranch,
  };
}
