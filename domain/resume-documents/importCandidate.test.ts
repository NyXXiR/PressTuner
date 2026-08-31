import assert from "node:assert/strict";
import test from "node:test";

import {
  addCustomSection,
  addRoleCustomSection,
  createResumeDocumentSeed,
  createSupportVariant,
  parseResumeDocumentState,
  type ItemsContent,
} from "./model";
import {
  applyResumeImportCommand,
  importedResumeItemId,
  inspectResumeImportOverlap,
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
  assert.doesNotThrow(() => ResumeDocumentCandidatePayloadSchema.parse({
    type: "item",
    itemKind: "award",
    title: "수상",
    subtitle: "기관",
    body: "",
    startMonth: "2025-03",
    endMonth: "2024-12",
    isCurrent: false,
    tags: [],
  }));
  assert.throws(() => ResumeDocumentCandidatePayloadSchema.parse({
    type: "item",
    itemKind: "work",
    title: "경력",
    subtitle: "회사",
    body: "",
    startMonth: "2025-03",
    endMonth: "2024-12",
    isCurrent: false,
    tags: [],
  }));
});

test("identity facts can be reviewed and applied as one section candidate", () => {
  const payload = ResumeDocumentCandidatePayloadSchema.parse({
    type: "identity",
    fields: {
      name: "홍길동",
      email: "hong@example.com",
      phone: "010-1234-5678",
      birthDate: "1992-06-05",
    },
  });
  const applied = applyResumeImportCommand(createResumeDocumentSeed(), command({
    payloadHash: "identity-bundle",
    payload,
  }));
  const identity = applied.sharedSections.find((section) => section.id === "profile")!.content as {
    name: string;
    email: string;
    phone: string;
    birthDate: string;
  };
  assert.deepEqual(
    { name: identity.name, email: identity.email, phone: identity.phone, birthDate: identity.birthDate },
    { name: "홍길동", email: "hong@example.com", phone: "010-1234-5678", birthDate: "1992-06-05" },
  );
});

