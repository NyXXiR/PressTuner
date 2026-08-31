"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ResumeDocumentImportCommand } from "@/domain/resume-documents/importCandidate";
import {
  RESUME_DOCUMENT_STORAGE_KEY,
  createResumeDocumentSeed,
  parseResumeDocumentState,
  type ResumeDocumentState,
} from "@/domain/resume-documents/model";
import {
  RESUME_DOCUMENT_SYNC_STORAGE_KEY,
  parseResumeDocumentSyncMetadata,
  protectResumeDocumentHydration,
  resolveResumeDocumentCandidateApplication,
  resolveResumeDocumentLoad,
  resumeDocumentFingerprint,
  sameResumeDocumentState,
  type ResumeDocumentRecord,
} from "@/domain/resume-documents/persistence";

const AUTOSAVE_DELAY_MS = 800;

export type ResumeDocumentStorageStatus = "loading" | "saving" | "saved" | "offline" | "conflict" | "error";
export type ResumeDocumentLocalBackupStatus = "available" | "error";

function parseDocumentRecord(value: unknown): ResumeDocumentRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { state?: unknown; revision?: unknown; updatedAt?: unknown };
  const parsedState = parseResumeDocumentState(JSON.stringify(candidate.state));
  if (!parsedState || !Number.isInteger(candidate.revision) || (candidate.revision as number) < 1 || typeof candidate.updatedAt !== "string") {
    throw new Error("RESUME_DOCUMENT_RESPONSE_INVALID");
  }
  return { state: parsedState, revision: candidate.revision as number, updatedAt: candidate.updatedAt };
}

async function responseDocument(response: Response) {
  const body = await response.json() as { document?: unknown };
  if (!response.ok) throw new Error(`RESUME_DOCUMENT_REQUEST_FAILED:${response.status}`);
  if (!("document" in body)) throw new Error("RESUME_DOCUMENT_RESPONSE_INVALID");
  return body.document === null ? null : parseDocumentRecord(body.document);
}

async function responseCandidateDocument(response: Response) {
  const body = await response.json() as { document?: unknown; command?: unknown };
  if (!response.ok || !body.document || typeof body.document !== "object") {
    throw new Error(`RESUME_DOCUMENT_REQUEST_FAILED:${response.status}`);
  }
  const document = parseDocumentRecord(body.document);
  if (!document || !body.command || typeof body.command !== "object") {
    throw new Error("RESUME_DOCUMENT_RESPONSE_INVALID");
  }
  return { ...document, command: body.command as ResumeDocumentImportCommand };
}

