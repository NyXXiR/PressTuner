import assert from "node:assert/strict";
import test from "node:test";
import {
  addCustomSection,
  addSharedSection,
  addRoleCustomSection,
  assignRoleProfile,
  clearDocumentItemSetting,
  createResumeDocumentSeed,
  createRoleProfile,
  createSupportVariant,
  deleteRoleCustomSection,
  deleteRoleProfile,
  deleteSupportVariant,
  deleteSharedSection,
  duplicateVariant,
  formatItemPeriod,
  inspectExperienceBrickSync,
  inspectResumeReadiness,
  isItemEndMonthEnabled,
  linkExperienceBricks,
  moveSectionInOrder,
  narrativeCharacterCount,
  narrativePlainText,
  orderResumeSections,
  parseResumeDocumentState,
  promoteRoleCustomSectionToShared,
  promoteSupportCustomSectionToShared,
  resolveDocumentRole,
  resolveSection,
  resolveSectionTitle,
  resetRoleProfileSectionToShared,
  resetSupportVariantSectionToRole,
  updateDocumentItemSetting,
  updateRoleProfile,
  updateRoleProfileItemSetting,
  updateRoleProfileSectionOrder,
  updateRoleProfileSectionSetting,
  updateRoleCustomSection,
  updateResumeSectionPageBreak,
  updateSectionOrder,
  updateSectionSetting,
  updateCustomSection,
  updateSharedSection,
  updateSharedSectionOrder,
  updateSharedSectionTitle,
  type IdentityContent,
  type ItemsContent,
} from "./model";

function roleContext() {
  const state = createResumeDocumentSeed();
  const profile = state.roleProfiles.find((item) => item.id === state.activeRoleProfileId)!;
  return { state, profile };
}

test("the default flow has a directly editable role resume and no support version", () => {
  const { state, profile } = roleContext();
  assert.equal(state.version, 5);
  assert.equal(state.variants.length, 0);
  assert.equal(state.activeVariantId, null);
  assert.equal(resolveDocumentRole(profile), "서비스 기획자");
});

test("every starter role resume includes its own editable self-introduction section", () => {
  const state = createResumeDocumentSeed();
  assert.equal(state.templateRevision, 4);
  for (const profile of state.roleProfiles) {
    const coverLetter = profile.customSections.find((section) => section.title === "자기소개서");
    assert.ok(coverLetter);
    assert.equal(coverLetter.kind, "narrative");
    assert.equal(coverLetter.custom, true);
    assert.match(coverLetter.id, new RegExp(`^role-cover-letter-${profile.id}$`));
  }
});

test("new roles receive the default role-only self-introduction template", () => {
  const state = createRoleProfile(createResumeDocumentSeed(), { name: "데이터", roleTitle: "데이터 엔지니어" });
  const profile = state.roleProfiles.at(-1)!;
  assert.equal(profile.customSections.length, 1);
  assert.equal(profile.customSections[0].title, "자기소개서");
  assert.equal(profile.customSections[0].custom, true);
});

test("existing V4 storage receives the role template once without resurrecting a deleted section", () => {
  const legacy = createResumeDocumentSeed();
  const withoutRevision = { ...legacy, templateRevision: undefined, roleProfiles: legacy.roleProfiles.map((profile) => ({ ...profile, customSections: [] })) };
  const upgraded = parseResumeDocumentState(JSON.stringify(withoutRevision))!;
  assert.equal(upgraded.templateRevision, 4);
  assert.ok(upgraded.roleProfiles.every((profile) => profile.customSections.some((section) => section.title === "자기소개서")));

  const deleted = { ...upgraded, roleProfiles: upgraded.roleProfiles.map((profile) => ({ ...profile, customSections: [] })) };
  const reloaded = parseResumeDocumentState(JSON.stringify(deleted))!;
  assert.ok(reloaded.roleProfiles.every((profile) => profile.customSections.length === 0));
});

test("a support version is created only on demand and inherits its role resume", () => {
  const { state, profile } = roleContext();
  const roleState = updateRoleProfileSectionSetting(state, profile.id, "summary", {
    mode: "override",
    content: { body: "백엔드 직군 소개" },
  });
  const created = createSupportVariant(roleState, profile.id, {
    name: "A사 지원 버전",
    company: "A사",
  });
  assert.equal(created.variants.length, 1);
  assert.equal(created.activeVariantId, created.variants[0].id);

  const section = created.sharedSections.find((item) => item.id === "summary")!;
  const role = created.roleProfiles[0];
  assert.deepEqual(resolveSection(section, role, created.variants[0]).content, { body: "백엔드 직군 소개" });

  const customized = updateSectionSetting(created, created.variants[0].id, section.id, {
    mode: "override",
    content: { body: "A사 지원 소개" },
  });
  assert.deepEqual(resolveSection(section, role, customized.variants[0]).content, { body: "A사 지원 소개" });

  const removed = deleteSupportVariant(customized, customized.variants[0].id);
  assert.equal(removed.variants.length, 0);
  assert.equal(removed.activeVariantId, null);
});

test("section titles inherit and can be renamed without copying section content", () => {
  const { state, profile } = roleContext();
  const summary = state.sharedSections.find((item) => item.id === "summary")!;
  const sharedRenamed = updateSharedSectionTitle(state, summary.id, "한 줄 소개");
  const renamedSummary = sharedRenamed.sharedSections.find((item) => item.id === summary.id)!;
  assert.equal(resolveSectionTitle(renamedSummary, sharedRenamed.roleProfiles[0]), "한 줄 소개");

  const roleRenamed = updateRoleProfileSectionSetting(sharedRenamed, profile.id, summary.id, { title: "핵심 역량" });
  assert.equal(resolveSectionTitle(renamedSummary, roleRenamed.roleProfiles[0]), "핵심 역량");
  assert.equal(roleRenamed.roleProfiles[0].settings.summary.content, undefined);

  const withVersion = createSupportVariant(roleRenamed, profile.id, { name: "A사", company: "A사" });
  const versionRenamed = updateSectionSetting(withVersion, withVersion.variants[0].id, summary.id, { title: "A사에서의 강점" });
  assert.equal(resolveSectionTitle(renamedSummary, versionRenamed.roleProfiles[0], versionRenamed.variants[0]), "A사에서의 강점");
});

test("list items can be rewritten, hidden, reordered, and restored at role and version levels", () => {
  const { state, profile } = roleContext();
  const experience = state.sharedSections.find((item) => item.id === "experience")!;
  const [first, second] = (experience.content as ItemsContent).items;
  assert.ok(first && second);
  let next = updateRoleProfileItemSetting(state, profile.id, experience.id, first.id, {
    mode: "override",
    content: { ...first, body: "백엔드 설명" },
  });
  next = updateRoleProfileItemSetting(next, profile.id, experience.id, second.id, { mode: "hidden" });
  next = updateRoleProfileSectionSetting(next, profile.id, experience.id, { itemOrder: [second.id, first.id] });
  next = createSupportVariant(next, profile.id, { name: "A사", company: "A사" });
  const versionId = next.variants[0].id;
  next = updateDocumentItemSetting(next, versionId, experience.id, first.id, {
    mode: "override",
    content: { ...first, body: "A사 설명" },
  });
  const tailored = resolveSection(experience, next.roleProfiles[0], next.variants[0]).content as ItemsContent;
  assert.deepEqual(tailored.items.map((item) => item.id), [first.id]);
  assert.equal(tailored.items[0].body, "A사 설명");
  const restored = clearDocumentItemSetting(next, versionId, experience.id, first.id);
  assert.equal((resolveSection(experience, restored.roleProfiles[0], restored.variants[0]).content as ItemsContent).items[0].body, "백엔드 설명");
});