test("candidate payload schema accepts canonical details and normalizes legacy detail kinds", () => {
  for (const detailType of ["project", "responsibility", "improvement", "troubleshooting"] as const) {
    const parsed = ResumeDocumentCandidatePayloadSchema.parse({
      type: "item", itemKind: "career-detail", detailType, detailLabel: "AI 제품", title: `${detailType} title`, subtitle: "", body: "", tags: [],
    });
    assert.equal(parsed.type, "item");
    if (parsed.type !== "item") assert.fail("Expected item");
    assert.equal(parsed.itemKind, "career-detail");
    assert.equal(parsed.detailType, detailType);
    assert.equal(parsed.detailLabel, "AI 제품");
  }
  for (const itemKind of [
    "work",
    "project",
    "career-description",
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
    assert.equal(parsed.itemKind, ["project", "career-description", "activity"].includes(itemKind) ? "career-detail" : itemKind);
  }
});

test("legacy career-description candidates apply to canonical career details", () => {
  const payload = {
    type: "item" as const,
    itemKind: "career-description" as const,
    title: "샘플테크 플랫폼 엔지니어",
    subtitle: "주요 역할과 성과",
    relatedWorkTitle: "샘플테크",
    body: "결제 안정성과 운영 자동화를 담당했습니다.",
    startMonth: "2021-01",
    endMonth: "2024-06",
    isCurrent: false,
    tags: [],
  };
  const applied = applyResumeImportCommand(createResumeDocumentSeed(), command({
    candidateKey: "document:career-description",
    payloadHash: "career-description",
    targetSectionId: "careerDescriptions",
    applyMode: "APPEND",
    payload,
  }));
  const items = (applied.sharedSections.find((section) => section.id === "projects")!.content as { items: Array<{ itemKind?: string; detailType?: string }> }).items;
  assert.equal(items.find((item) => item.itemKind === "career-detail")?.detailType, "responsibility");
  assert.throws(() => applyResumeImportCommand(createResumeDocumentSeed(), command({
    candidateKey: "document:career-description-wrong",
    payloadHash: "career-description-wrong",
    targetSectionId: "summary",
    applyMode: "APPEND",
    payload,
  })), /RESUME_IMPORT_SECTION_KIND_MISMATCH/);
});

test("free career detail labels survive candidate application", () => {
  const applied = applyResumeImportCommand(createResumeDocumentSeed(), command({
    candidateKey: "document:free-detail-label",
    payloadHash: "free-detail-label",
    targetSectionId: "projects",
    applyMode: "APPEND",
    payload: {
      type: "item",
      itemKind: "career-detail",
      detailType: "project",
      detailLabel: "AI 제품 구현·검증",
      title: "AI Process Console",
      subtitle: "",
      body: "",
      isCurrent: false,
      tags: [],
    },
  }));
  const projects = applied.sharedSections.find((section) => section.id === "projects")!;
  const imported = (projects.content as ItemsContent).items.find((item) => item.id === importedResumeItemId("document:free-detail-label"));
  assert.equal(imported?.detailLabel, "AI 제품 구현·검증");
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

test("item append removes only untouched starter items and preserves user edits with starter titles", () => {
  const seed = createResumeDocumentSeed();
  const experience = seed.sharedSections.find((section) => section.id === "experience")!;
  const content = experience.content as ItemsContent;
  content.items[0] = {
    ...content.items[0],
    subtitle: "플랫폼팀 · 리드",
    body: "사용자가 직접 작성한 경력 설명",
  };
  const applied = applyResumeImportCommand(seed, command({
    candidateKey: "document:work-preserve",
    payloadHash: "work-preserve",
    targetSectionId: "experience",
    applyMode: "APPEND",
    payload: {
      type: "item",
      itemKind: "work",
      title: "새 회사",
      subtitle: "제품팀",
      body: "신규 경력",
      isCurrent: false,
      tags: [],
    },
  }));
  const items = (applied.sharedSections.find((section) => section.id === "experience")!.content as ItemsContent).items;
  assert.deepEqual(items.map((item) => item.title), ["회사명", "새 회사"]);
  assert.equal(items[0].body, "사용자가 직접 작성한 경력 설명");
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

test("overlap inspection distinguishes exact content from similar items needing review", () => {
  const seed = createResumeDocumentSeed();
  const withEducation = applyResumeImportCommand(seed, command({
    candidateKey: "document:existing-education",
    payloadHash: "existing-education",
    targetSectionId: "education",
    applyMode: "APPEND",
    payload: {
      type: "item",
      itemKind: "education",
      title: "한국대학교",
      subtitle: "컴퓨터공학과",
      body: "학사 졸업",
      startMonth: "2011-03",
      endMonth: "2015-02",
      isCurrent: false,
      tags: [],
    },
  }));
  const section = withEducation.sharedSections.find((item) => item.id === "education")!;

  assert.equal(inspectResumeImportOverlap(section, {
    type: "item",
    itemKind: "education",
    title: " 한국대학교 ",
    subtitle: "컴퓨터공학과",
    body: "다른 설명",
    startMonth: "2011-03",
    endMonth: "2015-02",
    isCurrent: false,
    tags: [],
  }).level, "exact");
  assert.equal(inspectResumeImportOverlap(section, {
    type: "item",
    itemKind: "education",
    title: "한국대학교",
    subtitle: "컴퓨터공학 학사",
    body: "학사 졸업",
    startMonth: "2011-03",
    endMonth: "2015-02",
    isCurrent: false,
    tags: [],
  }).level, "possible");
});

test("merging a narrative already present in the section never appends it twice", () => {
  const seed = createResumeDocumentSeed();
  const summary = seed.sharedSections.find((section) => section.id === "summary")!;
  summary.content = { body: "고객 문제를 데이터로 정의하고 해결합니다." };
  const applied = applyResumeImportCommand(seed, command({
    candidateKey: "document:duplicate-summary",
    payloadHash: "duplicate-summary",
    targetSectionId: "summary",
    applyMode: "MERGE",
    payload: { type: "narrative", body: "고객 문제를 데이터로 정의하고 해결합니다." },
  }));
  assert.equal(
    (applied.sharedSections.find((section) => section.id === "summary")!.content as { body: string }).body,
    "고객 문제를 데이터로 정의하고 해결합니다.",
  );
});

test("PDF item append preserves experience presentation metadata and projects end-month state", () => {
  const state = createResumeDocumentSeed();
  const experience = state.sharedSections.find((section) => section.id === "experience")!;
  const content = experience.content as { items: unknown[]; sortDirection?: string; careerDurationOverrideMonths?: number };
  content.sortDirection = "oldest-first";
  content.careerDurationOverrideMonths = 74;
  const appended = applyResumeImportCommand(state, command({
    candidateKey: "document:work-1",
    payloadHash: "work-1",
    targetSectionId: "experience",
    applyMode: "APPEND",
    payload: {
      type: "item",
      itemKind: "work",
      title: "신규 경력",
      subtitle: "회사",
      body: "성과",
      startMonth: "2024-01",
      endMonth: "2024-12",
      isCurrent: false,
      tags: [],
    },
  }));
  const appendedContent = appended.sharedSections.find((section) => section.id === "experience")!.content as {
    items: Array<{ title: string; endMonthEnabled?: boolean; itemKind?: string }>;
    sortDirection?: string;
    careerDurationOverrideMonths?: number;
  };
  assert.equal(appendedContent.sortDirection, "oldest-first");
  assert.equal(appendedContent.careerDurationOverrideMonths, 74);
  assert.equal(appendedContent.items.find((item) => item.title === "신규 경력")?.endMonthEnabled, true);
  assert.equal(appendedContent.items.find((item) => item.title === "신규 경력")?.itemKind, "work");
});

test("work and project candidates remain distinct after they are applied", () => {
  const work = applyResumeImportCommand(createResumeDocumentSeed(), command({
    candidateKey: "document:work-separated",
    payloadHash: "work-separated",
    targetSectionId: "experience",
    applyMode: "APPEND",
    payload: {
      type: "item",
      itemKind: "work",
      title: "샘플테크",
      subtitle: "플랫폼팀 · 백엔드 엔지니어",
      body: "재직 경력 요약",
      startMonth: "2020-01",
      endMonth: "2024-12",
      isCurrent: false,
      tags: [],
    },
  }));
  const withProject = applyResumeImportCommand(work, command({
    candidateKey: "document:project-separated",
    payloadHash: "project-separated",
    targetSectionId: "projects",
    applyMode: "APPEND",
    payload: {
      type: "item",
      itemKind: "project",
      title: "결제 전환 프로젝트",
      subtitle: "백엔드 리드",
      relatedWorkTitle: "샘플테크",
      body: "전환율을 개선했습니다.",
      startMonth: "2023-01",
      endMonth: "2023-06",
      isCurrent: false,
      tags: ["TypeScript"],
    },
  }));

  const workItem = ((withProject.sharedSections.find((section) => section.id === "experience")!.content as { items: Array<{ title: string; itemKind?: string }> }).items)
    .find((item) => item.title === "샘플테크");
  const projectItem = ((withProject.sharedSections.find((section) => section.id === "projects")!.content as { items: Array<{ title: string; itemKind?: string; relatedWorkTitle?: string }> }).items)
    .find((item) => item.title === "결제 전환 프로젝트");
  assert.equal(workItem?.itemKind, "work");
  assert.equal(projectItem?.itemKind, "career-detail");
  assert.equal(projectItem?.relatedWorkTitle, "샘플테크");
});

test("career detail application uses deterministic ids and validates stable parent ids", () => {
  const seed = createResumeDocumentSeed();
  const experience = seed.sharedSections.find((section) => section.id === "experience")!.content as { items: Array<{ id: string; itemKind?: string; meta: string; title: string; subtitle: string; body: string }> };
  experience.items = [{ id: "work-sample", itemKind: "work", meta: "", title: "샘플테크", subtitle: "개발자", body: "경력 요약" }];
  const base = {
    type: "item" as const,
    itemKind: "career-detail" as const,
    detailType: "improvement" as const,
    title: "배포 개선",
    subtitle: "플랫폼",
    body: "배포 시간을 줄였습니다.",
    startMonth: "2024-01",
    endMonth: "2024-06",
    isCurrent: false,
    tags: [],
  };
  const linked = applyResumeImportCommand(seed, command({
    candidateKey: "document:detail-linked", payloadHash: "detail-linked", targetSectionId: "projects", applyMode: "APPEND",
    payload: { ...base, relatedWorkItemId: "work-sample", relatedWorkTitle: "샘플테크" },
  }));
  const linkedItem = ((linked.sharedSections.find((section) => section.id === "projects")!.content as { items: Array<{ id: string; relatedWorkItemId?: string }> }).items).find((item) => item.id === importedResumeItemId("document:detail-linked"));
  assert.equal(linkedItem?.relatedWorkItemId, "work-sample");

  const stale = applyResumeImportCommand(seed, command({
    candidateKey: "document:detail-stale", payloadHash: "detail-stale", targetSectionId: "careerDescriptions", applyMode: "APPEND",
    payload: { ...base, relatedWorkItemId: "missing", relatedWorkTitle: "예전회사" },
  }));
  const staleItem = ((stale.sharedSections.find((section) => section.id === "projects")!.content as { items: Array<{ id: string; relatedWorkItemId?: string; relatedWorkTitle?: string }> }).items).find((item) => item.id === importedResumeItemId("document:detail-stale"));
  assert.equal(staleItem?.relatedWorkItemId, undefined);
  assert.equal(staleItem?.relatedWorkTitle, "예전회사");
  assert.equal(stale.importLedger.at(-1)?.targetSectionId, "projects");
});

test("linked detail narrative duplicates are compared against the parent employment summary", () => {
  const seed = createResumeDocumentSeed();
  const experience = seed.sharedSections.find((section) => section.id === "experience")!;
  experience.content = { items: [{ id: "work-a", itemKind: "work", meta: "", title: "샘플테크", subtitle: "개발자", body: "결제 장애율을 분석하고 자동 복구 절차를 운영했습니다." }] };
  const projects = seed.sharedSections.find((section) => section.id === "projects")!;
  const exactPayload = ResumeDocumentCandidatePayloadSchema.parse({ type: "item", itemKind: "career-detail", detailType: "troubleshooting", title: "결제 안정화", subtitle: "", body: "결제 장애율을 분석하고 자동 복구 절차를 운영했습니다.", relatedWorkItemId: "work-a", relatedWorkTitle: "샘플테크", tags: [] });
  assert.equal(inspectResumeImportOverlap(projects, exactPayload, seed.sharedSections).level, "exact");
  const similarPayload = ResumeDocumentCandidatePayloadSchema.parse({ ...exactPayload, title: "결제 운영 개선", body: "결제 장애율을 분석하고 자동 복구 절차를 개선했습니다." });
  assert.equal(inspectResumeImportOverlap(projects, similarPayload, seed.sharedSections).level, "possible");
  const applied = applyResumeImportCommand(seed, command({ candidateKey: "document:duplicate-detail", payloadHash: "duplicate-detail", targetSectionId: "projects", applyMode: "APPEND", payload: exactPayload }));
  assert.equal((applied.sharedSections.find((section) => section.id === "projects")!.content as { items: Array<{ title: string }> }).items.some((item) => item.title === "결제 안정화"), false);
});

test("commands reject incompatible section kinds but allow manual routing among item sections", () => {
  assert.throws(
    () => applyResumeImportCommand(createResumeDocumentSeed(), command({ targetSectionId: "summary" })),
    /RESUME_IMPORT_SECTION_KIND_MISMATCH/,
  );
  const routed = applyResumeImportCommand(createResumeDocumentSeed(), command({
    candidateKey: "document:manual-route",
    payloadHash: "manual-route",
    targetSectionId: "credentials",
    applyMode: "APPEND",
    payload: {
      type: "item",
      itemKind: "career-detail",
      detailType: "project",
      title: "개인 오픈소스",
      subtitle: "메인테이너",
      body: "릴리스 자동화를 개선했습니다.",
      isCurrent: false,
      tags: [],
    },
  }));
  const credentials = routed.sharedSections.find((section) => section.id === "credentials")!.content as ItemsContent;
  assert.equal(credentials.items.at(-1)?.title, "개인 오픈소스");
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
