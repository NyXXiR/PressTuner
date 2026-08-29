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

function validatedState(value: unknown): ResumeDocumentState {
  try {
    const state = parseResumeDocumentState(JSON.stringify(value));
    if (state) return state;
  } catch {
    // Convert every serialization or domain parsing failure to the API contract below.
  }
  throw serviceError(400, "RESUME_DOCUMENT_INVALID", "Resume document is invalid");
}

function json(value: ResumeDocumentState) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function result(document: { payload: Prisma.JsonValue; revision: number; updatedAt: Date }): PersistedResumeDocument {
  return {
    state: validatedState(document.payload),
    revision: document.revision,
    updatedAt: document.updatedAt.toISOString(),
  };
}

export async function getResumeDocument(userId: string): Promise<PersistedResumeDocument | null> {
  const document = await prisma.resumeDocument.findUnique({ where: { userId } });
  return document ? result(document) : null;
}

export async function saveResumeDocument(input: {
  userId: string;
  state: unknown;
  expectedRevision: number;
}): Promise<PersistedResumeDocument> {
  const state = validatedState(input.state);
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw serviceError(400, "RESUME_DOCUMENT_REVISION_INVALID", "Resume document revision is invalid");
  }

  const saved = await prisma.$transaction(async (tx) => {
    const current = await tx.resumeDocument.findUnique({ where: { userId: input.userId } });
    if (!current) {
      if (input.expectedRevision !== 0) {
        throw serviceError(409, "RESUME_DOCUMENT_CONFLICT", "Resume document changed", { currentRevision: 0 });
      }
      return tx.resumeDocument.create({
        data: {
          userId: input.userId,
          payload: json(state),
          schemaVersion: state.version,
        },
      });
    }
    const currentState = validatedState(current.payload);
    // A lost response may make the browser retry an already committed snapshot
    // with an older revision. Equal content is a successful replay, not a conflict.
    if (sameResumeDocumentState(currentState, state)) return current;
    if (current.revision !== input.expectedRevision) {
      throw serviceError(409, "RESUME_DOCUMENT_CONFLICT", "Resume document changed", { currentRevision: current.revision });
    }
    const updated = await tx.resumeDocument.updateMany({
      where: { id: current.id, revision: input.expectedRevision },
      data: {
        payload: json(state),
        schemaVersion: state.version,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      const latest = await tx.resumeDocument.findUniqueOrThrow({ where: { id: current.id } });
      if (sameResumeDocumentState(validatedState(latest.payload), state)) return latest;
      throw serviceError(409, "RESUME_DOCUMENT_CONFLICT", "Resume document changed", { currentRevision: latest.revision });
    }
    return tx.resumeDocument.findUniqueOrThrow({ where: { id: current.id } });
  });
  return result(saved);
}