test("item resolution follows shared, role section, role item, support section, support item precedence", () => {
  const { state, profile } = roleContext();
  const projects = state.sharedSections.find((section) => section.id === "projects")!;
  const item = (projects.content as ItemsContent).items[0];
  let next = updateRoleProfileSectionSetting(state, profile.id, projects.id, {
    mode: "override",
    content: { ...(projects.content as ItemsContent), items: [{ ...item, body: "직군 섹션 본문" }] },
  });
  next = updateRoleProfileItemSetting(next, profile.id, projects.id, item.id, {
    mode: "override",
    content: { ...item, body: "직군 항목 본문" },
  });
  assert.equal((resolveSection(projects, next.roleProfiles[0]).content as ItemsContent).items[0].body, "직군 항목 본문");

  next = createSupportVariant(next, profile.id, { name: "지원 버전", company: "지원 회사" });
  const variantId = next.variants[0].id;
  next = updateSectionSetting(next, variantId, projects.id, {
    mode: "override",
    content: { ...(projects.content as ItemsContent), items: [{ ...item, body: "지원 섹션 본문" }] },
  });
  assert.equal((resolveSection(projects, next.roleProfiles[0], next.variants[0]).content as ItemsContent).items[0].body, "지원 섹션 본문");

  next = updateDocumentItemSetting(next, variantId, projects.id, item.id, {
    mode: "override",
    content: { ...item, body: "지원 항목 본문" },
  });
  assert.equal((resolveSection(projects, next.roleProfiles[0], next.variants[0]).content as ItemsContent).items[0].body, "지원 항목 본문");
  const restored = clearDocumentItemSetting(next, variantId, projects.id, item.id);
  assert.equal((resolveSection(projects, restored.roleProfiles[0], restored.variants[0]).content as ItemsContent).items[0].body, "지원 섹션 본문");
});

test("structured year-month periods format ranges and in-progress experience", () => {
  assert.equal(formatItemPeriod({ meta: "", startMonth: "2024-01", endMonth: "2025-03", isCurrent: false }), "2024.01 — 2025.03");
  assert.equal(formatItemPeriod({ meta: "", startMonth: "2024-01", endMonth: "", isCurrent: true }), "2024.01 — 현재");
  assert.equal(formatItemPeriod({ meta: "한 날짜", startMonth: "2024-01", endMonth: "2025-03", endMonthEnabled: false }), "2024.01");
  assert.equal(formatItemPeriod({ meta: "졸업 연도" }), "졸업 연도");
  assert.equal(isItemEndMonthEnabled({ endMonth: "2025-03" }), true);
  assert.equal(isItemEndMonthEnabled({ endMonth: "2025-03", endMonthEnabled: false }), false);
});

test("pre-feature V5 item metadata remains optional while stored order is unchanged", () => {
  const state = createResumeDocumentSeed();
  const experience = state.sharedSections.find((section) => section.id === "experience")!;
  const content = experience.content as ItemsContent;
  delete content.sortDirection;
  delete content.careerDurationOverrideMonths;
  delete content.careerDurationLabel;
  content.items.reverse();

  const parsed = parseResumeDocumentState(JSON.stringify(state))!;
  const parsedContent = parsed.sharedSections.find((section) => section.id === "experience")!.content as ItemsContent;
  assert.equal(parsed.version, 5);
  assert.equal(parsedContent.sortDirection, undefined);
  assert.equal(parsedContent.careerDurationOverrideMonths, undefined);
  assert.equal(parsedContent.careerDurationLabel, undefined);
  assert.deepEqual(parsedContent.items.map((item) => item.id), content.items.map((item) => item.id));
});

test("experience metadata round-trips and survives layered item resolution", () => {
  const state = createResumeDocumentSeed();
  const experience = state.sharedSections.find((section) => section.id === "experience")!;
  const content = experience.content as ItemsContent;
  content.sortDirection = "oldest-first";
  content.careerDurationOverrideMonths = 62;
  content.careerDurationLabel = "relevant";
  const [first, second] = content.items;
  let tailored = updateRoleProfileItemSetting(state, state.activeRoleProfileId, experience.id, first.id, {
    mode: "override",
    content: { ...first, body: "직군 내용" },
  });
  tailored = updateRoleProfileItemSetting(tailored, state.activeRoleProfileId, experience.id, second.id, { mode: "hidden" });
  tailored = updateRoleProfileSectionSetting(tailored, state.activeRoleProfileId, experience.id, { itemOrder: [second.id, first.id] });

  const parsed = parseResumeDocumentState(JSON.stringify(tailored))!;
  const parsedExperience = parsed.sharedSections.find((section) => section.id === "experience")!;
  const resolved = resolveSection(parsedExperience, parsed.roleProfiles[0]).content as ItemsContent;
  assert.equal(resolved.sortDirection, "oldest-first");
  assert.equal(resolved.careerDurationOverrideMonths, 62);
  assert.equal(resolved.careerDurationLabel, "relevant");
  assert.deepEqual(resolved.items.map((item) => item.id), [first.id]);
  assert.equal(resolved.items[0].body, "직군 내용");
});

test("career detail display labels and independent group titles round-trip", () => {
  const state = createResumeDocumentSeed();
  const projects = state.sharedSections.find((section) => section.id === "projects")!;
  const content = projects.content as ItemsContent;
  content.independentGroupTitle = "개인·오픈소스 프로젝트";
  content.items[0].detailLabel = "AI 제품 구현·검증";

  const parsed = parseResumeDocumentState(JSON.stringify(state))!;
  const parsedContent = parsed.sharedSections.find((section) => section.id === "projects")!.content as ItemsContent;
  assert.equal(parsedContent.independentGroupTitle, "개인·오픈소스 프로젝트");
  assert.equal(parsedContent.items[0].detailLabel, "AI 제품 구현·검증");
});

test("experience brick synchronization retains section presentation metadata", () => {
  const state = createResumeDocumentSeed();
  const experience = state.sharedSections.find((section) => section.id === "experience")!;
  (experience.content as ItemsContent).sortDirection = "oldest-first";
  (experience.content as ItemsContent).careerDurationOverrideMonths = 38;
  const synced = linkExperienceBricks(state, [{
    id: "metadata-brick",
    experienceType: "WORK",
    title: "메타데이터 보존",
    content: "동기화",
    startDate: "2024-01-01T00:00:00.000Z",
    endDate: "2024-06-01T00:00:00.000Z",
  }]);
  const syncedContent = synced.sharedSections.find((section) => section.id === "experience")!.content as ItemsContent;
  assert.equal(syncedContent.sortDirection, "oldest-first");
  assert.equal(syncedContent.careerDurationOverrideMonths, 38);
  assert.equal(syncedContent.items.at(-1)?.endMonthEnabled, true);
});

test("role custom sections belong to the role resume and are inherited by support versions", () => {
  const { state, profile } = roleContext();
  const added = addRoleCustomSection(state, profile.id, { title: "오픈소스", kind: "items", afterSectionId: "summary" });
  const role = added.state.roleProfiles[0];
  assert.equal(role.customSections.length, 2);
  assert.deepEqual(orderResumeSections(added.state.sharedSections, role).slice(0, 3).map((item) => item.id), ["profile", "summary", added.section.id]);

  const withVersion = createSupportVariant(added.state, role.id, { name: "A사", company: "A사" });
  assert.ok(orderResumeSections(withVersion.sharedSections, role, withVersion.variants[0]).some((item) => item.id === added.section.id));
  assert.equal(deleteRoleCustomSection(withVersion, role.id, added.section.id).roleProfiles[0].customSections.length, 1);
});

test("custom highlight sections retain their two-column layout and clone seeded cards", () => {
  const { state, profile } = roleContext();
  const content: ItemsContent = { items: [
    { id: "strength-1", meta: "", title: "문제 구조화", subtitle: "복잡도를 실행 단위로", body: "모호한 문제를 측정 가능한 단계로 나눕니다." },
    { id: "strength-2", meta: "", title: "끝까지 개선", subtitle: "운영 결과까지 확인", body: "배포 후 지표를 확인해 다음 개선으로 연결합니다." },
  ] };
  const added = addRoleCustomSection(state, profile.id, { title: "핵심 역량", kind: "items", layout: "highlight-grid", content, afterSectionId: "summary" });
  content.items[0].title = "원본 변경";

  const section = added.state.roleProfiles[0].customSections.find((item) => item.id === added.section.id)!;
  assert.equal(section.layout, "highlight-grid");
  assert.equal((section.content as ItemsContent).items[0].title, "문제 구조화");
  const parsed = parseResumeDocumentState(JSON.stringify(added.state))!;
  assert.equal(parsed.roleProfiles[0].customSections.find((item) => item.id === section.id)?.layout, "highlight-grid");
});

