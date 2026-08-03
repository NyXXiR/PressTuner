import assert from "node:assert/strict";
import test from "node:test";

import {
  assertKnowledgeScope,
  transitionKnowledgeDocument,
  validateKnowledgeUpload,
  validateKnowledgeChunkProvenance,
} from "./documentLifecycle";

test("knowledge documents follow the durable indexing lifecycle", () => {
  assert.equal(transitionKnowledgeDocument("UPLOADED", "QUEUE"), "QUEUED");
  assert.equal(transitionKnowledgeDocument("QUEUED", "START_PARSING"), "PARSING");
  assert.equal(transitionKnowledgeDocument("PARSING", "START_INDEXING"), "INDEXING");
  assert.equal(transitionKnowledgeDocument("INDEXING", "COMPLETE"), "READY");
});

test("knowledge documents reject skipped or terminal-state transitions", () => {
  assert.throws(
    () => transitionKnowledgeDocument("UPLOADED", "START_INDEXING"),
    /KNOWLEDGE_DOCUMENT_ILLEGAL_TRANSITION/,
  );
  assert.throws(
    () => transitionKnowledgeDocument("READY", "COMPLETE"),
    /KNOWLEDGE_DOCUMENT_ILLEGAL_TRANSITION/,
  );
});

test("failed indexing can be retried without inventing a new document", () => {
  assert.equal(transitionKnowledgeDocument("PARSING", "FAIL"), "FAILED");
  assert.equal(transitionKnowledgeDocument("INDEXING", "FAIL"), "FAILED");
  assert.equal(transitionKnowledgeDocument("FAILED", "RETRY"), "QUEUED");
});

test("chunk provenance requires a stable ordinal and valid page range", () => {
  assert.deepEqual(
    validateKnowledgeChunkProvenance({
      documentId: "doc-1",
      ordinal: 0,
      pageStart: 2,
      pageEnd: 3,
    }),
    {
      documentId: "doc-1",
      ordinal: 0,
      pageStart: 2,
      pageEnd: 3,
    },
  );

  assert.throws(
    () =>
      validateKnowledgeChunkProvenance({
        documentId: "doc-1",
        ordinal: -1,
        pageStart: 2,
        pageEnd: 3,
      }),
    /KNOWLEDGE_CHUNK_INVALID_PROVENANCE/,
  );
  assert.throws(
    () =>
      validateKnowledgeChunkProvenance({
        documentId: "doc-1",
        ordinal: 0,
        pageStart: 3,
        pageEnd: 2,
      }),
    /KNOWLEDGE_CHUNK_INVALID_PROVENANCE/,
  );
});

test("knowledge access is always constrained to the active team", () => {
  assert.doesNotThrow(() =>
    assertKnowledgeScope({
      activeTeamId: "team-1",
      resourceTeamId: "team-1",
    }),
  );
  assert.throws(
    () =>
      assertKnowledgeScope({
        activeTeamId: "team-1",
        resourceTeamId: "team-2",
      }),
    /KNOWLEDGE_SCOPE_MISMATCH/,
  );
  assert.throws(
    () =>
      assertKnowledgeScope({
        activeTeamId: "",
        resourceTeamId: "team-1",
      }),
    /KNOWLEDGE_SCOPE_MISMATCH/,
  );
});

test("knowledge uploads accept bounded PDFs and reject unsupported input", () => {
  assert.deepEqual(
    validateKnowledgeUpload({
      originalName: "launch-plan.pdf",
      mimeType: "application/pdf",
      byteSize: 1_024,
    }),
    {
      originalName: "launch-plan.pdf",
      mimeType: "application/pdf",
      byteSize: 1_024,
    },
  );

  assert.throws(
    () =>
      validateKnowledgeUpload({
        originalName: "launch-plan.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteSize: 1_024,
      }),
    /KNOWLEDGE_UPLOAD_UNSUPPORTED_TYPE/,
  );
  assert.throws(
    () =>
      validateKnowledgeUpload({
        originalName: "huge.pdf",
        mimeType: "application/pdf",
        byteSize: 21 * 1024 * 1024,
      }),
    /KNOWLEDGE_UPLOAD_TOO_LARGE/,
  );
});

test("knowledge uploads validate actual PDF bytes and buffer length", () => {
  const metadata = {
    originalName: "source.pdf",
    mimeType: "application/pdf",
    byteSize: 1,
  };
  assert.throws(
    () => validateKnowledgeUpload(metadata, Buffer.from("not a pdf")),
    /KNOWLEDGE_UPLOAD_INVALID_PDF/,
  );
  assert.throws(
    () => validateKnowledgeUpload(metadata, Buffer.from("%PDF-123"), 7),
    /KNOWLEDGE_UPLOAD_TOO_LARGE/,
  );
  assert.equal(
    validateKnowledgeUpload(metadata, Buffer.from("%PDF-123"), 8).byteSize,
    8,
  );
});
