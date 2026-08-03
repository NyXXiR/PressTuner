import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGroundedRetrieval,
  decideKnowledgeIndexing,
} from "./retrieval";

test("identical completed indexing work is skipped idempotently", () => {
  assert.equal(
    decideKnowledgeIndexing({
      status: "READY",
      currentFingerprint: "sha256:model:chunker-v1",
      requestedFingerprint: "sha256:model:chunker-v1",
    }),
    "SKIP",
  );
});

test("changed indexing inputs replace stale chunks while failed work retries", () => {
  assert.equal(
    decideKnowledgeIndexing({
      status: "READY",
      currentFingerprint: "sha256:model:chunker-v1",
      requestedFingerprint: "sha256:model:chunker-v2",
    }),
    "REPLACE",
  );
  assert.equal(
    decideKnowledgeIndexing({
      status: "FAILED",
      currentFingerprint: null,
      requestedFingerprint: "sha256:model:chunker-v1",
    }),
    "RETRY",
  );
  assert.equal(
    decideKnowledgeIndexing({
      status: "UPLOADED",
      currentFingerprint: null,
      requestedFingerprint: "sha256:model:chunker-v1",
    }),
    "ENQUEUE",
  );
});

test("retrieval context carries stable source labels and page citations", () => {
  const result = buildGroundedRetrieval({
    activeTeamId: "team-1",
    requestedRoles: ["FACT"],
    hits: [
      {
        teamId: "team-1",
        chunkId: "chunk-9",
        documentId: "doc-2",
        documentName: "launch-plan.pdf",
        pageStart: 4,
        pageEnd: 5,
        content: "The launch date is September 3.",
        score: 0.91,
        automaticRole: "FACT",
        documentOverride: null,
      },
      {
        teamId: "team-1",
        chunkId: "chunk-3",
        documentId: "doc-1",
        documentName: "pricing.pdf",
        pageStart: 2,
        pageEnd: 2,
        content: "The enterprise plan costs 390,000 won.",
        score: 0.82,
        automaticRole: "STYLE_EXAMPLE",
        documentOverride: "FACT",
      },
    ],
  });

  assert.match(result.context, /\[source-1\][\s\S]*September 3/);
  assert.match(result.context, /\[source-2\][\s\S]*390,000 won/);
  assert.deepEqual(result.citations, [
    {
      sourceId: "source-1",
      chunkId: "chunk-9",
      documentId: "doc-2",
      documentName: "launch-plan.pdf",
      pageStart: 4,
      pageEnd: 5,
      score: 0.91,
    },
    {
      sourceId: "source-2",
      chunkId: "chunk-3",
      documentId: "doc-1",
      documentName: "pricing.pdf",
      pageStart: 2,
      pageEnd: 2,
      score: 0.82,
    },
  ]);
});

test("retrieval rejects a cross-team hit instead of leaking it into context", () => {
  assert.throws(
    () =>
      buildGroundedRetrieval({
        activeTeamId: "team-1",
        requestedRoles: ["FACT"],
        hits: [
          {
            teamId: "team-2",
            chunkId: "chunk-secret",
            documentId: "doc-secret",
            documentName: "secret.pdf",
            pageStart: 1,
            pageEnd: 1,
            content: "private",
            score: 0.99,
            automaticRole: "FACT",
            documentOverride: null,
          },
        ],
      }),
    /KNOWLEDGE_SCOPE_MISMATCH/,
  );
});

test("retrieval excludes unclassified and mismatched roles", () => {
  const result = buildGroundedRetrieval({
    activeTeamId: "team-1",
    requestedRoles: ["FACT"],
    hits: [
      {
        teamId: "team-1",
        chunkId: "fact",
        documentId: "doc",
        documentName: "facts.pdf",
        pageStart: 1,
        pageEnd: 1,
        content: "Allowed fact",
        score: 1,
        automaticRole: "FACT",
        documentOverride: null,
      },
      {
        teamId: "team-1",
        chunkId: "style",
        documentId: "doc",
        documentName: "style.pdf",
        pageStart: 1,
        pageEnd: 1,
        content: "Style-only number 99",
        score: 0.9,
        automaticRole: "STYLE_EXAMPLE",
        documentOverride: null,
      },
      {
        teamId: "team-1",
        chunkId: "unknown",
        documentId: "doc",
        documentName: "unknown.pdf",
        pageStart: 1,
        pageEnd: 1,
        content: "Unclassified",
        score: 0.8,
        automaticRole: null,
        documentOverride: null,
      },
    ],
  });
  assert.match(result.context, /Allowed fact/);
  assert.doesNotMatch(result.context, /Style-only|Unclassified/);
  assert.deepEqual(result.citations.map(({ chunkId }) => chunkId), ["fact"]);
});