test("role and support versions keep independent section order", () => {
  const { state, profile } = roleContext();
  const ids = state.sharedSections.map((section) => section.id);
  const coverLetterId = profile.customSections[0].id;
  const roleOrdered = updateRoleProfileSectionOrder(state, profile.id, ["summary", "profile", ...ids.slice(2)]);
  assert.deepEqual(orderResumeSections(roleOrdered.sharedSections, roleOrdered.roleProfiles[0]).map((item) => item.id), ["summary", "profile", ...ids.slice(2), coverLetterId]);
  const withVersion = createSupportVariant(roleOrdered, profile.id, { name: "A사", company: "A사" });
  const versionOrdered = updateSectionOrder(withVersion, withVersion.variants[0].id, ids);
  assert.deepEqual(orderResumeSections(versionOrdered.sharedSections, versionOrdered.roleProfiles[0], versionOrdered.variants[0]).map((item) => item.id), [...ids, coverLetterId]);
});

test("keyboard section movement swaps adjacent sections without crossing boundaries", () => {
  const order = ["profile", "summary", "experience"];

  assert.deepEqual(moveSectionInOrder(order, "summary", -1), ["summary", "profile", "experience"]);
  assert.deepEqual(moveSectionInOrder(order, "summary", 1), ["profile", "experience", "summary"]);
  assert.deepEqual(moveSectionInOrder(order, "profile", -1), order);
  assert.deepEqual(moveSectionInOrder(order, "experience", 1), order);
  assert.deepEqual(moveSectionInOrder(order, "missing", 1), order);
});

test("deleting a role resume also removes only its support versions", () => {
  const first = createResumeDocumentSeed();
  const second = createRoleProfile(first, { name: "기획", roleTitle: "서비스 기획자" });
  const backend = first.roleProfiles[0];
  const planner = second.roleProfiles.at(-1)!;
  let withVersions = createSupportVariant(second, backend.id, { name: "A사", company: "A사" });
  withVersions = createSupportVariant(withVersions, planner.id, { name: "B사", company: "B사" });
  const deleted = deleteRoleProfile(withVersions, planner.id);
  assert.equal(deleted.roleProfiles.some((item) => item.id === planner.id), false);
  assert.equal(deleted.variants.some((item) => item.roleProfileId === planner.id), false);
  assert.equal(deleted.variants.some((item) => item.roleProfileId === backend.id), true);
});

test("experience references remain local snapshots with stable source ids", () => {
  const brick = { id: "local-1", title: "결제 안정화", content: "실패율을 낮춤", period: "2025.01 — 현재", organization: "브리프플로우", roleTitle: "백엔드", experienceType: "PROJECT", tags: [] };
  const linked = linkExperienceBricks(createResumeDocumentSeed(), [brick]);
  const refreshed = linkExperienceBricks(linked, [{ ...brick, content: "실패율을 20% 낮춤" }]);
  const items = (refreshed.sharedSections.find((item) => item.id === "projects")!.content as ItemsContent).items;
  const snapshots = items.filter((item) => item.source?.id === brick.id);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].body, "실패율을 20% 낮춤");
});

test("version 3 implicit base variants migrate into role resumes while company versions stay optional", () => {
  const versionThree = JSON.stringify({
    version: 3,
    activeRoleProfileId: "role-backend",
    activeVariantId: "base",
    sharedSections: [
      { id: "profile", title: "인적사항", kind: "identity", content: { name: "홍길동", email: "hi@example.com", links: [] } },
      { id: "summary", title: "소개", kind: "narrative", content: { body: "공통 소개" } },
    ],
    roleProfiles: [{ id: "role-backend", name: "백엔드", roleTitle: "백엔드 엔지니어", settings: {} }],
    variants: [
      { id: "base", name: "기본 이력서", company: "", role: "", roleProfileId: "role-backend", settings: { summary: { mode: "override", layout: "standard", content: { body: "백엔드 소개" } } }, customSections: [{ id: "custom-open", title: "오픈소스", kind: "items", content: { items: [] }, custom: true, layout: "standard" }] },
      { id: "company", name: "A사", company: "A사", role: "", roleProfileId: "role-backend", settings: {}, customSections: [] },
    ],
  });
  const migrated = parseResumeDocumentState(versionThree)!;
  assert.equal(migrated.version, 5);
  assert.equal(migrated.activeVariantId, null);
  assert.equal(migrated.variants.length, 1);
  assert.equal(migrated.variants[0].company, "A사");
  assert.deepEqual(migrated.roleProfiles[0].settings.summary.content, { body: "백엔드 소개" });
  assert.equal(migrated.roleProfiles[0].customSections[0].title, "오픈소스");
});

test("legacy delimiter state still migrates to a role resume", () => {
  const legacy = JSON.stringify({ version: 1, activeVariantId: "base", sharedSections: [{ id: "profile", title: "인적사항", kind: "identity", content: "홍길동 | 개발자 | hi@example.com\nhttps://example.com" }], variants: [{ id: "base", name: "기본", company: "", role: "백엔드 개발자", settings: {} }] });
  const migrated = parseResumeDocumentState(legacy)!;
  assert.equal(migrated.version, 5);
  assert.equal(migrated.variants.length, 0);
  assert.equal(resolveDocumentRole(migrated.roleProfiles[0]), "백엔드 개발자");
  assert.deepEqual(migrated.sharedSections[0].content, { name: "홍길동", email: "hi@example.com", links: ["https://example.com"] });
});

test("assigning a role profile keeps an existing support version relationship", () => {
  const first = createResumeDocumentSeed();
  const second = createRoleProfile(first, { name: "기획", roleTitle: "서비스 기획자" });
  const withVersion = createSupportVariant(second, first.roleProfiles[0].id, { name: "A사", company: "A사" });
  const assigned = assignRoleProfile(withVersion, withVersion.variants[0].id, second.roleProfiles.at(-1)!.id);
  assert.equal(assigned.variants[0].roleProfileId, second.roleProfiles.at(-1)!.id);
});

test("shared edits continue to flow into inherited role resumes", () => {
  const { state, profile } = roleContext();
  const next = updateSharedSection(state, "summary", { body: "새 공통 소개" });
  const summary = next.sharedSections.find((item) => item.id === "summary")!;
  assert.deepEqual(resolveSection(summary, profile).content, { body: "새 공통 소개" });
});

test("shared identity and eligibility facts flow through role and support resumes and survive local storage", () => {
  const { state, profile } = roleContext();
  const identity = state.sharedSections.find((section) => section.id === "profile")!;
  const details: IdentityContent = {
    ...(identity.content as IdentityContent),
    phone: "010-1234-5678",
    location: "서울 양천구",
    gender: "남성",
    birthDate: "1992-01-01",
  };
  const shared = updateSharedSection(updateSharedSection(state, identity.id, details), "eligibility", {
    militaryStatus: "군필",
    veteranStatus: "비대상",
    disabilityStatus: "비대상",
    employmentProtectionStatus: "비대상",
  });
  const role = shared.roleProfiles[0];
  assert.deepEqual(resolveSection(shared.sharedSections[0], role).content, details);

  const withSupport = createSupportVariant(shared, profile.id, { name: "A사", company: "A사" });
  assert.deepEqual(resolveSection(withSupport.sharedSections[0], withSupport.roleProfiles[0], withSupport.variants[0]).content, details);
  assert.deepEqual(parseResumeDocumentState(JSON.stringify(withSupport))!.sharedSections[0].content, details);
  assert.deepEqual(parseResumeDocumentState(JSON.stringify(withSupport))!.sharedSections.find((section) => section.id === "eligibility")!.content, {
    militaryStatus: "군필",
    veteranStatus: "비대상",
    disabilityStatus: "비대상",
    employmentProtectionStatus: "비대상",
  });
});

