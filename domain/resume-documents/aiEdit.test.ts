import assert from "node:assert/strict";
import test from "node:test";

import {
  RESUME_AI_EDIT_RESULT_PROTOCOL,
  ResumeAiEditError,
  createResumeAiEditBundle,
  parseResumeAiEditResult,
  prepareResumeAiEdit,
  selectResumeAiEditSections,
  type ResumeAiEditContext,
  type ResumeAiEditResult,
} from "./aiEdit";
import {
  createResumeDocumentSeed,
  createSupportVariant,
  resolveSection,
  type ItemContent,
  updateRoleProfileSectionSetting,
} from "./model";
import { resumeDocumentFingerprint } from "./persistence";

function result(
  state: ReturnType<typeof createResumeDocumentSeed>,
  context: ResumeAiEditContext,
  operations: ResumeAiEditResult["operations"],
): ResumeAiEditResult {
  return {
    protocol: RESUME_AI_EDIT_RESULT_PROTOCOL,
    version: 1,
    baseFingerprint: resumeDocumentFingerprint(JSON.stringify(state)),
    editContext: context,
    operations,
    assumptions: [],
    warnings: [],
  };
}

test("AI edit bundles preserve the selected inheritance context and resolved source", () => {
  const state = createResumeDocumentSeed();
  const context: ResumeAiEditContext = {
    scope: "role",
    roleProfileId: state.activeRoleProfileId,
  };
  const bundle = createResumeAiEditBundle(state, context);
  const summary = bundle.sections.find((section) => section.id === "summary");

  assert.deepEqual(bundle.editContext, context);
  assert.equal(bundle.baseFingerprint, resumeDocumentFingerprint(JSON.stringify(state)));
  assert.equal(summary?.resolution.source, "shared");
  assert.equal(summary?.resolution.mode, "inherit");
  assert.equal("photo" in (bundle.sections.find((section) => section.id === "profile")?.content ?? {}), false);
});

test("role edits create an override without mutating shared content", () => {
  const state = createResumeDocumentSeed();
  const context: ResumeAiEditContext = {
    scope: "role",
    roleProfileId: state.activeRoleProfileId,
  };
  const prepared = prepareResumeAiEdit(state, context, result(state, context, [{
    type: "UPDATE_NARRATIVE",
    sectionId: "summary",
    body: "백엔드 직군에 맞춘 소개",
  }]));
  const profile = prepared.state.roleProfiles[0];
  const summary = prepared.state.sharedSections.find((section) => section.id === "summary")!;

  assert.equal((summary.content as { body: string }).body.includes("백엔드"), false);
  assert.equal((resolveSection(summary, profile).content as { body: string }).body, "백엔드 직군에 맞춘 소개");
  assert.equal(profile.settings.summary.mode, "override");
});

test("an edit matching the parent clears the content override instead of duplicating it", () => {
  const seed = createResumeDocumentSeed();
  const context: ResumeAiEditContext = {
    scope: "role",
    roleProfileId: seed.activeRoleProfileId,
  };
  const state = updateRoleProfileSectionSetting(seed, seed.activeRoleProfileId, "summary", {
    mode: "override",
    content: { body: "직군 전용 소개" },
  });
  const sharedBody = (state.sharedSections.find((section) => section.id === "summary")!.content as { body: string }).body;
  const prepared = prepareResumeAiEdit(state, context, result(state, context, [{
    type: "UPDATE_NARRATIVE",
    sectionId: "summary",
    body: sharedBody,
  }]));

  assert.equal(prepared.state.roleProfiles[0].settings.summary.mode, "inherit");
  assert.equal(prepared.state.roleProfiles[0].settings.summary.content, undefined);
});

test("support variant edits stay in the variant layer", () => {
  const seed = createResumeDocumentSeed();
  const state = createSupportVariant(seed, seed.activeRoleProfileId, {
    name: "A사 지원",
    company: "A사",
  });
  const variant = state.variants[0];
  const context: ResumeAiEditContext = {
    scope: "variant",
    roleProfileId: variant.roleProfileId,
    variantId: variant.id,
  };
  const prepared = prepareResumeAiEdit(state, context, result(state, context, [{
    type: "UPDATE_NARRATIVE",
    sectionId: "summary",
    body: "A사 지원용 소개",
  }]));

  assert.equal(prepared.state.roleProfiles[0].settings.summary, undefined);
  assert.equal((prepared.state.variants[0].settings.summary.content as { body: string }).body, "A사 지원용 소개");
});

test("role item edits use item-level overrides instead of copying the shared section", () => {
  const state = createResumeDocumentSeed();
  const context: ResumeAiEditContext = { scope: "role", roleProfileId: state.activeRoleProfileId };
  const sharedSection = state.sharedSections.find((section) => section.id === "experience")!;
  const sharedItem = (sharedSection.content as { items: ItemContent[] }).items[0];
  const prepared = prepareResumeAiEdit(state, context, result(state, context, [{
    type: "UPDATE_ITEM",
    sectionId: sharedSection.id,
    itemId: sharedItem.id,
    patch: { body: "직군에 맞춰 다듬은 경력 설명" },
  }]));
  const setting = prepared.state.roleProfiles[0].settings.experience;

  assert.equal(setting.mode, "inherit");
  assert.equal(setting.content, undefined);
  assert.equal(setting.itemSettings?.[sharedItem.id]?.mode, "override");
  assert.equal(setting.itemSettings?.[sharedItem.id]?.content?.body, "직군에 맞춰 다듬은 경력 설명");
  assert.equal((sharedSection.content as { items: ItemContent[] }).items[0].body, sharedItem.body);
});

