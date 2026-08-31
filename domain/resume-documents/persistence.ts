import { z } from "zod";

import type { ResumeDocumentState } from "./model";

export const RESUME_DOCUMENT_SYNC_STORAGE_KEY = "presstuner:resume-documents:sync:v1";

export const ResumeDocumentSaveRequestSchema = z.object({
  state: z.unknown(),
  expectedRevision: z.number().int().nonnegative(),
}).strict();

export type ResumeDocumentRecord = {
  state: ResumeDocumentState;
  revision: number;
  updatedAt: string;
};

export type ResumeDocumentSyncMetadata = {
  revision: number;
  fingerprint: string;
  conflict?: boolean;
};

export function resumeDocumentFingerprint(serialized: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJsonValue(item)]),
  );
}

export function sameResumeDocumentState(left: ResumeDocumentState, right: ResumeDocumentState) {
  return JSON.stringify(canonicalJsonValue(left)) === JSON.stringify(canonicalJsonValue(right));
}

export function parseResumeDocumentSyncMetadata(raw: string | null): ResumeDocumentSyncMetadata | null {
  try {
    const value = JSON.parse(raw ?? "null") as Partial<ResumeDocumentSyncMetadata> | null;
    return value && Number.isInteger(value.revision) && (value.revision ?? -1) >= 0 && typeof value.fingerprint === "string"
      ? { revision: value.revision!, fingerprint: value.fingerprint, ...(value.conflict === true ? { conflict: true } : {}) }
      : null;
  } catch {
    return null;
  }
}

export function resolveResumeDocumentLoad(input: {
  localState: ResumeDocumentState | null;
  localMetadata: ResumeDocumentSyncMetadata | null;
  serverDocument: ResumeDocumentRecord | null;
  fallback: ResumeDocumentState;
}) {
  const localSerialized = input.localState ? JSON.stringify(input.localState) : null;
  const localDirty = Boolean(
    localSerialized
    && input.localMetadata
    && resumeDocumentFingerprint(localSerialized) !== input.localMetadata.fingerprint,
  );

  if (!input.serverDocument) {
    return {
      state: input.localState ?? input.fallback,
      revision: 0,
      needsSave: true,
      conflict: false,
    };
  }
  if (input.localState && input.localMetadata?.conflict) {
    return {
      state: input.localState,
      revision: input.serverDocument.revision,
      needsSave: false,
      conflict: true,
    };
  }
  if (input.localState && localDirty) {
    if (input.localMetadata?.revision === input.serverDocument.revision) {
      return {
        state: input.localState,
        revision: input.serverDocument.revision,
        needsSave: true,
        conflict: false,
      };
    }
    return {
      state: input.localState,
      revision: input.serverDocument.revision,
      needsSave: false,
      conflict: true,
    };
  }
  return {
    state: input.serverDocument.state,
    revision: input.serverDocument.revision,
    needsSave: false,
    conflict: false,
  };
}

export function protectResumeDocumentHydration(input: {
  currentState: ResumeDocumentState;
  requestedState: ResumeDocumentState;
  resolvedDocument: {
    state: ResumeDocumentState;
    revision: number;
    needsSave: boolean;
    conflict: boolean;
  };
}) {
  if (sameResumeDocumentState(input.currentState, input.requestedState)) {
    return input.resolvedDocument;
  }
  return {
    ...input.resolvedDocument,
    state: input.currentState,
    needsSave: input.resolvedDocument.revision === 0,
    conflict: input.resolvedDocument.revision > 0,
  };
}

export function resolveResumeDocumentCandidateApplication(input: {
  currentState: ResumeDocumentState;
  requestedState: ResumeDocumentState;
  serverState: ResumeDocumentState;
}) {
  if (sameResumeDocumentState(input.currentState, input.requestedState)) {
    return {
      state: input.serverState,
      needsSave: false,
      conflict: false,
    };
  }

  // The server result represents the durable application event. Edits made
  // after the request are newer user intent, so a true leaf-level overlap
  // keeps the current value while retaining the server's import-ledger entry.
  const state = mergeConcurrentValue(
    input.requestedState,
    input.currentState,
    input.serverState,
  ) as ResumeDocumentState;
  return {
    state,
    needsSave: !sameResumeDocumentState(state, input.serverState),
    conflict: false,
  };
}

function mergeConcurrentValue(requested: unknown, current: unknown, server: unknown): unknown {
  if (sameCanonicalValue(current, requested)) return server;
  if (sameCanonicalValue(server, requested)) return current;
  if (Array.isArray(requested) && Array.isArray(current) && Array.isArray(server)) {
    return mergeConcurrentArray(requested, current, server);
  }
  if (isPlainObject(requested) && isPlainObject(current) && isPlainObject(server)) {
    const keys = new Set([...Object.keys(requested), ...Object.keys(current), ...Object.keys(server)]);
    return Object.fromEntries([...keys].map((key) => [
      key,
      mergeConcurrentValue(requested[key], current[key], server[key]),
    ]));
  }
  return current;
}

function mergeConcurrentArray(requested: unknown[], current: unknown[], server: unknown[]) {
  const requestedKeys = arrayIdentityKeys(requested);
  const currentKeys = arrayIdentityKeys(current);
  const serverKeys = arrayIdentityKeys(server);
  if (!requestedKeys || !currentKeys || !serverKeys) return current;

  const requestedByKey = new Map(requestedKeys.map((key, index) => [key, requested[index]]));
  const currentByKey = new Map(currentKeys.map((key, index) => [key, current[index]]));
  const serverByKey = new Map(serverKeys.map((key, index) => [key, server[index]]));
  const order = [...currentKeys, ...serverKeys.filter((key) => !currentByKey.has(key))];
  return order.flatMap((key) => {
    const baseValue = requestedByKey.get(key);
    const currentHas = currentByKey.has(key);
    const serverHas = serverByKey.has(key);
    if (!currentHas) return baseValue === undefined && serverHas ? [serverByKey.get(key)] : [];
    if (!serverHas) {
      if (baseValue !== undefined && sameCanonicalValue(currentByKey.get(key), baseValue)) return [];
      return [currentByKey.get(key)];
    }
    if (baseValue === undefined) {
      return [currentByKey.get(key)];
    }
    return [mergeConcurrentValue(baseValue, currentByKey.get(key), serverByKey.get(key))];
  });
}

function arrayIdentityKeys(values: unknown[]) {
  const keys = values.map(arrayIdentityKey);
  if (keys.some((key) => key === null)) return null;
  const concrete = keys as string[];
  return new Set(concrete).size === concrete.length ? concrete : null;
}

function arrayIdentityKey(value: unknown) {
  if (!isPlainObject(value)) return null;
  if (typeof value.id === "string") return `id:${value.id}`;
  if (typeof value.candidateKey === "string" && typeof value.payloadHash === "string") {
    return `ledger:${value.candidateKey}:${value.payloadHash}`;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameCanonicalValue(left: unknown, right: unknown) {
  return JSON.stringify(canonicalJsonValue(left)) === JSON.stringify(canonicalJsonValue(right));
}