test("common information order becomes the inherited PDF order", () => {
  const state = createResumeDocumentSeed();
  const ids = state.sharedSections.map((section) => section.id);
  const coverLetterId = state.roleProfiles[0].customSections[0].id;
  const reordered = updateSharedSectionOrder(state, ["summary", "profile", ...ids.slice(2), "summary", "unknown"]);
  assert.deepEqual(reordered.sharedSections.map((section) => section.id), ["summary", "profile", ...ids.slice(2)]);
  assert.deepEqual(orderResumeSections(reordered.sharedSections, reordered.roleProfiles[0]).map((section) => section.id), ["summary", "profile", ...ids.slice(2, -1), coverLetterId, "eligibility"]);
});

test("role metadata can be edited", () => {
  const { state, profile } = roleContext();
  const updated = updateRoleProfile(state, profile.id, { name: "AI 엔지니어", roleTitle: "AI 플랫폼 엔지니어" });
  assert.equal(updated.roleProfiles[0].name, "AI 엔지니어");
  assert.equal(resolveDocumentRole(updated.roleProfiles[0]), "AI 플랫폼 엔지니어");
});

test("fresh documents start with service planning, full-stack, and AI engineering role resumes", () => {
  const state = createResumeDocumentSeed();
  assert.deepEqual(state.roleProfiles.map((profile) => [profile.name, profile.roleTitle]), [
    ["서비스기획", "서비스 기획자"],
    ["풀스택", "풀스택 엔지니어"],
    ["AI 엔지니어", "AI 엔지니어"],
  ]);
  assert.equal(state.activeRoleProfileId, state.roleProfiles[0].id);
});

test("fresh documents keep employment and career details in two common sections", () => {
  const state = createResumeDocumentSeed();
  const experience = state.sharedSections.find((section) => section.id === "experience")!;
  const projects = state.sharedSections.find((section) => section.id === "projects")!;
  assert.equal(experience.title, "경력");
  assert.equal(projects.title, "경력 상세");
  assert.ok(state.sharedSections.indexOf(projects) === state.sharedSections.indexOf(experience) + 1);
  assert.equal(state.sharedSections.some((section) => section.id === "careerDescriptions"), false);
  assert.ok((experience.content as ItemsContent).items.every((item) => item.itemKind === "work"));
  assert.ok((projects.content as ItemsContent).items.every((item) => item.itemKind === "career-detail"));
  for (const profile of state.roleProfiles) assert.equal(profile.sectionOrder?.includes("careerDescriptions"), false);
});

test("revision 2 documents migrate projects directly into canonical career details", () => {
  const state = createResumeDocumentSeed();
  state.templateRevision = 2;
  state.sharedSections = state.sharedSections.filter((section) => section.id !== "careerDescriptions");
  const projects = state.sharedSections.find((section) => section.id === "projects")!;
  projects.title = "프로젝트 · 경력기술";
  projects.content = { items: [{ id: "kept-project", itemKind: "project", meta: "", title: "결제 전환", subtitle: "리드", body: "성과" }] };
  for (const profile of state.roleProfiles) profile.sectionOrder = profile.sectionOrder?.filter((id) => id !== "careerDescriptions");

  const migrated = parseResumeDocumentState(JSON.stringify(state))!;
  assert.equal(migrated.templateRevision, 4);
  assert.equal(migrated.sharedSections.find((section) => section.id === "projects")?.title, "경력 상세");
  assert.deepEqual(
    (migrated.sharedSections.find((section) => section.id === "projects")!.content as ItemsContent).items.map((item) => item.id),
    ["kept-project"],
  );
  assert.equal(migrated.sharedSections.some((section) => section.id === "careerDescriptions"), false);
  assert.equal((migrated.sharedSections.find((section) => section.id === "projects")!.content as ItemsContent).items[0].itemKind, "career-detail");
});

test("revision 3 career buckets merge without item loss and rewrite collisions, layers, orders, and ledger targets", () => {
  const state = createResumeDocumentSeed();
  state.templateRevision = 3;
  const projects = state.sharedSections.find((section) => section.id === "projects")!;
  projects.title = "대표 프로젝트";
  projects.content = { sortDirection: "oldest-first", items: [
    { id: "collision", itemKind: "project", meta: "", title: "프로젝트 A", subtitle: "", body: "공통 프로젝트" },
  ] };
  state.sharedSections.splice(state.sharedSections.indexOf(projects) + 1, 0, {
    id: "careerDescriptions",
    title: "경력기술서",
    kind: "items",
    content: { sortDirection: "latest-first", items: [
      { id: "collision", itemKind: "career-description", meta: "", title: "책임 A", subtitle: "", body: "공통 책임" },
      { id: "detail-b", itemKind: "career-description", meta: "", title: "개선 B", subtitle: "", body: "공통 개선" },
    ] },
  });
  const profile = state.roleProfiles[0];
  profile.sectionOrder = ["profile", "careerDescriptions", "projects", "summary"];
  profile.settings.projects = { mode: "override", layout: "cards", content: { items: [
    { id: "collision", itemKind: "project", meta: "", title: "프로젝트 A", subtitle: "", body: "직군 프로젝트" },
  ] } };
  profile.settings.careerDescriptions = { mode: "override", layout: "compact", content: { items: [
    { id: "collision", itemKind: "career-description", meta: "", title: "책임 A", subtitle: "", body: "직군 책임" },
  ] } };
  const itemTailoredProfile = state.roleProfiles[1];
  itemTailoredProfile.settings.projects = { mode: "inherit", layout: "standard", itemSettings: { collision: { mode: "hidden" } }, itemOrder: ["collision"] };
  itemTailoredProfile.settings.careerDescriptions = { mode: "inherit", layout: "standard", itemSettings: { "detail-b": { mode: "override", content: { id: "detail-b", itemKind: "career-description", meta: "", title: "개선 B", subtitle: "", body: "직군별 개선" } } }, itemOrder: ["detail-b", "collision"] };
  state.variants.push({
    id: "support-a", name: "A사", company: "A사", role: "", roleProfileId: profile.id,
    sectionOrder: ["careerDescriptions", "summary", "projects"], customSections: [],
    settings: {
      projects: { mode: "hidden", layout: "standard" },
      careerDescriptions: { mode: "override", layout: "standard", content: { items: [{ id: "detail-b", itemKind: "career-description", meta: "", title: "개선 B", subtitle: "", body: "지원본 개선" }] } },
    },
  });
  state.activeVariantId = "support-a";
  state.importLedger = [{ candidateKey: "legacy", payloadHash: "hash", targetSectionId: "careerDescriptions", appliedAt: "2026-01-01T00:00:00.000Z" }];

  const migrated = parseResumeDocumentState(JSON.stringify(state))!;
  const canonical = migrated.sharedSections.find((section) => section.id === "projects")!;
  const items = (canonical.content as ItemsContent).items;
  assert.equal(migrated.templateRevision, 4);
  assert.equal(canonical.title, "대표 프로젝트");
  assert.deepEqual(items.map((item) => item.title), ["프로젝트 A", "책임 A", "개선 B"]);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.ok(items.every((item) => item.itemKind === "career-detail"));
  assert.deepEqual(profile.sectionOrder && migrated.roleProfiles[0].sectionOrder?.slice(0, 3), ["profile", "projects", "summary"]);
  const resolved = resolveSection(canonical, migrated.roleProfiles[0]).content as ItemsContent;
  assert.deepEqual(resolved.items.map((item) => item.body), ["직군 프로젝트", "직군 책임"]);
  const itemTailored = resolveSection(canonical, migrated.roleProfiles[1]).content as ItemsContent;
  assert.deepEqual(itemTailored.items.map((item) => [item.title, item.body]), [["개선 B", "직군별 개선"], ["책임 A", "공통 책임"]]);
  assert.equal(migrated.roleProfiles[1].settings.careerDescriptions, undefined);
  assert.equal(migrated.roleProfiles[1].settings.projects.itemSettings?.collision?.mode, "hidden");
  const support = migrated.variants[0];
  assert.deepEqual((resolveSection(canonical, migrated.roleProfiles[0], support).content as ItemsContent).items.map((item) => item.body), ["지원본 개선"]);
  assert.deepEqual(support.sectionOrder, ["projects", "summary"]);
  assert.equal(support.settings.careerDescriptions, undefined);
  assert.equal(migrated.importLedger[0].targetSectionId, "projects");
  assert.deepEqual(parseResumeDocumentState(JSON.stringify(migrated)), migrated);
});