test("updating an item body clears stale rich-text blocks", () => {
  const state = createResumeDocumentSeed();
  const section = state.sharedSections.find((item) => item.id === "experience")!;
  const item = (section.content as { items: ItemContent[] }).items[0];
  item.bodyBlocks = [{ id: "old", type: "p", runs: [{ text: "예전 서식 내용", bold: true }] }];
  const context: ResumeAiEditContext = { scope: "shared" };
  const prepared = prepareResumeAiEdit(state, context, result(state, context, [{
    type: "UPDATE_ITEM",
    sectionId: section.id,
    itemId: item.id,
    patch: { body: "AI가 고친 본문" },
  }]));
  const updated = (prepared.state.sharedSections.find((candidate) => candidate.id === section.id)!.content as { items: ItemContent[] }).items[0];

  assert.equal(updated.body, "AI가 고친 본문");
  assert.equal(updated.bodyBlocks, undefined);
});

test("an item edit matching its parent clears the item override", () => {
  const seed = createResumeDocumentSeed();
  const context: ResumeAiEditContext = { scope: "role", roleProfileId: seed.activeRoleProfileId };
  const section = seed.sharedSections.find((item) => item.id === "experience")!;
  const sharedItem = (section.content as { items: ItemContent[] }).items[0];
  const overridden = prepareResumeAiEdit(seed, context, result(seed, context, [{
    type: "UPDATE_ITEM",
    sectionId: section.id,
    itemId: sharedItem.id,
    patch: { body: "직군 전용 내용" },
  }])).state;
  const restored = prepareResumeAiEdit(overridden, context, result(overridden, context, [{
    type: "UPDATE_ITEM",
    sectionId: section.id,
    itemId: sharedItem.id,
    patch: { body: sharedItem.body },
  }])).state;

  assert.equal(restored.roleProfiles[0].settings.experience.itemSettings?.[sharedItem.id], undefined);
});

test("item additions are idempotently guarded by normalized content", () => {
  const state = createResumeDocumentSeed();
  const context: ResumeAiEditContext = { scope: "shared" };
  const existing = (state.sharedSections.find((section) => section.id === "experience")!.content as {
    items: Array<{ title: string; subtitle: string; body: string; meta: string }>;
  }).items[0];
  const edit = result(state, context, [{
    type: "ADD_ITEM",
    sectionId: "experience",
    item: {
      title: ` ${existing.title} `,
      subtitle: existing.subtitle,
      body: existing.body,
      meta: existing.meta,
    },
  }]);

  assert.throws(
    () => prepareResumeAiEdit(state, context, edit, { idFactory: () => "ai-new" }),
    (error: unknown) => error instanceof ResumeAiEditError && error.code === "RESUME_AI_EDIT_DUPLICATE_ITEM",
  );
});

test("stale or cross-scope AI results are rejected before mutation", () => {
  const state = createResumeDocumentSeed();
  const shared: ResumeAiEditContext = { scope: "shared" };
  const edit = result(state, shared, [{
    type: "UPDATE_NARRATIVE",
    sectionId: "summary",
    body: "수정",
  }]);

  assert.throws(
    () => prepareResumeAiEdit({ ...state, activeVariantId: null, importLedger: [{ candidateKey: "changed", payloadHash: "x", targetSectionId: "summary", appliedAt: "now" }] }, shared, edit),
    (error: unknown) => error instanceof ResumeAiEditError && error.code === "RESUME_AI_EDIT_DOCUMENT_CHANGED",
  );
  assert.throws(
    () => prepareResumeAiEdit(state, { scope: "role", roleProfileId: state.activeRoleProfileId }, edit),
    (error: unknown) => error instanceof ResumeAiEditError && error.code === "RESUME_AI_EDIT_CONTEXT_CHANGED",
  );
});

test("section selection applies only operations belonging to approved sections", () => {
  const state = createResumeDocumentSeed();
  const context: ResumeAiEditContext = { scope: "shared" };
  const edit = result(state, context, [
    { type: "UPDATE_NARRATIVE", sectionId: "summary", body: "선택한 소개" },
    { type: "UPDATE_IDENTITY", sectionId: "profile", patch: { name: "선택하지 않은 이름" } },
  ]);
  const selected = selectResumeAiEditSections(edit, ["summary"]);
  const prepared = prepareResumeAiEdit(state, context, selected);
  const summary = prepared.state.sharedSections.find((section) => section.id === "summary")!;
  const profile = prepared.state.sharedSections.find((section) => section.id === "profile")!;

  assert.equal((summary.content as { body: string }).body, "선택한 소개");
  assert.notEqual((profile.content as { name: string }).name, "선택하지 않은 이름");
  assert.equal(prepared.changes.length, 1);
  assert.throws(
    () => selectResumeAiEditSections(edit, []),
    (error: unknown) => error instanceof ResumeAiEditError && error.code === "RESUME_AI_EDIT_SELECTION_REQUIRED",
  );
});

test("JSON result parsing accepts a single JSON code fence and rejects unknown fields", () => {
  const state = createResumeDocumentSeed();
  const edit = result(state, { scope: "shared" }, [{
    type: "UPDATE_NARRATIVE",
    sectionId: "summary",
    body: "수정",
  }]);
  assert.deepEqual(parseResumeAiEditResult(`\`\`\`json\n${JSON.stringify(edit)}\n\`\`\``), edit);
  assert.throws(
    () => parseResumeAiEditResult(JSON.stringify({ ...edit, unknown: true })),
    (error: unknown) => error instanceof ResumeAiEditError && error.code === "RESUME_AI_EDIT_RESULT_INVALID",
  );
});
