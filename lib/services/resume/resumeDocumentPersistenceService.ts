import { Prisma } from "@prisma/client";

import {
  parseResumeDocumentState,
  type ResumeDocumentState,
} from "@/domain/resume-documents/model";
import { sameResumeDocumentState } from "@/domain/resume-documents/persistence";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";

export type PersistedResumeDocument = {
  state: ResumeDocumentState;
  revision: number;
  updatedAt: string;
};

export function validatedResumeDocumentState(value: unknown): ResumeDocumentState {
  try {
    const state = parseResumeDocumentState(JSON.stringify(value));
    if (state) return state;
  } catch {
    // Convert every serialization or domain parsing failure to the API contract below.
  }
  throw serviceError(400, "RESUME_DOCUMENT_INVALID", "Resume document is invalid");
}

export function resumeDocumentJson(value: ResumeDocumentState) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function persistedResumeDocumentResult(document: { payload: Prisma.JsonValue; revision: number; updatedAt: Date }): PersistedResumeDocument {
  return {
    state: validatedResumeDocumentState(document.payload),
    revision: document.revision,
    updatedAt: document.updatedAt.toISOString(),
  };
}

export async function getResumeDocument(userId: string): Promise<PersistedResumeDocument | null> {
  const document = await prisma.resumeDocument.findUnique({ where: { userId } });
  return document ? persistedResumeDocumentResult(document) : null;
}

export async function saveResumeDocumentWithClient(client: Prisma.TransactionClient, input: {
  userId: string;
  state: unknown;
  expectedRevision: number;
}): Promise<PersistedResumeDocument> {
  const state = validatedResumeDocumentState(input.state);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw serviceError(400, "RESUME_DOCUMENT_REVISION_INVALID", "Resume document revision is invalid");
  }

  const current = await client.resumeDocument.findUnique({ where: { userId: input.userId } });
  if (!current) {
    if (input.expectedRevision !== 0) {
      throw serviceError(409, "RESUME_DOCUMENT_CONFLICT", "Resume document changed", { currentRevision: 0 });
    }
    const created = await client.resumeDocument.create({
      data: {
        payload: resumeDocumentJson(state),
        schemaVersion: state.version,
        userId: input.userId,
      },
    });
    return persistedResumeDocumentResult(created);
  }
  const currentState = validatedResumeDocumentState(current.payload);
  // A lost response may make the browser retry an already committed snapshot
  // with an older revision. Equal content is a successful replay, not a conflict.
  if (sameResumeDocumentState(currentState, state)) return persistedResumeDocumentResult(current);
  if (current.revision !== input.expectedRevision) {
    throw serviceError(409, "RESUME_DOCUMENT_CONFLICT", "Resume document changed", { currentRevision: current.revision });
  }
  const updated = await client.resumeDocument.updateMany({
    where: { id: current.id, revision: input.expectedRevision },
    data: {
      payload: resumeDocumentJson(state),
      schemaVersion: state.version,
      revision: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    const latest = await client.resumeDocument.findUniqueOrThrow({ where: { id: current.id } });
    if (sameResumeDocumentState(validatedResumeDocumentState(latest.payload), state)) return persistedResumeDocumentResult(latest);
    throw serviceError(409, "RESUME_DOCUMENT_CONFLICT", "Resume document changed", { currentRevision: latest.revision });
  }
  return persistedResumeDocumentResult(await client.resumeDocument.findUniqueOrThrow({ where: { id: current.id } }));
}

export async function saveResumeDocument(input: {
  userId: string;
  state: unknown;
  expectedRevision: number;
}): Promise<PersistedResumeDocument> {
  return prisma.$transaction((tx) => saveResumeDocumentWithClient(tx, input));
}