test("stored mixed experience items are classified and moved into the project section", () => {
  const state = createResumeDocumentSeed();
  state.templateRevision = 1;
  state.sharedSections = state.sharedSections.filter((section) => section.id !== "projects");
  const experience = state.sharedSections.find((section) => section.id === "experience")!;
  experience.title = "경력 · 프로젝트";
  experience.content = { sortDirection: "latest-first", careerDurationOverrideMonths: 62, items: [
    { id: "work", itemKind: "work", meta: "", title: "샘플테크", subtitle: "개발팀", body: "재직 경력" },
    { id: "project", itemKind: "project", meta: "", title: "결제 전환", subtitle: "리드", body: "성과" },
    { id: "legacy-project", meta: "", title: "검색 고도화 프로젝트", subtitle: "샘플테크", body: "성과" },
    { id: "legacy-work", meta: "", title: "다른회사", subtitle: "플랫폼팀", body: "재직" },
  ] };
  for (const profile of state.roleProfiles) profile.sectionOrder = profile.sectionOrder?.filter((id) => id !== "projects");

  const migrated = parseResumeDocumentState(JSON.stringify(state))!;
  const workItems = (migrated.sharedSections.find((section) => section.id === "experience")!.content as ItemsContent).items;
  const projectItems = (migrated.sharedSections.find((section) => section.id === "projects")!.content as ItemsContent).items;
  assert.deepEqual(workItems.map((item) => [item.id, item.itemKind]), [["work", "work"], ["legacy-work", "work"]]);
  assert.deepEqual(projectItems.map((item) => [item.id, item.itemKind]), [["project", "career-detail"], ["legacy-project", "career-detail"]]);
  assert.equal((migrated.sharedSections.find((section) => section.id === "experience")!.content as ItemsContent).careerDurationOverrideMonths, 62);
  assert.ok(migrated.roleProfiles.every((profile) => profile.sectionOrder?.includes("projects")));
});

test("an untouched generic V4 seed upgrades to the three starter roles", () => {
  const generic = createResumeDocumentSeed();
  generic.roleProfiles = [{ id: "role-general", name: "기본 직군", roleTitle: "지원 직무", settings: {}, customSections: [] }];
  generic.activeRoleProfileId = "role-general";
  const parsed = parseResumeDocumentState(JSON.stringify(generic))!;
  assert.deepEqual(parsed.roleProfiles.map((profile) => profile.name), ["서비스기획", "풀스택", "AI 엔지니어"]);
});

test("a customized generic V4 role becomes service planning without losing its edits", () => {
  const generic = createResumeDocumentSeed();
  generic.roleProfiles = [{ id: "role-general", name: "기본 직군", roleTitle: "지원 직무", settings: { summary: { mode: "override", layout: "standard", content: { body: "내 소개" } } }, customSections: [] }];
  generic.activeRoleProfileId = "role-general";
  const parsed = parseResumeDocumentState(JSON.stringify(generic))!;
  assert.equal(parsed.roleProfiles.length, 3);
  assert.equal(parsed.roleProfiles[0].name, "서비스기획");
  assert.deepEqual(parsed.roleProfiles[0].settings.summary.content, { body: "내 소개" });
});

test("the legacy 기본 이력서 직군 name upgrades without clearing localStorage", () => {
  const legacyV4 = createResumeDocumentSeed();
  legacyV4.roleProfiles = [{ id: "migrated-role-base", name: "기본 이력서 직군", roleTitle: "지원 직무", settings: { summary: { mode: "override", layout: "standard", content: { body: "기존 내용" } } }, customSections: [] }];
  legacyV4.activeRoleProfileId = "migrated-role-base";
  legacyV4.variants = [{ id: "company-a", name: "A사", company: "A사", role: "", roleProfileId: "migrated-role-base", settings: {}, customSections: [] }];
  legacyV4.activeVariantId = "company-a";
  const parsed = parseResumeDocumentState(JSON.stringify(legacyV4))!;
  assert.deepEqual(parsed.roleProfiles.map((profile) => profile.name), ["서비스기획", "풀스택", "AI 엔지니어"]);
  assert.deepEqual(parsed.roleProfiles[0].settings.summary.content, { body: "기존 내용" });
  assert.equal(parsed.variants[0].roleProfileId, parsed.roleProfiles[0].id);
  assert.equal(parsed.activeVariantId, "company-a");
});

test("identity content safely round-trips an optional local photo", () => {
  const state = createResumeDocumentSeed();
  const identity = state.sharedSections.find((section) => section.id === "profile")!;
  state.sharedSections = state.sharedSections.map((section) => section.id === identity.id
    ? { ...section, content: { ...(section.content as { name: string; email: string; links: string[] }), photo: "data:image/jpeg;base64,local", photoName: "passport.jpg" } }
    : section);
  const parsed = parseResumeDocumentState(JSON.stringify(state))!;
  assert.equal((parsed.sharedSections[0].content as { photo?: string }).photo, "data:image/jpeg;base64,local");
});

test("structured narrative formatting keeps safe blocks, bold runs, and useful counts", () => {
  const content = {
    body: "핵심 역량\n문제를 해결합니다.",
    blocks: [
      { id: "heading", type: "h2" as const, runs: [{ text: "핵심 ", bold: false }, { text: "역량", bold: true }] },
      { id: "body", type: "p" as const, runs: [{ text: "문제를 해결합니다.", bold: false }] },
    ],
  };
  assert.equal(narrativePlainText(content), "핵심 역량\n문제를 해결합니다.");
  assert.equal(narrativeCharacterCount(content), "핵심 역량문제를 해결합니다.".length);
  const state = updateSharedSection(createResumeDocumentSeed(), "summary", content);
  const parsed = parseResumeDocumentState(JSON.stringify(state))!;
  assert.deepEqual((parsed.sharedSections.find((section) => section.id === "summary")!.content as typeof content).blocks, content.blocks);
});

test("legacy narrative body remains the plain-text fallback", () => {
  assert.equal(narrativePlainText({ body: "기존 소개글" }), "기존 소개글");
  assert.equal(narrativeCharacterCount({ body: "기존 소개글" }), 6);
});

test("support versions duplicate as independent active snapshots", () => {
  const { state, profile } = roleContext();
  const created = createSupportVariant(state, profile.id, { name: "A사 지원", company: "A사" });
  const source = created.variants[0];
  const tailored = updateSectionSetting(created, source.id, "summary", { mode: "override", content: { body: "A사 전용 소개" } });
  const duplicated = duplicateVariant(tailored, source.id);
  const copy = duplicated.variants.at(-1)!;

  assert.notEqual(copy.id, source.id);
  assert.equal(copy.name, "A사 지원 복사본");
  assert.equal(duplicated.activeVariantId, copy.id);
  assert.deepEqual(copy.settings, tailored.variants[0].settings);
  assert.notEqual(copy.settings, tailored.variants[0].settings);
});

test("page breaks inherit from a role and can be overridden by a support version", () => {
  const { state, profile } = roleContext();
  const roleState = updateRoleProfileSectionSetting(state, profile.id, "experience", { pageBreakBefore: true });
  const section = roleState.sharedSections.find((item) => item.id === "experience")!;
  assert.equal(resolveSection(section, roleState.roleProfiles[0]).pageBreakBefore, true);

  const withVariant = createSupportVariant(roleState, profile.id, { name: "B사", company: "B사" });
  const variant = withVariant.variants[0];
  const documentState = updateSectionSetting(withVariant, variant.id, "experience", { pageBreakBefore: false });
  assert.equal(resolveSection(section, documentState.roleProfiles[0], documentState.variants[0]).pageBreakBefore, false);
});