export function useResumeDocumentPersistence() {
  const [state, setState] = useState<ResumeDocumentState>(() => createResumeDocumentSeed());
  const [hydrated, setHydrated] = useState(false);
  const [storageStatus, setStorageStatus] = useState<ResumeDocumentStorageStatus>("loading");
  const [localBackupStatus, setLocalBackupStatus] = useState<ResumeDocumentLocalBackupStatus>("available");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const stateRef = useRef(state);
  const serverRevisionRef = useRef(0);
  const lastSavedStateRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const saveBlockedRef = useRef(false);
  const candidateApplyInFlightRef = useRef(false);

  const acceptServerDocument = useCallback((document: ResumeDocumentRecord) => {
    const serialized = JSON.stringify(document.state);
    serverRevisionRef.current = document.revision;
    lastSavedStateRef.current = serialized;
    saveBlockedRef.current = false;
    stateRef.current = document.state;
    try {
      localStorage.setItem(RESUME_DOCUMENT_STORAGE_KEY, serialized);
      localStorage.setItem(RESUME_DOCUMENT_SYNC_STORAGE_KEY, JSON.stringify({
        revision: document.revision,
        fingerprint: resumeDocumentFingerprint(serialized),
      }));
      setLocalBackupStatus("available");
    } catch {
      setLocalBackupStatus("error");
    }
    setState(document.state);
    setLastSavedAt(Date.parse(document.updatedAt));
    setStorageStatus("saved");
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const persistLatestState = useCallback(async () => {
    if (!hydrated || saveBlockedRef.current || candidateApplyInFlightRef.current) return;
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }
    saveInFlightRef.current = true;
    try {
      do {
        saveQueuedRef.current = false;
        const stateToSave = stateRef.current;
        const serialized = JSON.stringify(stateToSave);
        if (serialized === lastSavedStateRef.current) {
          setStorageStatus("saved");
          continue;
        }
        setStorageStatus("saving");
        let response: Response;
        try {
          response = await fetch("/api/resume/documents", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: stateToSave, expectedRevision: serverRevisionRef.current }),
          });
        } catch {
          setStorageStatus("offline");
          return;
        }
        if (response.status === 409) {
          try {
            const conflict = await response.json() as { details?: { currentRevision?: unknown } };
            if (Number.isInteger(conflict.details?.currentRevision)) {
              serverRevisionRef.current = conflict.details!.currentRevision as number;
            }
          } catch {
            // The local copy still remains protected even if conflict details are unavailable.
          }
          saveBlockedRef.current = true;
          setStorageStatus("conflict");
          return;
        }
        let saved: ResumeDocumentRecord | null;
        try {
          saved = await responseDocument(response);
        } catch {
          setStorageStatus(response.status >= 500 ? "offline" : "error");
          return;
        }
        if (!saved) {
          setStorageStatus("error");
          return;
        }
        serverRevisionRef.current = saved.revision;
        // The successful response acknowledges the exact state sent by the client.
        // Comparing against a normalized response can otherwise cause an endless resave loop.
        lastSavedStateRef.current = serialized;
        try {
          localStorage.setItem(RESUME_DOCUMENT_SYNC_STORAGE_KEY, JSON.stringify({
            revision: saved.revision,
            fingerprint: resumeDocumentFingerprint(serialized),
          }));
        } catch {
          setLocalBackupStatus("error");
        }
        setLastSavedAt(Date.now());
        if (JSON.stringify(stateRef.current) === serialized) setStorageStatus("saved");
      } while (saveQueuedRef.current || JSON.stringify(stateRef.current) !== lastSavedStateRef.current);
    } finally {
      saveInFlightRef.current = false;
    }
  }, [hydrated]);

  useEffect(() => {
    let cancelled = false;
    const hydrationRequestedState = stateRef.current;
    void (async () => {
      const fallback = createResumeDocumentSeed();
      let localState: ResumeDocumentState | null = null;
      let localMetadata: ReturnType<typeof parseResumeDocumentSyncMetadata> = null;
      try {
        localState = parseResumeDocumentState(localStorage.getItem(RESUME_DOCUMENT_STORAGE_KEY));
        localMetadata = parseResumeDocumentSyncMetadata(localStorage.getItem(RESUME_DOCUMENT_SYNC_STORAGE_KEY));
      } catch {
        setLocalBackupStatus("error");
      }
      try {
        const serverDocument = await responseDocument(await fetch("/api/resume/documents", { cache: "no-store" }));
        if (cancelled) return;
        const resolved = protectResumeDocumentHydration({
          requestedState: hydrationRequestedState,
          currentState: stateRef.current,
          resolvedDocument: resolveResumeDocumentLoad({ localState, localMetadata, serverDocument, fallback }),
        });
        const serialized = JSON.stringify(resolved.state);
        serverRevisionRef.current = resolved.revision;
        lastSavedStateRef.current = serverDocument ? JSON.stringify(serverDocument.state) : null;
        saveBlockedRef.current = resolved.conflict;
        stateRef.current = resolved.state;
        setState(resolved.state);
        setLastSavedAt(serverDocument ? Date.parse(serverDocument.updatedAt) : null);
        try {
          localStorage.setItem(RESUME_DOCUMENT_STORAGE_KEY, serialized);
          const synchronizedSerialized = serverDocument ? JSON.stringify(serverDocument.state) : serialized;
          localStorage.setItem(RESUME_DOCUMENT_SYNC_STORAGE_KEY, JSON.stringify({
            revision: resolved.revision,
            fingerprint: resumeDocumentFingerprint(synchronizedSerialized),
            ...(resolved.conflict ? { conflict: true } : {}),
          }));
          setLocalBackupStatus("available");
        } catch {
          setLocalBackupStatus("error");
        }
        setHydrated(true);
        setStorageStatus(resolved.conflict ? "conflict" : resolved.needsSave ? "saving" : "saved");
      } catch {
        if (cancelled) return;
        const currentState = stateRef.current;
        const editedDuringHydration = !sameResumeDocumentState(currentState, hydrationRequestedState);
        const initial = editedDuringHydration ? currentState : (localState ?? fallback);
        stateRef.current = initial;
        serverRevisionRef.current = localMetadata?.revision ?? 0;
        lastSavedStateRef.current = null;
        setState(initial);
        setHydrated(true);
        setStorageStatus("offline");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(RESUME_DOCUMENT_STORAGE_KEY, JSON.stringify(state));
      setLocalBackupStatus("available");
    } catch {
      setLocalBackupStatus("error");
    }
    if (saveBlockedRef.current) return;
    const timeout = window.setTimeout(() => { void persistLatestState(); }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [hydrated, persistLatestState, state]);

  useEffect(() => {
    const retryWhenOnline = () => { if (!saveBlockedRef.current) void persistLatestState(); };
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [persistLatestState]);

  const loadServerCopy = useCallback(async () => {
    if (!window.confirm("이 브라우저에서 아직 서버에 저장하지 못한 변경을 버리고 서버 문서를 불러올까요?")) return;
    setStorageStatus("loading");
    try {
      const document = await responseDocument(await fetch("/api/resume/documents", { cache: "no-store" }));
      if (!document) throw new Error("RESUME_DOCUMENT_NOT_FOUND");
      acceptServerDocument(document);
    } catch {
      setStorageStatus("error");
    }
  }, [acceptServerDocument]);

  const overwriteServerCopy = useCallback(() => {
    saveBlockedRef.current = false;
    lastSavedStateRef.current = null;
    setStorageStatus("saving");
    void persistLatestState();
  }, [persistLatestState]);

  const applyImportCandidate = useCallback(async (candidateId: string) => {
    if (candidateApplyInFlightRef.current) {
      throw new Error("다른 후보를 문서에 반영하는 중입니다. 완료 후 다시 시도해 주세요.");
    }
    if (saveBlockedRef.current) {
      throw new Error("다른 기기의 변경과 충돌했습니다. 먼저 서버 문서 또는 이 편집본 중 하나를 선택해 주세요.");
    }
    candidateApplyInFlightRef.current = true;
    let failedStatus: ResumeDocumentStorageStatus = "offline";
    try {
      while (saveInFlightRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      }
      if (saveBlockedRef.current) {
        throw new Error("다른 기기의 변경과 충돌했습니다. 먼저 서버 문서 또는 이 편집본 중 하나를 선택해 주세요.");
      }
      const requestedState = stateRef.current;
      setStorageStatus("saving");
      const response = await fetch(`/api/resume/documents/candidates/${candidateId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: requestedState,
          expectedRevision: serverRevisionRef.current,
        }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { code?: unknown; details?: { currentRevision?: unknown }; message?: unknown } | null;
        if (response.status === 409 && failure?.code === "RESUME_DOCUMENT_CONFLICT") {
          if (Number.isInteger(failure.details?.currentRevision)) {
            serverRevisionRef.current = failure.details!.currentRevision as number;
          }
          saveBlockedRef.current = true;
          setStorageStatus("conflict");
        } else {
          failedStatus = response.status >= 500 ? "offline" : "error";
        }
        throw new Error(typeof failure?.message === "string" ? failure.message : "후보를 문서에 반영하지 못했습니다.");
      }
      const document = await responseCandidateDocument(response);
      const resolved = resolveResumeDocumentCandidateApplication({
        currentState: stateRef.current,
        requestedState,
        serverState: document.state,
        command: document.command,
      });
      const serialized = JSON.stringify(resolved.state);
      const serverSerialized = JSON.stringify(document.state);
      serverRevisionRef.current = document.revision;
      lastSavedStateRef.current = serverSerialized;
      saveBlockedRef.current = false;
      stateRef.current = resolved.state;
      try {
        localStorage.setItem(RESUME_DOCUMENT_STORAGE_KEY, serialized);
        localStorage.setItem(RESUME_DOCUMENT_SYNC_STORAGE_KEY, JSON.stringify({
          revision: document.revision,
          fingerprint: resumeDocumentFingerprint(serverSerialized),
        }));
        setLocalBackupStatus("available");
      } catch {
        setLocalBackupStatus("error");
      }
      setState(resolved.state);
      setLastSavedAt(Date.parse(document.updatedAt));
      setStorageStatus(resolved.needsSave ? "saving" : "saved");
    } catch (error) {
      if (!saveBlockedRef.current) setStorageStatus(failedStatus);
      throw error;
    } finally {
      candidateApplyInFlightRef.current = false;
      if (!saveBlockedRef.current && JSON.stringify(stateRef.current) !== lastSavedStateRef.current) {
        void persistLatestState();
      }
    }
  }, [persistLatestState]);

  return { state, setState, hydrated, storageStatus, localBackupStatus, lastSavedAt, loadServerCopy, overwriteServerCopy, applyImportCandidate };
}
