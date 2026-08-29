import assert from "node:assert/strict";
import test from "node:test";

import {
  assertResumeAiEditTargets,
  RESUME_AI_EDIT_RESULT_PROTOCOL,
  ResumeAiEditError,
  createResumeAiEditBundle,
  diffResumeItemBodyLines,
  parseResumeAiEditResult,
  prepareResumeAiEdit,
  selectResumeAiEditSections,
  type ResumeAiEditContext,
  type ResumeAiEditResult,
} from "./aiEdit";
import {
  createResumeDocumentSeed,
  createSupportVariant,
  parseResumeDocumentState,
  resolveSection,
  type ItemContent,
  updateDocumentItemSetting,
  updateRoleProfileItemSetting,
  updateRoleProfileSectionSetting,
  updateSectionSetting,
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
  assert.equal(bundle.rules.updateItemBodyReplacesExistingBody, true);
  assert.match(bundle.operationContracts.UPDATE_ITEM.patch.body, /complete replacement body/);
});

test("AI edit bundles can be restricted to one section", () => {
  const state = createResumeDocumentSeed();
  const bundle = createResumeAiEditBundle(state, { scope: "shared" }, { sectionIds: ["summary"] });

  assert.deepEqual(bundle.editableSectionIds, ["summary"]);
  assert.deepEqual(bundle.sections.map((section) => section.id), ["summary"]);
  assert.throws(
    () => createResumeAiEditBundle(state, { scope: "shared" }, { sectionIds: ["unknown"] }),
    (error: unknown) => error instanceof ResumeAiEditError && error.code === "RESUME_AI_EDIT_SECTION_NOT_FOUND",
  );
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

test("moving a result line between projects replaces both complete bodies without retaining the source line", () => {
  const state = createResumeDocumentSeed();
  const section = state.sharedSections.find((item) => item.id === "projects")!;
  (section.content as { items: ItemContent[] }).items = [
    {
      id: "energy-project",
      itemKind: "career-detail",
      meta: "",
      title: "친환경에너지 기상지원 플랫폼",
      subtitle: "",
      body: "기상 데이터 기능 개발\n통계 조회를 15~20초에서 약 1초로 단축\n장애 복구 흐름 구현",
    },
    {
      id: "road-project",
      itemKind: "career-detail",
      meta: "",
      title: "도로기상정보시스템",
      subtitle: "",
      body: "도로기상 집계 로직 개발\n웹 시스템 구현",
    },
  ];
  const context: ResumeAiEditContext = { scope: "role", roleProfileId: state.activeRoleProfileId };
  const prepared = prepareResumeAiEdit(state, context, result(state, context, [
    {
      type: "UPDATE_ITEM",
      sectionId: section.id,
      itemId: "energy-project",
      patch: { body: "기상 데이터 기능 개발\n장애 복구 흐름 구현" },
    },
    {
      type: "UPDATE_ITEM",
      sectionId: section.id,
      itemId: "road-project",
      patch: { body: "도로기상 집계 로직 개발\n통계 조회를 15~20초에서 약 1초로 단축\n웹 시스템 구현" },
    },
  ]));
  const resolved = resolveSection(section, prepared.state.roleProfiles[0]);
  const items = (resolved.content as { items: ItemContent[] }).items;
  const source = items.find((item) => item.id === "energy-project")!;
  const target = items.find((item) => item.id === "road-project")!;

  assert.doesNotMatch(source.body, /15~20초/);
  assert.match(target.body, /15~20초/);
  assert.equal(prepared.changes.length, 2);
  assert.equal(prepared.changes[0].itemEdit?.bodyReplaced, true);
});

test("item replacement wins over a stale item override layered on a role section override", () => {
  const seed = createResumeDocumentSeed();
  const section = seed.sharedSections.find((item) => item.id === "projects")!;
  const item = (section.content as { items: ItemContent[] }).items[0];
  const profileId = seed.activeRoleProfileId;
  const sectionOverride = updateRoleProfileSectionSetting(seed, profileId, section.id, {
    mode: "override",
    content: {
      ...(section.content as { items: ItemContent[] }),
      items: [{ ...item, body: "프로젝트 기본 설명\n통계 조회를 15~20초에서 약 1초로 단축" }],
    },
  });
  const state = updateRoleProfileItemSetting(sectionOverride, profileId, section.id, item.id, {
    mode: "override",
    content: { ...item, body: "이전에 남은 항목 설명\n통계 조회를 15~20초에서 약 1초로 단축" },
  });
  const context: ResumeAiEditContext = { scope: "role", roleProfileId: profileId };
  const prepared = prepareResumeAiEdit(state, context, result(state, context, [{
    type: "UPDATE_ITEM",
    sectionId: section.id,
    itemId: item.id,
    patch: { body: "프로젝트 기본 설명\n장애 복구 흐름 구현" },
  }]));
  const resolved = resolveSection(section, prepared.state.roleProfiles[0]);
  const updated = (resolved.content as { items: ItemContent[] }).items.find((candidate) => candidate.id === item.id)!;

  assert.equal(updated.body, "프로젝트 기본 설명\n장애 복구 흐름 구현");
  assert.doesNotMatch(updated.body, /15~20초/);
  assert.equal(prepared.state.roleProfiles[0].settings.projects.itemSettings?.[item.id]?.content?.body, updated.body);
});

test("variant item replacement stays authoritative across role and variant override layers and persistence parsing", () => {
  const seed = createResumeDocumentSeed();
  const section = seed.sharedSections.find((item) => item.id === "projects")!;
  const item = (section.content as { items: ItemContent[] }).items[0];
  const roleId = seed.activeRoleProfileId;
  const withRoleOverride = updateRoleProfileItemSetting(seed, roleId, section.id, item.id, {
    mode: "override",
    content: { ...item, body: "직군에 남은 과거 성능 문장" },
  });
  const withVariant = createSupportVariant(withRoleOverride, roleId, { name: "지원 버전", company: "지원 회사" });
  const variantId = withVariant.variants[0].id;
  const withSectionOverride = updateSectionSetting(withVariant, variantId, section.id, {
    mode: "override",
    content: section.content,
  });
  const state = updateDocumentItemSetting(withSectionOverride, variantId, section.id, item.id, {
    mode: "override",
    content: { ...item, body: "지원 버전에 남은 과거 성능 문장" },
  });
  const context: ResumeAiEditContext = { scope: "variant", roleProfileId: roleId, variantId };
  const replacementBody = "현재 지원 버전의 최종 본문\n장애 복구 흐름 구현";
  const prepared = prepareResumeAiEdit(state, context, result(state, context, [{
    type: "UPDATE_ITEM",
    sectionId: section.id,
    itemId: item.id,
    patch: { body: replacementBody },
  }]));
  const reparsed = parseResumeDocumentState(JSON.stringify(prepared.state))!;
  const profile = reparsed.roleProfiles.find((candidate) => candidate.id === roleId)!;
  const variant = reparsed.variants.find((candidate) => candidate.id === variantId)!;
  const resolved = resolveSection(reparsed.sharedSections.find((candidate) => candidate.id === section.id)!, profile, variant);
  const updated = (resolved.content as { items: ItemContent[] }).items.find((candidate) => candidate.id === item.id)!;

  assert.equal(updated.body, replacementBody);
  assert.equal(profile.settings.projects.itemSettings?.[item.id]?.content?.body, "직군에 남은 과거 성능 문장");
  assert.equal(variant.settings.projects.itemSettings?.[item.id]?.content?.body, replacementBody);
});

test("the last explicit replacement of one item wins within a single AI edit result", () => {
  const state = createResumeDocumentSeed();
  const section = state.sharedSections.find((item) => item.id === "projects")!;
  const item = (section.content as { items: ItemContent[] }).items[0];
  const context: ResumeAiEditContext = { scope: "role", roleProfileId: state.activeRoleProfileId };
  const prepared = prepareResumeAiEdit(state, context, result(state, context, [
    { type: "UPDATE_ITEM", sectionId: section.id, itemId: item.id, patch: { body: "첫 번째 전체 본문" } },
    { type: "UPDATE_ITEM", sectionId: section.id, itemId: item.id, patch: { body: "두 번째 최종 전체 본문" } },
  ]));
  const resolved = resolveSection(section, prepared.state.roleProfiles[0]);
  const updated = (resolved.content as { items: ItemContent[] }).items.find((candidate) => candidate.id === item.id)!;

  assert.equal(updated.body, "두 번째 최종 전체 본문");
  assert.equal(prepared.changes.length, 2);
});

test("item body line diff exposes removed and added lines before replacement", () => {
  assert.deepEqual(
    diffResumeItemBodyLines("유지 문장\n원본에서 삭제", "유지 문장\n대상에 추가"),
    { removed: ["원본에서 삭제"], added: ["대상에 추가"] },
  );
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

test("single-section JSON edits reject operations targeting another section", () => {
  const state = createResumeDocumentSeed();
  const context: ResumeAiEditContext = { scope: "shared" };
  const edit = result(state, context, [
    { type: "UPDATE_NARRATIVE", sectionId: "summary", body: "허용된 소개" },
    { type: "UPDATE_IDENTITY", sectionId: "profile", patch: { name: "범위 밖 이름" } },
  ]);

  assert.throws(
    () => assertResumeAiEditTargets(edit, ["summary"]),
    (error: unknown) => error instanceof ResumeAiEditError && error.code === "RESUME_AI_EDIT_SECTION_OUT_OF_SCOPE",
  );
});

test("prepared changes include renderable section snapshots and related work context", () => {
  const state = createResumeDocumentSeed();
  const context: ResumeAiEditContext = { scope: "shared" };
  const section = state.sharedSections.find((item) => item.id === "projects")!;
  const item = (section.content as { items: ItemContent[] }).items[0];
  const prepared = prepareResumeAiEdit(state, context, result(state, context, [{
    type: "UPDATE_ITEM",
    sectionId: section.id,
    itemId: item.id,
    patch: { body: "읽기 쉬운 경력 상세" },
  }]));
  const change = prepared.changes[0];

  assert.equal(change.beforeSection.kind, "items");
  assert.equal(change.afterSection.title, section.title);
  assert.equal((change.afterSection.content as { items: ItemContent[] }).items[0].body, "읽기 쉬운 경력 상세");
  assert.ok(change.afterRelatedWorkItems.every((workItem) => workItem.itemKind === "work"));
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