test("manual PDF page breaks update standard, role-custom, and support-custom sections in their current document", () => {
  const { state, profile } = roleContext();
  const roleBroken = updateResumeSectionPageBreak(state, profile.id, undefined, "experience", true);
  assert.equal(roleBroken.roleProfiles[0].settings.experience.pageBreakBefore, true);

  const roleCustom = addRoleCustomSection(roleBroken, profile.id, { title: "기타", kind: "tags" });
  const roleCustomBroken = updateResumeSectionPageBreak(roleCustom.state, profile.id, undefined, roleCustom.section.id, true);
  assert.equal(roleCustomBroken.roleProfiles[0].customSections.find((section) => section.id === roleCustom.section.id)?.pageBreakBefore, true);

  const withVariant = createSupportVariant(roleCustomBroken, profile.id, { name: "지원본", company: "회사" });
  const variant = withVariant.variants[0];
  const supportCustom = addCustomSection(withVariant, variant.id, { title: "추가 성과", kind: "items" });
  const supportCustomBroken = updateResumeSectionPageBreak(supportCustom.state, profile.id, variant.id, supportCustom.section.id, true);
  assert.equal(supportCustomBroken.variants[0].customSections.find((section) => section.id === supportCustom.section.id)?.pageBreakBefore, true);
});

test("readiness inspection reports advisory identity, company, content, and period issues", () => {
  const { state, profile } = roleContext();
  const broken = createSupportVariant(state, profile.id, { name: "검토본", company: "" });
  broken.sharedSections = broken.sharedSections.map((section) => {
    if (section.id === "profile") return { ...section, content: { name: "", email: "not-an-email", links: ["portfolio"] } };
    if (section.id === "summary") return { ...section, content: { body: "" } };
    if (section.id === "experience") return { ...section, content: { items: [{ id: "broken", meta: "", startMonth: "2025-01", endMonth: "2024-12", title: "", subtitle: "", body: "" }] } };
    return section;
  });

  const codes = inspectResumeReadiness(broken, profile.id, broken.variants[0].id).map((issue) => issue.code);
  assert.ok(codes.includes("missing-name"));
  assert.ok(codes.includes("invalid-email"));
  assert.ok(codes.includes("invalid-link"));
  assert.ok(codes.includes("missing-company"));
  assert.ok(codes.includes("empty-section"));
  assert.ok(codes.includes("missing-item-title"));
  assert.ok(codes.includes("missing-item-body"));
  assert.ok(codes.includes("reversed-period"));
});

test("a role override can be explicitly reset so later common edits flow through", () => {
  const { state, profile } = roleContext();
  const tailored = updateRoleProfileSectionSetting(state, profile.id, "profile", { mode: "override", title: "지원자", content: { name: "직군 이름", email: "role@example.com", links: [] } });
  const changedCommon = updateSharedSection(tailored, "profile", { name: "공통 이름", email: "common@example.com", links: [] });
  const section = changedCommon.sharedSections.find((item) => item.id === "profile")!;
  assert.equal((resolveSection(section, changedCommon.roleProfiles[0]).content as { name: string }).name, "직군 이름");

  const reset = resetRoleProfileSectionToShared(changedCommon, profile.id, "profile");
  assert.equal(reset.roleProfiles[0].settings.profile, undefined);
  assert.equal((resolveSection(section, reset.roleProfiles[0]).content as { name: string }).name, "공통 이름");
  assert.equal(resolveSectionTitle(section, reset.roleProfiles[0]), "인적사항");
});

test("shared sections can be added in order and are inherited by every role", () => {
  const state = createResumeDocumentSeed();
  const result = addSharedSection(state, { title: "오픈소스", kind: "narrative", afterSectionId: "summary" });
  const ids = result.state.sharedSections.map((section) => section.id);
  assert.equal(ids[ids.indexOf("summary") + 1], result.section.id);
  assert.equal(result.section.sharedCustom, true);
  assert.equal(result.section.custom, undefined);
  for (const profile of result.state.roleProfiles) assert.equal(resolveSection(result.section, profile).source, "shared");
});

test("a role-only custom section can move into common information without losing its content or position", () => {
  const { state, profile } = roleContext();
  const added = addRoleCustomSection(state, profile.id, { title: "핵심 프로젝트", kind: "narrative", afterSectionId: "summary" });
  const tailored = updateRoleCustomSection(added.state, profile.id, added.section.id, {
    content: { body: "프로젝트 설명" },
    layout: "cards",
    pageBreakBefore: true,
  });

  const promoted = promoteRoleCustomSectionToShared(tailored, profile.id, added.section.id);
  const common = promoted.sharedSections.find((section) => section.id === added.section.id)!;
  const sourceProfile = promoted.roleProfiles.find((item) => item.id === profile.id)!;
  const otherProfile = promoted.roleProfiles.find((item) => item.id !== profile.id)!;

  assert.equal(common.sharedCustom, true);
  assert.equal(common.custom, undefined);
  assert.deepEqual(common.content, { body: "프로젝트 설명" });
  assert.equal(common.layout, "cards");
  assert.equal(common.pageBreakBefore, true);
  assert.equal(sourceProfile.customSections.some((section) => section.id === common.id), false);
  const sourceOrder = orderResumeSections(promoted.sharedSections, sourceProfile).map((section) => section.id);
  assert.equal(sourceOrder[sourceOrder.indexOf("summary") + 1], common.id);
  assert.ok(orderResumeSections(promoted.sharedSections, otherProfile).some((section) => section.id === common.id));
});

test("a support-only custom section can move into common information while retaining its support order", () => {
  const { state, profile } = roleContext();
  const withSupport = createSupportVariant(state, profile.id, { name: "A사 지원", company: "A사" });
  const variant = withSupport.variants[0];
  const added = addCustomSection(withSupport, variant.id, { title: "지원 동기", kind: "narrative", afterSectionId: "experience" });
  const tailored = updateCustomSection(added.state, variant.id, added.section.id, {
    content: { body: "A사에서 시작한 동기" },
    layout: "compact",
  });

  const promoted = promoteSupportCustomSectionToShared(tailored, variant.id, added.section.id);
  const common = promoted.sharedSections.find((section) => section.id === added.section.id)!;
  const sourceVariant = promoted.variants.find((item) => item.id === variant.id)!;
  const sourceProfile = promoted.roleProfiles.find((item) => item.id === profile.id)!;

  assert.equal(common.sharedCustom, true);
  assert.equal(common.custom, undefined);
  assert.deepEqual(common.content, { body: "A사에서 시작한 동기" });
  assert.equal(sourceVariant.customSections.some((section) => section.id === common.id), false);
  const sourceOrder = orderResumeSections(promoted.sharedSections, sourceProfile, sourceVariant).map((section) => section.id);
  assert.equal(sourceOrder[sourceOrder.indexOf("experience") + 1], common.id);
  assert.ok(promoted.roleProfiles.every((item) => orderResumeSections(promoted.sharedSections, item).some((section) => section.id === common.id)));
});

test("deleting a shared section removes dependent role and support settings and order references", () => {
  const { state, profile } = roleContext();
  const withVariant = createSupportVariant(state, profile.id, { name: "A사", company: "A사" });
  const roleTailored = updateRoleProfileSectionSetting(withVariant, profile.id, "summary", { mode: "override" });
  const documentTailored = updateSectionSetting(roleTailored, withVariant.variants[0].id, "summary", { mode: "override" });
  documentTailored.roleProfiles[0].sectionOrder = ["profile", "summary"];
  documentTailored.variants[0].sectionOrder = ["summary", "profile"];

  const deleted = deleteSharedSection(documentTailored, "summary");
  assert.equal(deleted.sharedSections.some((section) => section.id === "summary"), false);
  assert.equal(deleted.roleProfiles[0].settings.summary, undefined);
  assert.equal(deleted.variants[0].settings.summary, undefined);
  assert.equal(deleted.roleProfiles[0].sectionOrder?.includes("summary"), false);
  assert.equal(deleted.variants[0].sectionOrder?.includes("summary"), false);
});

