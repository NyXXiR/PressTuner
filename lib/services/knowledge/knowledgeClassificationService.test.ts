import assert from "node:assert/strict";
import test from "node:test";

import { applyKnowledgeClassificationOverride } from "./knowledgeClassificationService";

test("classification override is team-scoped, idempotent, and increments corpus once", async () => {
  let corpusVersion = 4;
  let override: "FACT" | "STYLE_POLICY" | null = "FACT";
  const tx = {
    $executeRaw: async () => 1,
    knowledgeDocument: {
      findFirst: async ({ where }: any) =>
        where.teamId === "team-1"
          ? { id: "doc-1", classificationOverride: override }
          : null,
      update: async ({ data }: any) => {
        override = data.classificationOverride;
      },
    },
    team: {
      update: async () => {
        corpusVersion += 1;
      },
    },
  } as any;
  assert.deepEqual(
    await applyKnowledgeClassificationOverride(tx, {
      teamId: "team-1",
      documentId: "doc-1",
      override: "STYLE_POLICY",
    }),
    { changed: true, override: "STYLE_POLICY" },
  );
  assert.equal(corpusVersion, 5);
  assert.equal(
    (
      await applyKnowledgeClassificationOverride(tx, {
        teamId: "team-1",
        documentId: "doc-1",
        override: "STYLE_POLICY",
      })
    ).changed,
    false,
  );
  assert.equal(corpusVersion, 5);
  await assert.rejects(
    applyKnowledgeClassificationOverride(tx, {
      teamId: "team-2",
      documentId: "doc-1",
      override: null,
    }),
    /KNOWLEDGE_DOCUMENT_NOT_FOUND/,
  );
});
