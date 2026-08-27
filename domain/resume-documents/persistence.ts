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
};

export function resumeDocumentFingerprint(serialized: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function parseResumeDocumentSyncMetadata(raw: string | null): ResumeDocumentSyncMetadata | null {
  try {
    const value = JSON.parse(raw ?? "null") as Partial<ResumeDocumentSyncMetadata> | null;
    return value && Number.isInteger(value.revision) && (value.revision ?? -1) >= 0 && typeof value.fingerprint === "string"
      ? { revision: value.revision!, fingerprint: value.fingerprint }
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