test("a support override reset removes content and title so the role resume becomes authoritative again", () => {
  const { state, profile } = roleContext();
  const roleState = updateRoleProfileSectionSetting(state, profile.id, "summary", { mode: "override", title: "직군 소개", content: { body: "직군 내용" } });
  const withVariant = createSupportVariant(roleState, profile.id, { name: "지원본", company: "A사" });
  const variant = withVariant.variants[0];
  const documentState = updateSectionSetting(withVariant, variant.id, "summary", { mode: "override", title: "지원 소개", content: { body: "지원 내용" } });
  const section = documentState.sharedSections.find((item) => item.id === "summary")!;
  assert.equal(resolveSectionTitle(section, documentState.roleProfiles[0], documentState.variants[0]), "지원 소개");

  const reset = resetSupportVariantSectionToRole(documentState, variant.id, "summary");
  assert.equal(reset.variants[0].settings.summary, undefined);
  assert.equal(resolveSectionTitle(section, reset.roleProfiles[0], reset.variants[0]), "직군 소개");
  assert.deepEqual(resolveSection(section, reset.roleProfiles[0], reset.variants[0]).content, { body: "직군 내용" });
});

test("V4 identity facts migrate into a dedicated V5 eligibility footer across every layer", () => {
  const v4 = {
    version: 4,
    templateRevision: 1,
    activeRoleProfileId: "role-a",
    activeVariantId: "variant-a",
    sharedSections: [
      {
        id: "profile",
        title: "인적사항",
        kind: "identity",
        content: {
          name: "공통 이름",
          email: "common@example.com",
          birthDate: "1990-01-01",
          gender: "여성",
          militaryStatus: "공통 병역",
          veteranStatus: "공통 보훈",
          disabilityStatus: "공통 장애",
          employmentProtectionStatus: "공통 취업보호",
          links: [],
        },
      },
      { id: "experience", title: "경력 · 프로젝트", kind: "items", content: { items: [] } },
    ],
    roleProfiles: [
      {
        id: "role-a",
        name: "직군 A",
        roleTitle: "개발자",
        sectionOrder: ["profile", "experience", "role-letter"],
        customSections: [{ id: "role-letter", title: "자기소개서", kind: "narrative", content: { body: "직군 소개" }, custom: true }],
        settings: {
          profile: {
            mode: "override",
            layout: "cards",
            title: "지원자",
            content: {
              name: "직군 이름",
              email: "role@example.com",
              birthDate: "1991-02-02",
              gender: "남성",
              militaryStatus: "직군 병역",
              veteranStatus: "직군 보훈",
              disabilityStatus: "직군 장애",
              employmentProtectionStatus: "직군 취업보호",
              links: [],
            },
          },
        },
      },
      {
        id: "role-hidden",
        name: "숨김 직군",
        roleTitle: "기획자",
        sectionOrder: ["profile", "experience"],
        customSections: [],
        settings: { profile: { mode: "hidden", layout: "standard", title: "숨긴 인적사항" } },
      },
    ],
    variants: [
      {
        id: "variant-a",
        name: "A사",
        company: "A사",
        role: "",
        roleProfileId: "role-a",
        sectionOrder: ["experience", "profile", "role-letter", "variant-letter"],
        customSections: [{ id: "variant-letter", title: "지원 동기", kind: "narrative", content: { body: "A사 동기" }, custom: true }],
        settings: {
          profile: {
            mode: "override",
            layout: "compact",
            content: {
              name: "지원 이름",
              email: "variant@example.com",
              militaryStatus: "지원 병역",
              veteranStatus: "지원 보훈",
              disabilityStatus: "지원 장애",
              employmentProtectionStatus: "지원 취업보호",
              links: [],
            },
          },
        },
      },
      {
        id: "variant-hidden",
        name: "숨김 지원본",
        company: "B사",
        role: "",
        roleProfileId: "role-a",
        sectionOrder: ["profile", "experience"],
        customSections: [],
        settings: { profile: { mode: "hidden", layout: "standard" } },
      },
    ],
  };

  const migrated = parseResumeDocumentState(JSON.stringify(v4))!;
  assert.equal(migrated.version, 5);
  const profile = migrated.sharedSections.find((section) => section.id === "profile")!;
  const eligibility = migrated.sharedSections.find((section) => section.id === "eligibility")!;
  assert.equal(eligibility.kind, "eligibility");
  assert.equal(eligibility.title, "병역 · 보훈 · 장애 · 취업보호");
  assert.deepEqual(eligibility.content, {
    militaryStatus: "공통 병역",
    veteranStatus: "공통 보훈",
    disabilityStatus: "공통 장애",
    employmentProtectionStatus: "공통 취업보호",
  });
  for (const key of ["militaryStatus", "veteranStatus", "disabilityStatus", "employmentProtectionStatus"]) {
    assert.equal(key in profile.content, false);
  }

  const role = migrated.roleProfiles.find((item) => item.id === "role-a")!;
  assert.equal(role.settings.profile.title, "지원자");
  assert.equal("militaryStatus" in role.settings.profile.content!, false);
  assert.deepEqual(role.settings.eligibility.content, {
    militaryStatus: "직군 병역",
    veteranStatus: "직군 보훈",
    disabilityStatus: "직군 장애",
    employmentProtectionStatus: "직군 취업보호",
  });
  assert.equal(role.settings.eligibility.title, undefined);
  assert.equal(migrated.roleProfiles.find((item) => item.id === "role-hidden")!.settings.eligibility.mode, "hidden");

  const variant = migrated.variants.find((item) => item.id === "variant-a")!;
  assert.deepEqual(variant.settings.eligibility.content, {
    militaryStatus: "지원 병역",
    veteranStatus: "지원 보훈",
    disabilityStatus: "지원 장애",
    employmentProtectionStatus: "지원 취업보호",
  });
  assert.equal(migrated.variants.find((item) => item.id === "variant-hidden")!.settings.eligibility.mode, "hidden");
  assert.equal(role.sectionOrder!.at(-1), "eligibility");
  assert.equal(variant.sectionOrder!.at(-1), "eligibility");
});

test("V1, V2, and V3 storage all finish the migration chain at V5", () => {
  const v1 = { version: 1, activeVariantId: "base", sharedSections: [{ id: "profile", title: "인적사항", kind: "identity", content: "홍길동 | 개발자 | hi@example.com" }], variants: [{ id: "base", name: "기본", company: "", role: "개발자", settings: {} }] };
  const v2 = { version: 2, activeVariantId: "base", sharedSections: [{ id: "profile", title: "인적사항", kind: "identity", content: { name: "홍길동", email: "hi@example.com", role: "개발자", links: [] } }], variants: [{ id: "base", name: "기본", company: "", role: "개발자", settings: {}, customSections: [] }] };
  const v3 = { version: 3, activeRoleProfileId: "role-a", activeVariantId: "base", sharedSections: [{ id: "profile", title: "인적사항", kind: "identity", content: { name: "홍길동", email: "hi@example.com", links: [] } }], roleProfiles: [{ id: "role-a", name: "개발", roleTitle: "개발자", settings: {} }], variants: [{ id: "base", name: "기본", company: "", role: "", roleProfileId: "role-a", settings: {}, customSections: [] }] };
  for (const fixture of [v1, v2, v3]) {
    const migrated = parseResumeDocumentState(JSON.stringify(fixture))!;
    assert.equal(migrated.version, 5);
    assert.equal(migrated.sharedSections.at(-1)?.id, "eligibility");
  }
});

test("parsing V5 does not recreate an intentionally deleted eligibility section", () => {
  const state = deleteSharedSection(createResumeDocumentSeed(), "eligibility");
  const parsed = parseResumeDocumentState(JSON.stringify(state))!;
  assert.equal(parsed.version, 5);
  assert.equal(parsed.sharedSections.some((section) => section.id === "eligibility"), false);
});

