import assert from "node:assert/strict";
import test from "node:test";

import { createResumeDocumentSeed, parseResumeDocumentState } from "./model";
import {
  applyResumeImportCommand,
  ResumeDocumentCandidatePayloadSchema,
  type ResumeDocumentImportCommand,
} from "./importCandidate";

const command = (
  overrides: Partial<ResumeDocumentImportCommand> = {},
): ResumeDocumentImportCommand => ({
  candidateKey: "document:candidate-1",
  payloadHash: "hash-1",
  targetSectionId: "profile",
  applyMode: "FILL_EMPTY",
  appliedAt: "2026-08-27T00:00:00.000Z",
  payload: { type: "identity-field", field: "name", value: "홍길동" },
  ...overrides,
});

test("candidate payload schema normalizes supported date values and rejects invalid fields", () => {
  assert.deepEqual(
    ResumeDocumentCandidatePayloadSchema.parse({
      type: "identity-field",
      field: "birthDate",
      value: "1992-06-05",
    }),
    { type: "identity-field", field: "birthDate", value: "1992-06-05" },
  );

  assert.throws(() =>
    ResumeDocumentCandidatePayloadSchema.parse({
      type: "identity-field",
      field: "birthDate",
      value: "1992-13-40",
    }),
  );
  assert.throws(() =>
    ResumeDocumentCandidatePayloadSchema.parse({
      type: "identity-field",
      field: "photo",
      value: "data:image/png;base64,unsafe",
    }),
  );
});

test("FILL_EMPTY treats starter placeholders as empty but never overwrites real content", () => {
  const seed = createResumeDocumentSeed();
  const filled = applyResumeImportCommand(seed, command());
  const identity = filled.sharedSections.find((section) => section.id === "profile")!.content as {
    name: string;
  };
  assert.equal(identity.name, "홍길동");

  const second = applyResumeImportCommand(
    filled,
    command({ candidateKey: "document:candidate-2", payloadHash: "hash-2", payload: { type: "identity-field", field: "name", value: "김민지" } }),
  );
  assert.equal(
    (second.sharedSections.find((section) => section.id === "profile")!.content as { name: string }).name,
    "홍길동",
  );
  assert.equal(second.importLedger.length, 2);
});

test("the same approved command is idempotent and a changed hash is rejected", () => {
  const once = applyResumeImportCommand(createResumeDocumentSeed(), command());
  const twice = applyResumeImportCommand(once, command());
  assert.deepEqual(twice, once);
  assert.throws(
    () => applyResumeImportCommand(once, command({ payloadHash: "different" })),
    /RESUME_IMPORT_COMMAND_HASH_CONFLICT/,
  );
});

test("tags merge in stable order and item append deduplicates normalized content", () => {
  const withTags = applyResumeImportCommand(
    createResumeDocumentSeed(),
    command({
      candidateKey: "document:skills",
      payloadHash: "skills-hash",
      targetSectionId: "skills",
      applyMode: "MERGE",
      payload: { type: "tags", values: ["React", "제품 개발", "React"] },
    }),
  );
  assert.deepEqual(
    (withTags.sharedSections.find((section) => section.id === "skills")!.content as { items: string[] }).items,
    ["React", "제품 개발"],
  );

  const educationPayload = {
    type: "item" as const,
    itemKind: "education" as const,
    title: "한국대학교",
    subtitle: "컴퓨터공학과",
    body: "학사",
    startMonth: "2011-03",
    endMonth: "2015-02",
    isCurrent: false,
    tags: [],
  };
  const once = applyResumeImportCommand(withTags, command({
    candidateKey: "document:education-1",
    payloadHash: "education-1",
    targetSectionId: "education",
    applyMode: "APPEND",
    payload: educationPayload,
  }));
  const twice = applyResumeImportCommand(once, command({
    candidateKey: "document:education-2",
    payloadHash: "education-2",
    targetSectionId: "education",
    applyMode: "APPEND",
    payload: educationPayload,
  }));
  const items = (twice.sharedSections.find((section) => section.id === "education")!.content as { items: unknown[] }).items;
  assert.equal(items.filter((item) => (item as { title: string }).title === "한국대학교").length, 1);
  assert.equal(twice.importLedger.length, 3);
});

test("commands cannot be applied to an incompatible section", () => {
  assert.throws(
    () => applyResumeImportCommand(createResumeDocumentSeed(), command({ targetSectionId: "summary" })),
    /RESUME_IMPORT_SECTION_KIND_MISMATCH/,
  );
});

test("stored states without an import ledger load with an empty ledger", () => {
  const legacy = createResumeDocumentSeed() as Omit<ReturnType<typeof createResumeDocumentSeed>, "importLedger"> & { importLedger?: unknown };
  delete legacy.importLedger;
  const parsed = parseResumeDocumentState(JSON.stringify(legacy));
  assert.deepEqual(parsed?.importLedger, []);
});
