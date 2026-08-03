import assert from "node:assert/strict";
import test from "node:test";

import {
  decideEvidenceCandidate,
  detachRagFactForUserEdit,
  incrementGroundingRevision,
  isGroundingRevisionCurrent,
} from "./groundingPolicy";

test("candidate decisions are explicit and idempotent", () => {
  assert.deepEqual(decideEvidenceCandidate("PENDING", "ACCEPTED"), {
    decision: "ACCEPTED",
    changed: true,
  });
  assert.deepEqual(decideEvidenceCandidate("ACCEPTED", "ACCEPTED"), {
    decision: "ACCEPTED",
    changed: false,
  });
  assert.deepEqual(decideEvidenceCandidate("ACCEPTED", "REJECTED"), {
    decision: "REJECTED",
    changed: true,
  });
});

test("editing a RAG fact converts it to a user fact and clears all provenance", () => {
  assert.deepEqual(
    detachRagFactForUserEdit(
      {
        text: "Old",
        origin: "RAG",
        candidateId: "candidate-1",
        documentId: "document-1",
        chunkId: "chunk-1",
        pageStart: 2,
        pageEnd: 3,
        excerpt: "Old evidence",
      },
      "User-edited",
    ),
    {
      text: "User-edited",
      origin: "USER",
      candidateId: null,
      documentId: null,
      chunkId: null,
      pageStart: null,
      pageEnd: null,
      excerpt: null,
    },
  );
});

test("grounding mutations increment revision and invalidate old snapshots", () => {
  const revision = incrementGroundingRevision(4, true);
  assert.equal(revision, 5);
  assert.equal(incrementGroundingRevision(revision, false), 5);
  assert.equal(isGroundingRevisionCurrent(4, revision), false);
  assert.equal(isGroundingRevisionCurrent(5, revision), true);
});