test("fresh roles and support versions keep custom sections before the eligibility footer", () => {
  let state = createResumeDocumentSeed();
  assert.equal(state.version, 5);
  for (const profile of state.roleProfiles) {
    assert.equal(orderResumeSections(state.sharedSections, profile).at(-1)?.id, "eligibility");
  }
  const profile = state.roleProfiles[0];
  const roleAdded = addRoleCustomSection(state, profile.id, { title: "직군 추가", kind: "narrative" });
  state = createSupportVariant(roleAdded.state, profile.id, { name: "A사", company: "A사" });
  const variant = state.variants[0];
  const supportAdded = addCustomSection(state, variant.id, { title: "지원 추가", kind: "narrative" });
  const ordered = orderResumeSections(supportAdded.state.sharedSections, supportAdded.state.roleProfiles[0], supportAdded.state.variants[0]);
  assert.equal(ordered.at(-1)?.id, "eligibility");
  assert.ok(ordered.findIndex((section) => section.id === roleAdded.section.id) < ordered.length - 1);
  assert.ok(ordered.findIndex((section) => section.id === supportAdded.section.id) < ordered.length - 1);

  const hidden = updateSectionSetting(supportAdded.state, variant.id, "eligibility", { mode: "hidden" });
  const eligibility = hidden.sharedSections.find((section) => section.id === "eligibility")!;
  assert.equal(resolveSection(eligibility, hidden.roleProfiles[0], hidden.variants[0]).mode, "hidden");
  const moved = updateSectionOrder(hidden, variant.id, ["eligibility", ...ordered.map((section) => section.id)]);
  assert.equal(orderResumeSections(moved.sharedSections, moved.roleProfiles[0], moved.variants[0])[0].id, "eligibility");
});

test("bulk brick synchronization is deterministic, non-destructive, and refreshes only returned snapshots", () => {
  const state = createResumeDocumentSeed();
  const experience = state.sharedSections.find((section) => section.id === "experience")!;
  experience.content = { items: [
    { id: "manual", meta: "직접 입력", title: "수동 프로젝트", subtitle: "", body: "유지" },
    { id: "stable-local", meta: "이전", title: "기존 A", subtitle: "", body: "이전 A", source: { type: "experience-brick", id: "brick-a" } },
    { id: "duplicate-local", meta: "중복", title: "중복 A", subtitle: "", body: "삭제될 중복", source: { type: "experience-brick", id: "brick-a" } },
    { id: "stale-local", meta: "보존", title: "서버에 없는 B", subtitle: "", body: "그대로", source: { type: "experience-brick", id: "brick-missing" } },
  ] };
  const bricks = [
    { id: "brick-a", title: "새 A", content: "갱신 A", organization: "회사", roleTitle: "리드", experienceType: "PROJECT", startDate: "2024-03-31T23:59:59.000Z", endDate: "2025-05-01T00:00:00.000Z", isCurrent: false, period: "legacy A", tags: ["TypeScript"] },
    { id: "brick-a", title: "무시될 중복", content: "무시", organization: null, roleTitle: null, experienceType: "WORK", startDate: null, endDate: null, isCurrent: true, period: null, tags: [] },
    { id: "brick-new", title: "새 B", content: "추가 B", organization: null, roleTitle: null, experienceType: "ACTIVITY", startDate: "2023-01-15T00:00:00.000Z", endDate: null, isCurrent: true, period: "2023.01 - Present", tags: ["협업"] },
  ];

  const synced = linkExperienceBricks(state, bricks);
  const items = (synced.sharedSections.find((section) => section.id === "experience")!.content as ItemsContent).items;
  const projectItems = (synced.sharedSections.find((section) => section.id === "projects")!.content as ItemsContent).items;
  assert.deepEqual(items.map((item) => item.id), ["manual", "stale-local"]);
  assert.equal(items[0].body, "유지");
  assert.deepEqual(projectItems.at(-2), {
    id: "stable-local",
    itemKind: "career-detail",
    detailType: "project",
    meta: "legacy A",
    startMonth: "2024-03",
    endMonth: "2025-05",
    endMonthEnabled: true,
    isCurrent: false,
    title: "새 A",
    subtitle: "회사 · 리드",
    relatedWorkTitle: "회사",
    body: "갱신 A",
    source: { type: "experience-brick", id: "brick-a" },
  });
  assert.equal(items[1].body, "그대로");
  assert.equal(projectItems.at(-1)?.subtitle, "ACTIVITY · 협업");
  assert.equal(projectItems.at(-1)?.startMonth, "2023-01");
  assert.equal(projectItems.at(-1)?.isCurrent, true);
  assert.equal(projectItems.at(-1)?.endMonthEnabled, false);
  assert.deepEqual(linkExperienceBricks(synced, bricks), synced);
});

test("experience brick sync can be inspected and selectively applied before changing the document", () => {
  const original = createResumeDocumentSeed();
  const work = { id: "brick-work", title: "플랫폼 개발", content: "기존 원문", organization: "A사", roleTitle: "개발", experienceType: "WORK", startDate: null, endDate: null, isCurrent: false, period: null, tags: [] };
  const project = { id: "brick-project", title: "배포 개선", content: "배포 시간을 단축", organization: "A사", roleTitle: null, experienceType: "PROJECT", startDate: null, endDate: null, isCurrent: false, period: null, tags: [] };

  assert.deepEqual(inspectExperienceBrickSync(original, [work, project]).map((change) => change.status), ["new", "new"]);

  const withWork = linkExperienceBricks(original, [work]);
  const changedWork = { ...work, content: "새 원문으로 교체" };
  const preview = inspectExperienceBrickSync(withWork, [changedWork, project]);
  assert.equal(preview[0]?.status, "update");
  assert.equal(preview[0]?.current?.body, "기존 원문");
  assert.equal(preview[0]?.next?.body, "새 원문으로 교체");
  assert.equal(preview[1]?.status, "new");

  const projectOnly = linkExperienceBricks(withWork, [project]);
  const workItem = (projectOnly.sharedSections.find((section) => section.id === "experience")!.content as ItemsContent).items.find((item) => item.source?.id === work.id);
  const projectItem = (projectOnly.sharedSections.find((section) => section.id === "projects")!.content as ItemsContent).items.find((item) => item.source?.id === project.id);
  assert.equal(workItem?.body, "기존 원문");
  assert.equal(projectItem?.body, "배포 시간을 단축");
  assert.equal(inspectExperienceBrickSync(projectOnly, [work, project]).every((change) => change.status === "unchanged"), true);
});

test("repeated brick syncs preserve independent role and support item tailoring", () => {
  const seeded = linkExperienceBricks(createResumeDocumentSeed(), [{ id: "brick-a", title: "A", content: "공통", organization: "회사", roleTitle: "개발", experienceType: "WORK", startDate: null, endDate: null, isCurrent: false, period: null, tags: [] }]);
  const profile = seeded.roleProfiles[0];
  const item = ((seeded.sharedSections.find((section) => section.id === "experience")!.content as ItemsContent).items).find((value) => value.source?.id === "brick-a")!;
  let tailored = updateRoleProfileItemSetting(seeded, profile.id, "experience", item.id, { mode: "override", content: { ...item, body: "직군 설명" } });
  tailored = updateRoleProfileSectionSetting(tailored, profile.id, "experience", { itemOrder: [item.id] });
  tailored = createSupportVariant(tailored, profile.id, { name: "A사", company: "A사" });
  const variant = tailored.variants[0];
  tailored = updateDocumentItemSetting(tailored, variant.id, "experience", item.id, { mode: "hidden" });
  tailored = updateSectionSetting(tailored, variant.id, "experience", { itemOrder: [item.id] });

  const synced = linkExperienceBricks(tailored, [{ id: "brick-a", title: "A 갱신", content: "공통 갱신", organization: "회사", roleTitle: "개발", experienceType: "WORK", startDate: null, endDate: null, isCurrent: false, period: null, tags: [] }]);
  assert.deepEqual(synced.roleProfiles[0].settings.experience, tailored.roleProfiles[0].settings.experience);
  assert.deepEqual(synced.variants[0].settings.experience, tailored.variants[0].settings.experience);
  const section = synced.sharedSections.find((value) => value.id === "experience")!;
  assert.equal((resolveSection(section, synced.roleProfiles[0]).content as ItemsContent).items.find((value) => value.id === item.id)!.body, "직군 설명");
  assert.equal((resolveSection(section, synced.roleProfiles[0], synced.variants[0]).content as ItemsContent).items.some((value) => value.id === item.id), false);
});
