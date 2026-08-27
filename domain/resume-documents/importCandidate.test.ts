import assert from "node:assert/strict";
import test from "node:test";

import {
  addCustomSection,
  addRoleCustomSection,
  createResumeDocumentSeed,
  createSupportVariant,
  parseResumeDocumentState,
} from "./model";
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

test("candidate payload schema accepts the item groups found in JobKorea resumes", () => {
  for (const itemKind of [
    "work",
    "project",
    "education",
    "credential",
    "award",
    "activity",
    "language",
    "training",
  ] as const) {
    const parsed = ResumeDocumentCandidatePayloadSchema.parse({
      type: "item",
      itemKind,
      title: `${itemKind} title`,
      subtitle: "organization",
      body: "details",
      startMonth: "2020-01",
      endMonth: "2020-12",
      isCurrent: false,
      tags: [],
    });
    assert.equal(parsed.type, "item");
    if (parsed.type !== "item") assert.fail("Expected an item payload");
    assert.equal(parsed.itemKind, itemKind);
  }
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

test("item candidates can be routed into role and support-version custom sections", () => {
  const seed = createResumeDocumentSeed();
  const roleCustom = addRoleCustomSection(seed, seed.activeRoleProfileId, {
    title: "선택 프로젝트",
    kind: "items",
    afterSectionId: "experience",
  });
  const withRoleItem = applyResumeImportCommand(roleCustom.state, command({
    candidateKey: "document:role-project",
    payloadHash: "role-project",
    targetSectionId: roleCustom.section.id,
    applyMode: "APPEND",
    payload: {
      type: "item",
      itemKind: "project",
      title: "결제 전환 프로젝트",
      subtitle: "샘플테크",
      body: "전환 흐름을 개선했습니다.",
      startMonth: "2023-01",
      endMonth: "2023-06",
      isCurrent: false,
      tags: [],
    },
  }));
  const roleItems = withRoleItem.roleProfiles
    .find((profile) => profile.id === seed.activeRoleProfileId)!
    .customSections.find((section) => section.id === roleCustom.section.id)!
    .content as { items: Array<{ title: string }> };
  assert.deepEqual(roleItems.items.map((item) => item.title), ["결제 전환 프로젝트"]);

  const withVariant = createSupportVariant(withRoleItem, seed.activeRoleProfileId, {
    name: "A사 지원",
    company: "A사",
  });
  const variantCustom = addCustomSection(withVariant, withVariant.activeVariantId!, {
    title: "주요 수상",
    kind: "items",
    afterSectionId: "credentials",
  });
  const withAward = applyResumeImportCommand(variantCustom.state, command({
    candidateKey: "document:variant-award",
    payloadHash: "variant-award",
    targetSectionId: variantCustom.section.id,
    applyMode: "APPEND",
    payload: {
      type: "item",
      itemKind: "award",
      title: "서비스 혁신 대상",
      subtitle: "테스트협회",
      body: "대상 수상",
      startMonth: "2024-05",
      endMonth: "",
      isCurrent: false,
      tags: [],
    },
  }));
  const variantItems = withAward.variants
    .find((variant) => variant.id === withVariant.activeVariantId)!
    .customSections.find((section) => section.id === variantCustom.section.id)!
    .content as { items: Array<{ title: string }> };
  assert.deepEqual(variantItems.items.map((item) => item.title), ["서비스 혁신 대상"]);
});

test("stored states without an import ledger load with an empty ledger", () => {
  const legacy = createResumeDocumentSeed() as Omit<ReturnType<typeof createResumeDocumentSeed>, "importLedger"> & { importLedger?: unknown };
  delete legacy.importLedger;
  const parsed = parseResumeDocumentState(JSON.stringify(legacy));
  assert.deepEqual(parsed?.importLedger, []);
});
