export type SectionMode = "inherit" | "override" | "hidden";
export type SectionLayout = "standard" | "compact" | "cards";
export type SectionKind = "identity" | "eligibility" | "narrative" | "items" | "tags";
export type ItemMode = "inherit" | "override" | "hidden";

export type IdentityContent = {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  gender?: string;
  birthDate?: string;
  links: string[];
  photo?: string;
  photoName?: string;
};
export type EligibilityContent = {
  militaryStatus?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  employmentProtectionStatus?: string;
};
export type NarrativeBlockType = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type NarrativeRun = { text: string; bold?: boolean };
export type NarrativeBlock = { id: string; type: NarrativeBlockType; runs: NarrativeRun[] };
export type NarrativeContent = { body: string; blocks?: NarrativeBlock[] };
export type CareerDetailType = "project" | "responsibility" | "improvement" | "troubleshooting";
export type ResumeItemKind = "work" | "career-detail" | "project" | "career-description" | "education" | "credential" | "award" | "activity" | "language" | "training";
export type ItemContent = {
  id: string;
  itemKind?: ResumeItemKind;
  meta: string;
  startMonth?: string;
  endMonth?: string;
  endMonthEnabled?: boolean;
  isCurrent?: boolean;
  title: string;
  subtitle: string;
  detailType?: CareerDetailType;
  relatedWorkItemId?: string;
  relatedWorkTitle?: string;
  body: string;
  source?: { type: "experience-brick"; id: string };
};
export type ItemsContent = {
  items: ItemContent[];
  sortDirection?: "latest-first" | "oldest-first";
  careerDurationOverrideMonths?: number;
};
export type TagsContent = { items: string[] };
export type SectionContent = IdentityContent | EligibilityContent | NarrativeContent | ItemsContent | TagsContent;

export type ResumeSection = {
  id: string;
  title: string;
  kind: SectionKind;
  content: SectionContent;
  layout?: SectionLayout;
  pageBreakBefore?: boolean;
  sharedCustom?: boolean;
  custom?: boolean;
};
export type ItemSetting = { mode: ItemMode; content?: ItemContent };
export type SectionSetting = {
  mode: SectionMode;
  layout: SectionLayout;
  pageBreakBefore?: boolean;
  title?: string;
  content?: SectionContent;
  itemSettings?: Record<string, ItemSetting>;
  itemOrder?: string[];
};
export type ResumeRoleProfile = {
  id: string;
  name: string;
  roleTitle: string;
  settings: Record<string, SectionSetting>;
  sectionOrder?: string[];
  customSections: ResumeSection[];
};
export type ResumeVariant = {
  id: string;
  name: string;
  company: string;
  role: string;
  roleProfileId: string;
  settings: Record<string, SectionSetting>;
  sectionOrder?: string[];
  customSections: ResumeSection[];
};
export type ResumeImportLedgerEntry = {
  candidateKey: string;
  payloadHash: string;
  targetSectionId: string;
  appliedAt: string;
};
export type ResumeDocumentState = {
  version: 5;
  templateRevision?: 1 | 2 | 3 | 4;
  sharedSections: ResumeSection[];
  roleProfiles: ResumeRoleProfile[];
  variants: ResumeVariant[];
  activeVariantId: string | null;
  activeRoleProfileId: string;
  importLedger: ResumeImportLedgerEntry[];
};

export type ResumeReadinessIssueCode = "missing-name" | "missing-email" | "invalid-email" | "invalid-link" | "missing-role" | "missing-company" | "empty-section" | "missing-item-title" | "missing-item-body" | "reversed-period";
export type ResumeReadinessIssue = { code: ResumeReadinessIssueCode; message: string; sectionId?: string; itemId?: string };

type LegacySection = { id: string; title: string; kind: SectionKind; content: string };
type LegacyVariant = Omit<ResumeVariant, "customSections" | "roleProfileId" | "settings"> & {
  settings: Record<string, { mode: SectionMode; layout: SectionLayout; content?: string }>;
};
type LegacyState = { version: 1; sharedSections: LegacySection[]; variants: LegacyVariant[]; activeVariantId: string };
type VersionTwoState = {
  version: 2;
  sharedSections: Array<ResumeSection & { content: SectionContent & { role?: string } }>;
  variants: Array<Omit<ResumeVariant, "roleProfileId">>;
  activeVariantId: string;
};
type VersionThreeState = {
  version: 3;
  sharedSections: ResumeSection[];
  roleProfiles: Array<Omit<ResumeRoleProfile, "customSections"> & { customSections?: ResumeSection[] }>;
  variants: ResumeVariant[];
  activeVariantId: string;
  activeRoleProfileId: string;
};
type VersionFourState = Omit<ResumeDocumentState, "version" | "importLedger"> & {
  version: 4;
  importLedger?: ResumeImportLedgerEntry[];
};
type LegacyIdentityContent = IdentityContent & EligibilityContent;

export type ExperienceBrickReference = {
  id: string;
  title: string;
  content: string;
  period?: string | null;
  organization?: string | null;
  roleTitle?: string | null;
  experienceType?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  isCurrent?: boolean;
  tags?: string[];
};

export const RESUME_DOCUMENT_STORAGE_KEY = "presstuner:resume-documents:v1";

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const newItemId = () => newId("item");
const clone = <T,>(value: T): T => structuredClone(value);
const defaultSetting = (): SectionSetting => ({ mode: "inherit", layout: "standard" });

const roleCoverLetterSection = (profileId: string): ResumeSection => ({
  id: `role-cover-letter-${profileId}`,
  title: "자기소개서",
  kind: "narrative",
  content: { body: "이 직군 이력서에 맞춘 지원 동기와 강점, 일하는 방식을 작성해 주세요." },
  custom: true,
});

const builtInSectionIds = ["profile", "summary", "experience", "projects", "skills", "education", "credentials"];
const defaultRoleSectionOrder = (profileId: string) => [...builtInSectionIds, `role-cover-letter-${profileId}`, "eligibility"];

const starterRoleProfiles = (): ResumeRoleProfile[] => [
  { id: "role-service-planning", name: "서비스기획", roleTitle: "서비스 기획자", settings: {}, sectionOrder: defaultRoleSectionOrder("role-service-planning"), customSections: [roleCoverLetterSection("role-service-planning")] },
  { id: "role-fullstack", name: "풀스택", roleTitle: "풀스택 엔지니어", settings: {}, sectionOrder: defaultRoleSectionOrder("role-fullstack"), customSections: [roleCoverLetterSection("role-fullstack")] },
  { id: "role-ai-engineer", name: "AI 엔지니어", roleTitle: "AI 엔지니어", settings: {}, sectionOrder: defaultRoleSectionOrder("role-ai-engineer"), customSections: [roleCoverLetterSection("role-ai-engineer")] },
];

export function emptySectionContent(kind: SectionKind): SectionContent {
  if (kind === "identity") return { name: "", email: "", phone: "", location: "", gender: "", birthDate: "", links: [] };
  if (kind === "eligibility") return { militaryStatus: "", veteranStatus: "", disabilityStatus: "", employmentProtectionStatus: "" };
  if (kind === "narrative") return { body: "" };
  if (kind === "tags") return { items: [] };
  return { items: [] as ItemContent[] };
}

export function narrativePlainText(content: NarrativeContent) {
  if (!content.blocks?.length) return content.body;
  return content.blocks.map((block) => block.runs.map((run) => run.text).join("")).join("\n");
}

export function narrativeCharacterCount(content: NarrativeContent) {
  if (!content.blocks?.length) return content.body.replace(/\r?\n/g, "").length;
  return content.blocks.reduce((total, block) => total + block.runs.reduce((sum, run) => sum + run.text.length, 0), 0);
}

export function createResumeDocumentSeed(): ResumeDocumentState {
  const roleProfiles = starterRoleProfiles();
  return {
    version: 5,
    templateRevision: 4,
    sharedSections: [
      { id: "profile", title: "인적사항", kind: "identity", content: { name: "이름", email: "email@example.com", phone: "", location: "", gender: "", birthDate: "", links: ["https://portfolio.example.com"] } },
      { id: "summary", title: "소개", kind: "narrative", content: { body: "나를 가장 잘 설명하는 강점과 일하는 방식을 간결하게 적어주세요." } },
      { id: "experience", title: "경력", kind: "items", content: { sortDirection: "latest-first", items: [
        { id: newItemId(), itemKind: "work", meta: "2024.01 — 현재", title: "회사명", subtitle: "부서 · 직책", body: "재직 기간의 역할과 핵심 책임을 간결하게 적어주세요." },
        { id: newItemId(), itemKind: "work", meta: "2022.01 — 2023.12", title: "이전 회사명", subtitle: "부서 · 직책", body: "이전 직장의 역할과 핵심 책임을 간결하게 적어주세요." },
      ] } },
      { id: "projects", title: "경력 상세", kind: "items", content: { sortDirection: "latest-first", items: [
        { id: newItemId(), itemKind: "career-detail", detailType: "project", meta: "2024.01 — 현재", title: "프로젝트 또는 업무명", subtitle: "역할 · 사용 기술", body: "해결한 문제, 맡은 역할, 실행 내용과 결과를 적어주세요." },
      ] } },
      { id: "skills", title: "핵심 역량", kind: "tags", content: { items: ["문제 해결", "협업", "제품 개발"] } },
      { id: "education", title: "학력", kind: "items", content: { items: [{ id: newItemId(), meta: "졸업 연도", title: "학교 · 과정", subtitle: "전공", body: "추가 내용" }] } },
      { id: "credentials", title: "자격 · 수상", kind: "items", content: { items: [{ id: newItemId(), meta: "취득 연도", title: "자격 또는 수상명", subtitle: "발급 · 주관", body: "" }] } },
      { id: "eligibility", title: "병역 · 보훈 · 장애 · 취업보호", kind: "eligibility", content: { militaryStatus: "", veteranStatus: "", disabilityStatus: "", employmentProtectionStatus: "" } },
    ],
    roleProfiles,
    variants: [],
    activeVariantId: null,
    activeRoleProfileId: roleProfiles[0].id,
    importLedger: [],
  };
}

function isItemsContent(content: SectionContent): content is ItemsContent {
  return Array.isArray((content as ItemsContent).items) && (content as ItemsContent).items.every((item) => typeof item === "object");
}

export function normalizeCareerDetailItem(item: ItemContent): ItemContent {
  if (!["career-detail", "project", "career-description", "activity"].includes(item.itemKind ?? "")) return item;
  const detailType: CareerDetailType = item.itemKind === "career-description"
    ? "responsibility"
    : item.detailType ?? "project";
  return { ...item, itemKind: "career-detail", detailType };
}

export function normalizeEmployerTitle(value: string | undefined) {
  return value?.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ") ?? "";
}

export function resolveRelatedWorkItemId(workItems: readonly ItemContent[], relatedWorkTitle: string | undefined) {
  const key = normalizeEmployerTitle(relatedWorkTitle);
  if (!key) return undefined;
  const matches = workItems.filter((item) => item.itemKind === "work" && normalizeEmployerTitle(item.title) === key);
  return matches.length === 1 ? matches[0].id : undefined;
}

export function resolveCareerDetailRelation(
  detail: ItemContent,
  workItems: readonly ItemContent[],
  options: { matchFallbackTitles?: boolean } = {},
) {
  if (detail.relatedWorkItemId) {
    const work = workItems.find((item) => item.itemKind === "work" && item.id === detail.relatedWorkItemId);
    return work ? { status: "linked" as const, work } : { status: "unresolved" as const };
  }
  if (!detail.relatedWorkTitle?.trim()) return { status: "independent" as const };
  if (options.matchFallbackTitles) {
    const id = resolveRelatedWorkItemId(workItems, detail.relatedWorkTitle);
    const work = id ? workItems.find((item) => item.id === id) : undefined;
    if (work) return { status: "linked" as const, work };
  }
  return { status: "unresolved" as const };
}

function orderedItems(items: ItemContent[], order?: string[]) {
  if (!order?.length) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = order.flatMap((id) => {
    const item = byId.get(id);
    if (!item) return [];
    byId.delete(id);
    return [item];
  });
  return [...ordered, ...byId.values()];
}

function applyLayeredItemSettings(
  content: SectionContent,
  roleSetting?: SectionSetting,
  documentSetting?: SectionSetting,
): SectionContent {
  if (!isItemsContent(content)) return content;
  let items = content.items.map((baseItem) => {
    const roleItem = roleSetting?.itemSettings?.[baseItem.id];
    const documentItem = documentSetting?.itemSettings?.[baseItem.id];
    const roleHidden = roleItem?.mode === "hidden";
    const roleContent = roleItem?.mode === "override" && roleItem.content ? roleItem.content : baseItem;
    if (documentItem?.mode === "hidden") return null;
    if (documentItem?.mode === "override" && documentItem.content) return documentItem.content;
    if (roleHidden) return null;
    return roleContent;
  }).filter((item): item is ItemContent => item !== null);
  items = orderedItems(items, roleSetting?.itemOrder);
  items = orderedItems(items, documentSetting?.itemOrder);
  return { ...content, items };
}

function roleBase(section: ResumeSection, profile?: ResumeRoleProfile) {
  const setting = profile?.settings[section.id] ?? defaultSetting();
  if (setting.mode === "override") {
    return { mode: "inherit" as const, content: setting.content ?? section.content, source: "role" as const, setting };
  }
  if (setting.mode === "hidden") {
    return { mode: "hidden" as const, content: section.content, source: "role" as const, setting };
  }
  const changedItems = Boolean(Object.keys(setting.itemSettings ?? {}).length || setting.itemOrder?.length);
  return { mode: "inherit" as const, content: section.content, source: changedItems ? "role" as const : "shared" as const, setting };
}

export function resolveSection(section: ResumeSection, profile?: ResumeRoleProfile, variant?: ResumeVariant) {
  if (section.custom) {
    const documentSetting = variant?.settings[section.id];
    if (documentSetting?.mode === "hidden") return { mode: "hidden" as const, layout: documentSetting.layout ?? section.layout ?? "standard", pageBreakBefore: documentSetting.pageBreakBefore ?? section.pageBreakBefore ?? false, source: "document" as const, content: section.content };
    return {
      mode: "override" as const,
      layout: documentSetting?.layout ?? section.layout ?? "standard",
      pageBreakBefore: documentSetting?.pageBreakBefore ?? section.pageBreakBefore ?? false,
      source: documentSetting?.mode === "override" ? "document" as const : profile?.customSections.some((item) => item.id === section.id) ? "role" as const : "document" as const,
      content: documentSetting?.mode === "override" ? documentSetting.content ?? section.content : section.content,
    };
  }
  const role = roleBase(section, profile);
  const documentSetting = variant?.settings[section.id] ?? defaultSetting();
  const documentOverrides = documentSetting.mode === "override";
  const mode = documentSetting.mode === "hidden" ? "hidden" : documentOverrides ? "override" : role.mode;
  const content = documentOverrides ? documentSetting.content ?? role.content : role.content;
  const documentChangesItems = Boolean(Object.keys(documentSetting.itemSettings ?? {}).length || documentSetting.itemOrder?.length);
  const source = documentOverrides || documentSetting.mode === "hidden" || documentChangesItems ? "document" as const : role.source;
  return {
    mode,
    layout: documentSetting.layout ?? role.setting.layout ?? "standard",
    pageBreakBefore: documentSetting.pageBreakBefore ?? role.setting.pageBreakBefore ?? section.pageBreakBefore ?? false,
    source,
    content: applyLayeredItemSettings(content, role.setting, documentSetting),
  };
}

export function resolveDocumentRole(profile?: ResumeRoleProfile, variant?: ResumeVariant) {
  return variant?.role.trim() || profile?.roleTitle.trim() || "지원 직무";
}

export function resolveSectionTitle(section: ResumeSection, profile?: ResumeRoleProfile, variant?: ResumeVariant) {
  return variant?.settings[section.id]?.title?.trim()
    || profile?.settings[section.id]?.title?.trim()
    || section.title;
}

export function isItemEndMonthEnabled(item: Pick<ItemContent, "endMonth" | "endMonthEnabled">) {
  return item.endMonthEnabled ?? Boolean(item.endMonth);
}

export function formatItemPeriod(item: Pick<ItemContent, "meta" | "startMonth" | "endMonth" | "endMonthEnabled" | "isCurrent">) {
  const formatMonth = (value?: string) => value?.trim().replace("-", ".") ?? "";
  const start = formatMonth(item.startMonth);
  const end = item.isCurrent ? "현재" : isItemEndMonthEnabled(item) ? formatMonth(item.endMonth) : "";
  if (start && end) return `${start} — ${end}`;
  return start || end || item.meta;
}

function updateProfileSetting(state: ResumeDocumentState, profileId: string, sectionId: string, updater: (setting: SectionSetting) => SectionSetting) {
  return {
    ...state,
    roleProfiles: state.roleProfiles.map((profile) => profile.id === profileId
      ? { ...profile, settings: { ...profile.settings, [sectionId]: updater(profile.settings[sectionId] ?? defaultSetting()) } }
      : profile),
  };
}

function updateDocumentSetting(state: ResumeDocumentState, variantId: string, sectionId: string, updater: (setting: SectionSetting) => SectionSetting) {
  return {
    ...state,
    variants: state.variants.map((variant) => variant.id === variantId
      ? { ...variant, settings: { ...variant.settings, [sectionId]: updater(variant.settings[sectionId] ?? defaultSetting()) } }
      : variant),
  };
}

export function updateRoleProfileSectionSetting(state: ResumeDocumentState, profileId: string, sectionId: string, patch: Partial<SectionSetting>) {
  const shared = state.sharedSections.find((section) => section.id === sectionId);
  if (!shared) return state;
  return updateProfileSetting(state, profileId, sectionId, (current) => {
    const next = { ...current, ...patch };
    if (next.mode === "override" && next.content === undefined) next.content = clone(shared.content);
    return next;
  });
}

export function updateSectionSetting(state: ResumeDocumentState, variantId: string, sectionId: string, patch: Partial<SectionSetting>) {
  const variant = state.variants.find((item) => item.id === variantId);
  if (!variant) return state;
  const profile = state.roleProfiles.find((item) => item.id === variant.roleProfileId);
  const shared = state.sharedSections.find((section) => section.id === sectionId) ?? profile?.customSections.find((section) => section.id === sectionId);
  if (!shared) return state;
  const inherited = resolveSection(shared, profile, { ...variant, settings: { ...variant.settings, [sectionId]: defaultSetting() } }).content;
  return updateDocumentSetting(state, variantId, sectionId, (current) => {
    const next = { ...current, ...patch };
    if (next.mode === "override" && next.content === undefined) next.content = clone(inherited);
    return next;
  });
}

export function updateRoleProfileItemSetting(state: ResumeDocumentState, profileId: string, sectionId: string, itemId: string, patch: ItemSetting) {
  return updateProfileSetting(state, profileId, sectionId, (current) => ({ ...current, itemSettings: { ...current.itemSettings, [itemId]: patch } }));
}

export function updateDocumentItemSetting(state: ResumeDocumentState, variantId: string, sectionId: string, itemId: string, patch: ItemSetting) {
  return updateDocumentSetting(state, variantId, sectionId, (current) => ({ ...current, itemSettings: { ...current.itemSettings, [itemId]: patch } }));
}

export function clearRoleProfileItemSetting(state: ResumeDocumentState, profileId: string, sectionId: string, itemId: string) {
  return updateProfileSetting(state, profileId, sectionId, (current) => {
    const itemSettings = { ...current.itemSettings };
    delete itemSettings[itemId];
    return { ...current, itemSettings };
  });
}

export function clearDocumentItemSetting(state: ResumeDocumentState, variantId: string, sectionId: string, itemId: string) {
  return updateDocumentSetting(state, variantId, sectionId, (current) => {
    const itemSettings = { ...current.itemSettings };
    delete itemSettings[itemId];
    return { ...current, itemSettings };
  });
}

export function updateSharedSection(state: ResumeDocumentState, sectionId: string, content: SectionContent) {
  return { ...state, sharedSections: state.sharedSections.map((section) => section.id === sectionId ? { ...section, content } : section) };
}

export function updateSharedSectionOrder(state: ResumeDocumentState, sectionOrder: string[]) {
  const byId = new Map(state.sharedSections.map((section) => [section.id, section]));
  const ordered = [...new Set(sectionOrder)].flatMap((id) => {
    const section = byId.get(id);
    if (!section) return [];
    byId.delete(id);
    return [section];
  });
  const sharedSections = [...ordered, ...byId.values()];
  const previousSharedIds = state.sharedSections.map((section) => section.id);
  const roleProfiles = state.roleProfiles.map((profile) => {
    const inheritedDefault = [
      ...previousSharedIds.filter((id) => id !== "eligibility"),
      ...profile.customSections.map((section) => section.id),
      ...(previousSharedIds.includes("eligibility") ? ["eligibility"] : []),
    ];
    if (!profile.sectionOrder || profile.sectionOrder.join("\u0000") !== inheritedDefault.join("\u0000")) return profile;
    return {
      ...profile,
      sectionOrder: [
        ...sharedSections.map((section) => section.id).filter((id) => id !== "eligibility"),
        ...profile.customSections.map((section) => section.id),
        ...(sharedSections.some((section) => section.id === "eligibility") ? ["eligibility"] : []),
      ],
    };
  });
  return { ...state, sharedSections, roleProfiles };
}

export function updateSharedSectionTitle(state: ResumeDocumentState, sectionId: string, title: string) {
  return { ...state, sharedSections: state.sharedSections.map((section) => section.id === sectionId ? { ...section, title: title.trim() || section.title } : section) };
}

function insertSectionId(order: string[], sectionId: string, afterSectionId?: string) {
  const next = order.filter((id) => id !== sectionId);
  const afterIndex = afterSectionId ? next.indexOf(afterSectionId) : -1;
  if (afterIndex >= 0) next.splice(afterIndex + 1, 0, sectionId);
  else next.push(sectionId);
  return next;
}

export function addSharedSection(state: ResumeDocumentState, input: { title: string; kind: SectionKind; afterSectionId?: string }) {
  const section: ResumeSection = { id: newId("shared"), title: input.title.trim() || "새 공통 섹션", kind: input.kind, content: emptySectionContent(input.kind), sharedCustom: true, layout: "standard" };
  const sharedSections = [...state.sharedSections];
  const afterIndex = input.afterSectionId ? sharedSections.findIndex((item) => item.id === input.afterSectionId) : -1;
  if (afterIndex >= 0) sharedSections.splice(afterIndex + 1, 0, section);
  else sharedSections.push(section);
  return {
    state: {
      ...state,
      sharedSections,
      roleProfiles: state.roleProfiles.map((profile) => ({ ...profile, sectionOrder: profile.sectionOrder ? insertSectionId(profile.sectionOrder, section.id, input.afterSectionId) : undefined })),
      variants: state.variants.map((variant) => ({ ...variant, sectionOrder: variant.sectionOrder ? insertSectionId(variant.sectionOrder, section.id, input.afterSectionId) : undefined })),
    },
    section,
  };
}

export function deleteSharedSection(state: ResumeDocumentState, sectionId: string) {
  if (!state.sharedSections.some((section) => section.id === sectionId)) return state;
  return {
    ...state,
    sharedSections: state.sharedSections.filter((section) => section.id !== sectionId),
    roleProfiles: state.roleProfiles.map((profile) => {
      const settings = { ...profile.settings };
      delete settings[sectionId];
      return { ...profile, settings, sectionOrder: profile.sectionOrder?.filter((id) => id !== sectionId) };
    }),
    variants: state.variants.map((variant) => {
      const settings = { ...variant.settings };
      delete settings[sectionId];
      return { ...variant, settings, sectionOrder: variant.sectionOrder?.filter((id) => id !== sectionId) };
    }),
  };
}

export function resetRoleProfileSectionToShared(state: ResumeDocumentState, profileId: string, sectionId: string) {
  return {
    ...state,
    roleProfiles: state.roleProfiles.map((profile) => {
      if (profile.id !== profileId) return profile;
      const settings = { ...profile.settings };
      delete settings[sectionId];
      return { ...profile, settings };
    }),
  };
}

export function resetSupportVariantSectionToRole(state: ResumeDocumentState, variantId: string, sectionId: string) {
  return {
    ...state,
    variants: state.variants.map((variant) => {
      if (variant.id !== variantId) return variant;
      const settings = { ...variant.settings };
      delete settings[sectionId];
      return { ...variant, settings };
    }),
  };
}

export function createRoleProfile(state: ResumeDocumentState, input: { name: string; roleTitle: string }) {
  const id = newId("role");
  const profile: ResumeRoleProfile = { id, name: input.name.trim() || "새 직군", roleTitle: input.roleTitle.trim() || "지원 직무", settings: {}, sectionOrder: [...state.sharedSections.map((section) => section.id).filter((sectionId) => sectionId !== "eligibility"), `role-cover-letter-${id}`, ...(state.sharedSections.some((section) => section.id === "eligibility") ? ["eligibility"] : [])], customSections: [roleCoverLetterSection(id)] };
  return { ...state, roleProfiles: [...state.roleProfiles, profile], activeRoleProfileId: profile.id, activeVariantId: null };
}

export function updateRoleProfile(state: ResumeDocumentState, profileId: string, patch: Partial<Pick<ResumeRoleProfile, "name" | "roleTitle">>) {
  return { ...state, roleProfiles: state.roleProfiles.map((profile) => profile.id === profileId ? { ...profile, ...patch } : profile) };
}

export function assignRoleProfile(state: ResumeDocumentState, variantId: string, profileId: string) {
  if (!state.roleProfiles.some((profile) => profile.id === profileId)) return state;
  return { ...state, variants: state.variants.map((variant) => variant.id === variantId ? { ...variant, roleProfileId: profileId } : variant) };
}

export function deleteRoleProfile(state: ResumeDocumentState, profileId: string) {
  if (state.roleProfiles.length < 2) return state;
  const roleProfiles = state.roleProfiles.filter((profile) => profile.id !== profileId);
  if (roleProfiles.length === state.roleProfiles.length) return state;
  const fallbackId = roleProfiles[0].id;
  return {
    ...state,
    roleProfiles,
    activeRoleProfileId: state.activeRoleProfileId === profileId ? fallbackId : state.activeRoleProfileId,
    variants: state.variants.filter((variant) => variant.roleProfileId !== profileId),
    activeVariantId: state.variants.some((variant) => variant.id === state.activeVariantId && variant.roleProfileId !== profileId) ? state.activeVariantId : null,
  };
}

export function createSupportVariant(state: ResumeDocumentState, profileId: string, input: { name: string; company: string; role?: string }) {
  if (!state.roleProfiles.some((profile) => profile.id === profileId)) return state;
  const id = newId("resume");
  const variant: ResumeVariant = {
    id,
    name: input.name.trim() || "새 지원 버전",
    company: input.company.trim(),
    role: input.role?.trim() ?? "",
    roleProfileId: profileId,
    settings: {},
    customSections: [],
  };
  return { ...state, variants: [...state.variants, variant], activeRoleProfileId: profileId, activeVariantId: id };
}

export function deleteSupportVariant(state: ResumeDocumentState, variantId: string) {
  if (!state.variants.some((variant) => variant.id === variantId)) return state;
  return { ...state, variants: state.variants.filter((variant) => variant.id !== variantId), activeVariantId: state.activeVariantId === variantId ? null : state.activeVariantId };
}

export function linkExperienceBricks(state: ResumeDocumentState, bricks: ExperienceBrickReference[]) {
  const bySourceId = new Map<string, ExperienceBrickReference>();
  for (const brick of bricks) if (brick.id && !bySourceId.has(brick.id)) bySourceId.set(brick.id, brick);
  const synchronizedSectionIds = new Set(["experience", "projects", "education", "credentials"]);
  const existingBySourceId = new Map<string, ItemContent>();
  for (const section of state.sharedSections) {
    if (!synchronizedSectionIds.has(section.id) || !isItemsContent(section.content)) continue;
    for (const item of section.content.items) {
      const sourceId = item.source?.type === "experience-brick" ? item.source.id : null;
      if (sourceId && !existingBySourceId.has(sourceId)) existingBySourceId.set(sourceId, item);
    }
  }
  const currentWorkItems = state.sharedSections.find((section) => section.id === "experience" && isItemsContent(section.content));
  const workItems = (currentWorkItems && isItemsContent(currentWorkItems.content) ? currentWorkItems.content.items : [])
    .filter((item) => item.itemKind === "work")
    .map((item) => {
      const sourceId = item.source?.type === "experience-brick" ? item.source.id : undefined;
      const refreshed = sourceId ? bySourceId.get(sourceId) : undefined;
      return refreshed?.experienceType === "WORK" ? brickToItem(refreshed, item.id) : item;
    });
  for (const brick of bySourceId.values()) {
    if (brick.experienceType !== "WORK" || workItems.some((item) => item.source?.id === brick.id)) continue;
    workItems.push(brickToItem(brick, existingBySourceId.get(brick.id)?.id));
  }
  const refreshedSourceIds = new Set<string>();
  return {
    ...state,
    sharedSections: state.sharedSections.map((section) => {
      if (!synchronizedSectionIds.has(section.id) || !isItemsContent(section.content)) return section;
      const seen = new Set<string>();
      const existing = section.content.items.flatMap((item) => {
        const sourceId = item.source?.type === "experience-brick" ? item.source.id : null;
        if (!sourceId) return [item];
        if (seen.has(sourceId)) return [];
        seen.add(sourceId);
        const refreshed = bySourceId.get(sourceId);
        if (!refreshed) return [item];
        if (brickTargetSectionId(refreshed) !== section.id) return [];
        refreshedSourceIds.add(sourceId);
        return [brickToItem(refreshed, item.id, workItems)];
      });
      for (const brick of bySourceId.values()) {
        if (brickTargetSectionId(brick) !== section.id || refreshedSourceIds.has(brick.id)) continue;
        refreshedSourceIds.add(brick.id);
        existing.push(brickToItem(brick, existingBySourceId.get(brick.id)?.id, workItems));
      }
      return { ...section, content: { ...section.content, items: existing } };
    }),
  };
}

function brickTargetSectionId(brick: ExperienceBrickReference) {
  if (brick.experienceType === "WORK") return "experience";
  if (brick.experienceType === "EDUCATION") return "education";
  if (brick.experienceType === "AWARD") return "credentials";
  return "projects";
}

function brickItemKind(brick: ExperienceBrickReference): ResumeItemKind {
  if (brick.experienceType === "WORK") return "work";
  if (brick.experienceType === "EDUCATION") return "education";
  if (brick.experienceType === "AWARD") return "award";
  return "career-detail";
}

function dateToUtcMonth(value?: string | Date | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function brickToItem(brick: ExperienceBrickReference, existingId?: string, workItems: readonly ItemContent[] = []): ItemContent {
  const endMonth = dateToUtcMonth(brick.endDate);
  const item: ItemContent = {
    id: existingId ?? `experience-brick:${brick.id}`,
    itemKind: brickItemKind(brick),
    meta: brick.period?.trim() || "기간 미입력",
    startMonth: dateToUtcMonth(brick.startDate),
    endMonth,
    endMonthEnabled: Boolean(endMonth) && !brick.isCurrent,
    isCurrent: Boolean(brick.isCurrent),
    title: brick.title,
    subtitle: [brick.organization, brick.roleTitle].filter(Boolean).join(" · ") || [brick.experienceType, ...(brick.tags ?? [])].filter(Boolean).join(" · "),
    body: brick.content,
    source: { type: "experience-brick", id: brick.id },
  };
  if (item.itemKind === "career-detail") {
    item.detailType = "project";
    const relatedWorkTitle = brick.organization?.trim();
    if (relatedWorkTitle) {
      item.relatedWorkTitle = relatedWorkTitle;
      const relatedWorkItemId = resolveRelatedWorkItemId(workItems, relatedWorkTitle);
      if (relatedWorkItemId) item.relatedWorkItemId = relatedWorkItemId;
    }
  }
  return item;
}

export function addCustomSection(state: ResumeDocumentState, variantId: string, input: { title: string; kind: SectionKind; afterSectionId?: string }) {
  const id = newId("custom");
  const section: ResumeSection = { id, title: input.title.trim() || "새 섹션", kind: input.kind, content: emptySectionContent(input.kind), custom: true, layout: "standard" };
  return {
    state: {
      ...state,
      variants: state.variants.map((variant) => {
        if (variant.id !== variantId) return variant;
        const profile = state.roleProfiles.find((item) => item.id === variant.roleProfileId);
        const order = profile ? orderResumeSections(state.sharedSections, profile, variant).map((item) => item.id) : [...state.sharedSections, ...variant.customSections].map((item) => item.id);
        const afterIndex = input.afterSectionId ? order.indexOf(input.afterSectionId) : -1;
        if (afterIndex >= 0) order.splice(afterIndex + 1, 0, id);
        else {
          const footerIndex = order.indexOf("eligibility");
          if (footerIndex >= 0) order.splice(footerIndex, 0, id);
          else order.push(id);
        }
        return { ...variant, customSections: [...variant.customSections, section], sectionOrder: order };
      }),
    },
    section,
  };
}

export function addRoleCustomSection(state: ResumeDocumentState, profileId: string, input: { title: string; kind: SectionKind; afterSectionId?: string }) {
  const id = newId("custom");
  const section: ResumeSection = { id, title: input.title.trim() || "새 섹션", kind: input.kind, content: emptySectionContent(input.kind), custom: true, layout: "standard" };
  return {
    state: {
      ...state,
      roleProfiles: state.roleProfiles.map((profile) => {
        if (profile.id !== profileId) return profile;
        const order = orderResumeSections(state.sharedSections, profile).map((item) => item.id);
        const afterIndex = input.afterSectionId ? order.indexOf(input.afterSectionId) : -1;
        if (afterIndex >= 0) order.splice(afterIndex + 1, 0, id);
        else {
          const footerIndex = order.indexOf("eligibility");
          if (footerIndex >= 0) order.splice(footerIndex, 0, id);
          else order.push(id);
        }
        return { ...profile, customSections: [...profile.customSections, section], sectionOrder: order };
      }),
    },
    section,
  };
}

export function updateRoleCustomSection(state: ResumeDocumentState, profileId: string, sectionId: string, patch: Partial<Pick<ResumeSection, "title" | "content" | "layout" | "pageBreakBefore">>) {
  return { ...state, roleProfiles: state.roleProfiles.map((profile) => profile.id === profileId ? { ...profile, customSections: profile.customSections.map((section) => section.id === sectionId ? { ...section, ...patch } : section) } : profile) };
}

export function deleteRoleCustomSection(state: ResumeDocumentState, profileId: string, sectionId: string) {
  return { ...state, roleProfiles: state.roleProfiles.map((profile) => profile.id === profileId ? { ...profile, customSections: profile.customSections.filter((section) => section.id !== sectionId), sectionOrder: profile.sectionOrder?.filter((id) => id !== sectionId) } : profile) };
}

export function updateCustomSection(state: ResumeDocumentState, variantId: string, sectionId: string, patch: Partial<Pick<ResumeSection, "title" | "content" | "layout" | "pageBreakBefore">>) {
  return { ...state, variants: state.variants.map((variant) => variant.id === variantId ? { ...variant, customSections: variant.customSections.map((section) => section.id === sectionId ? { ...section, ...patch } : section) } : variant) };
}

export function deleteCustomSection(state: ResumeDocumentState, variantId: string, sectionId: string) {
  return { ...state, variants: state.variants.map((variant) => variant.id === variantId ? { ...variant, customSections: variant.customSections.filter((section) => section.id !== sectionId), sectionOrder: variant.sectionOrder?.filter((id) => id !== sectionId) } : variant) };
}

function promotedSharedSections(state: ResumeDocumentState, section: ResumeSection, sourceOrder: ResumeSection[]) {
  const sharedIds = new Set(state.sharedSections.map((item) => item.id));
  const sourceIndex = sourceOrder.findIndex((item) => item.id === section.id);
  let precedingSharedId: string | undefined;
  for (let index = sourceIndex - 1; index >= 0; index -= 1) {
    if (sharedIds.has(sourceOrder[index].id)) {
      precedingSharedId = sourceOrder[index].id;
      break;
    }
  }
  const promoted = { ...section, custom: undefined, sharedCustom: true };
  const sharedSections = [...state.sharedSections];
  const insertionIndex = precedingSharedId ? sharedSections.findIndex((item) => item.id === precedingSharedId) + 1 : 0;
  sharedSections.splice(insertionIndex, 0, promoted);
  return { sharedSections, precedingSharedId };
}

function inheritPromotedSection(order: string[] | undefined, sectionId: string, afterSectionId?: string) {
  if (!order || order.includes(sectionId)) return order;
  return insertSectionId(order, sectionId, afterSectionId);
}

export function promoteRoleCustomSectionToShared(state: ResumeDocumentState, profileId: string, sectionId: string) {
  const profile = state.roleProfiles.find((item) => item.id === profileId);
  const section = profile?.customSections.find((item) => item.id === sectionId);
  if (!profile || !section || state.sharedSections.some((item) => item.id === sectionId)) return state;
  const { sharedSections, precedingSharedId } = promotedSharedSections(state, section, orderResumeSections(state.sharedSections, profile));
  return {
    ...state,
    sharedSections,
    roleProfiles: state.roleProfiles.map((item) => ({
      ...item,
      customSections: item.id === profileId ? item.customSections.filter((custom) => custom.id !== sectionId) : item.customSections,
      sectionOrder: inheritPromotedSection(item.sectionOrder, sectionId, precedingSharedId),
    })),
    variants: state.variants.map((variant) => ({ ...variant, sectionOrder: inheritPromotedSection(variant.sectionOrder, sectionId, precedingSharedId) })),
  };
}

export function promoteSupportCustomSectionToShared(state: ResumeDocumentState, variantId: string, sectionId: string) {
  const variant = state.variants.find((item) => item.id === variantId);
  const profile = variant ? state.roleProfiles.find((item) => item.id === variant.roleProfileId) : undefined;
  const section = variant?.customSections.find((item) => item.id === sectionId);
  if (!variant || !profile || !section || state.sharedSections.some((item) => item.id === sectionId)) return state;
  const { sharedSections, precedingSharedId } = promotedSharedSections(state, section, orderResumeSections(state.sharedSections, profile, variant));
  return {
    ...state,
    sharedSections,
    roleProfiles: state.roleProfiles.map((item) => ({ ...item, sectionOrder: inheritPromotedSection(item.sectionOrder, sectionId, precedingSharedId) })),
    variants: state.variants.map((item) => ({
      ...item,
      customSections: item.id === variantId ? item.customSections.filter((custom) => custom.id !== sectionId) : item.customSections,
      sectionOrder: inheritPromotedSection(item.sectionOrder, sectionId, precedingSharedId),
    })),
  };
}

export function duplicateVariant(state: ResumeDocumentState, sourceId: string) {
  const source = state.variants.find((variant) => variant.id === sourceId);
  if (!source) return state;
  const id = newId("resume");
  return { ...state, variants: [...state.variants, { ...clone(source), id, name: `${source.name} 복사본` }], activeVariantId: id };
}

export function inspectResumeReadiness(state: ResumeDocumentState, profileId: string, variantId?: string | null): ResumeReadinessIssue[] {
  const profile = state.roleProfiles.find((item) => item.id === profileId);
  if (!profile) return [];
  const variant = variantId ? state.variants.find((item) => item.id === variantId && item.roleProfileId === profileId) : undefined;
  const issues: ResumeReadinessIssue[] = [];
  const add = (issue: ResumeReadinessIssue) => issues.push(issue);
  if (!resolveDocumentRole(profile, variant).trim()) add({ code: "missing-role", message: "표시할 지원 직무를 입력해 주세요." });
  if (variant && !variant.company.trim()) add({ code: "missing-company", message: "지원 회사가 비어 있습니다." });

  for (const section of orderResumeSections(state.sharedSections, profile, variant)) {
    const resolved = resolveSection(section, profile, variant);
    if (resolved.mode === "hidden") continue;
    const title = resolveSectionTitle(section, profile, variant);
    const content = resolved.content;
    if (section.kind === "identity") {
      const identity = content as IdentityContent;
      if (!identity.name.trim()) add({ code: "missing-name", sectionId: section.id, message: `${title}: 이름을 입력해 주세요.` });
      if (!identity.email.trim()) add({ code: "missing-email", sectionId: section.id, message: `${title}: 이메일을 입력해 주세요.` });
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email.trim())) add({ code: "invalid-email", sectionId: section.id, message: `${title}: 이메일 형식을 확인해 주세요.` });
      identity.links.filter((link) => link.trim()).forEach((link) => {
        try {
          const url = new URL(link);
          if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("unsupported protocol");
        } catch {
          add({ code: "invalid-link", sectionId: section.id, message: `${title}: ‘${link}’ 링크 형식을 확인해 주세요.` });
        }
      });
      continue;
    }
    if (section.kind === "eligibility") continue;
    if (section.kind === "narrative") {
      if (!narrativePlainText(content as NarrativeContent).trim()) add({ code: "empty-section", sectionId: section.id, message: `${title}: 내용이 비어 있습니다.` });
      continue;
    }
    if (section.kind === "tags") {
      if (!(content as TagsContent).items.some((item) => item.trim())) add({ code: "empty-section", sectionId: section.id, message: `${title}: 표시할 항목이 없습니다.` });
      continue;
    }
    const items = (content as ItemsContent).items;
    if (!items.length) add({ code: "empty-section", sectionId: section.id, message: `${title}: 표시할 항목이 없습니다.` });
    items.forEach((item, index) => {
      const itemLabel = item.title.trim() || `${index + 1}번째 항목`;
      if (!item.title.trim()) add({ code: "missing-item-title", sectionId: section.id, itemId: item.id, message: `${title}: ${index + 1}번째 항목의 제목이 비어 있습니다.` });
      if (section.id === "experience" && !item.body.trim()) add({ code: "missing-item-body", sectionId: section.id, itemId: item.id, message: `${title}: ${itemLabel}의 설명이 비어 있습니다.` });
      if (item.startMonth && item.endMonth && !item.isCurrent && item.startMonth > item.endMonth) add({ code: "reversed-period", sectionId: section.id, itemId: item.id, message: `${title}: ${itemLabel}의 종료 연월이 시작 연월보다 빠릅니다.` });
    });
  }
  return issues;
}

export function orderResumeSections(sections: ResumeSection[], profile: ResumeRoleProfile, variant?: ResumeVariant) {
  const allSections = [...sections, ...profile.customSections, ...(variant?.customSections ?? [])];
  const byId = new Map(allSections.map((section) => [section.id, section]));
  const roleOrdered = (profile.sectionOrder ?? []).flatMap((id) => {
    const section = byId.get(id);
    if (!section) return [];
    byId.delete(id);
    return [section];
  });
  const afterRole = [...roleOrdered, ...byId.values()];
  if (!variant?.sectionOrder?.length) return afterRole;
  const afterRoleById = new Map(afterRole.map((section) => [section.id, section]));
  const documentOrdered = variant.sectionOrder.flatMap((id) => {
    const section = afterRoleById.get(id);
    if (!section) return [];
    afterRoleById.delete(id);
    return [section];
  });
  return [...documentOrdered, ...afterRoleById.values()];
}

export function updateRoleProfileSectionOrder(state: ResumeDocumentState, profileId: string, sectionOrder: string[]) {
  const profile = state.roleProfiles.find((item) => item.id === profileId);
  if (!profile) return state;
  const knownSections = [...state.sharedSections, ...profile.customSections];
  const knownIds = new Set(knownSections.map((section) => section.id));
  const uniqueOrder = [...new Set(sectionOrder)].filter((id) => knownIds.has(id));
  for (const section of knownSections) if (!uniqueOrder.includes(section.id)) uniqueOrder.push(section.id);
  return { ...state, roleProfiles: state.roleProfiles.map((item) => item.id === profileId ? { ...item, sectionOrder: uniqueOrder } : item) };
}

export function updateSectionOrder(state: ResumeDocumentState, variantId: string, sectionOrder: string[]) {
  const variant = state.variants.find((item) => item.id === variantId);
  if (!variant) return state;
  const profile = state.roleProfiles.find((item) => item.id === variant.roleProfileId);
  const knownSections = [...state.sharedSections, ...(profile?.customSections ?? []), ...variant.customSections];
  const knownIds = new Set(knownSections.map((section) => section.id));
  const uniqueOrder = [...new Set(sectionOrder)].filter((id) => knownIds.has(id));
  for (const section of knownSections) if (!uniqueOrder.includes(section.id)) uniqueOrder.push(section.id);
  return { ...state, variants: state.variants.map((item) => item.id === variantId ? { ...item, sectionOrder: uniqueOrder } : item) };
}

function migrateLegacyContent(section: LegacySection): { content: SectionContent; role: string } {
  if (section.kind === "identity") {
    const [first = "", ...links] = section.content.split("\n");
    const [name = "", role = "", email = ""] = first.split("|").map((value) => value.trim());
    return { content: { name, email, links: links.map((value) => value.trim()).filter(Boolean) }, role };
  }
  if (section.kind === "narrative") return { content: { body: section.content }, role: "" };
  if (section.kind === "tags") return { content: { items: section.content.split("\n").map((value) => value.trim()).filter(Boolean) }, role: "" };
  return {
    content: { items: section.content.split("\n").filter(Boolean).map((line) => {
      const [meta = "", title = "", subtitle = "", body = ""] = line.split("|").map((value) => value.trim());
      return { id: newItemId(), meta, title, subtitle, body };
    }) },
    role: "",
  };
}

function migrateVersionTwo(value: VersionTwoState, identityRole = ""): VersionThreeState {
  const roleProfiles = value.variants.map((variant, index) => ({
    id: `migrated-role-${variant.id || index}`,
    name: variant.role?.trim() || `${variant.name || "이력서"} 직군`,
    roleTitle: variant.role?.trim() || identityRole || "지원 직무",
    settings: {},
  }));
  const safeProfiles = roleProfiles.length ? roleProfiles : [{ id: "role-general", name: "기본 직군", roleTitle: identityRole || "지원 직무", settings: {} }];
  const sharedSections = value.sharedSections.map((section) => section.kind === "identity"
    ? { ...section, content: { name: (section.content as IdentityContent & { role?: string }).name ?? "", email: (section.content as IdentityContent & { role?: string }).email ?? "", links: (section.content as IdentityContent & { role?: string }).links ?? [] } }
    : section);
  const variants = value.variants.map((variant, index) => ({ ...variant, role: "", roleProfileId: safeProfiles[index]?.id ?? safeProfiles[0].id, customSections: Array.isArray(variant.customSections) ? variant.customSections : [] }));
  const safeVariants = variants.length ? variants : [{ id: "base", name: "기본 이력서", company: "", role: "", roleProfileId: safeProfiles[0].id, settings: {}, customSections: [] }];
  const activeVariantId = safeVariants.some((variant) => variant.id === value.activeVariantId) ? value.activeVariantId : safeVariants[0].id;
  const active = safeVariants.find((variant) => variant.id === activeVariantId)!;
  return { version: 3, sharedSections, roleProfiles: safeProfiles, variants: safeVariants, activeVariantId, activeRoleProfileId: active.roleProfileId };
}

function migrateVersionThree(value: VersionThreeState): VersionFourState | null {
  if (!value.roleProfiles.length) return null;
  const implicitIds = new Set<string>();
  const roleProfiles = value.roleProfiles.map((profile) => {
    const implicit = value.variants.find((variant) => variant.roleProfileId === profile.id && !variant.company.trim());
    if (implicit) implicitIds.add(implicit.id);
    return {
      ...profile,
      settings: { ...(isRecord(profile.settings) ? profile.settings : {}), ...(implicit && isRecord(implicit.settings) ? implicit.settings : {}) },
      sectionOrder: implicit?.sectionOrder ?? profile.sectionOrder,
      customSections: [
        ...(Array.isArray(profile.customSections) ? profile.customSections : []),
        ...(implicit && Array.isArray(implicit.customSections) ? implicit.customSections : []),
      ],
    };
  });
  const variants = value.variants
    .filter((variant) => !implicitIds.has(variant.id))
    .map((variant) => ({ ...variant, customSections: Array.isArray(variant.customSections) ? variant.customSections : [], settings: isRecord(variant.settings) ? variant.settings : {} }));
  const activeRoleProfileId = roleProfiles.some((profile) => profile.id === value.activeRoleProfileId)
    ? value.activeRoleProfileId
    : roleProfiles[0].id;
  const activeVariantId = variants.some((variant) => variant.id === value.activeVariantId) ? value.activeVariantId : null;
  return upgradeRoleTemplates({ version: 4, sharedSections: value.sharedSections, roleProfiles, variants, activeVariantId, activeRoleProfileId });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function splitLegacyIdentityContent(content: SectionContent) {
  const legacy = content as LegacyIdentityContent;
  const {
    militaryStatus,
    veteranStatus,
    disabilityStatus,
    employmentProtectionStatus,
    ...identity
  } = legacy;
  return {
    identity: identity as IdentityContent,
    eligibility: { militaryStatus, veteranStatus, disabilityStatus, employmentProtectionStatus } satisfies EligibilityContent,
  };
}

function migrateLayeredIdentitySettings(settings: Record<string, SectionSetting>, identityId: string) {
  const identitySetting = settings[identityId];
  if (!identitySetting) return settings;
  const nextIdentity = { ...identitySetting };
  const eligibilitySetting = { ...identitySetting };
  delete eligibilitySetting.title;
  if (identitySetting.content !== undefined) {
    const split = splitLegacyIdentityContent(identitySetting.content);
    nextIdentity.content = split.identity;
    eligibilitySetting.content = split.eligibility;
  } else {
    delete eligibilitySetting.content;
  }
  return { ...settings, [identityId]: nextIdentity, eligibility: eligibilitySetting };
}

function migrateVersionFour(value: VersionFourState): ResumeDocumentState {
  const identitySection = value.sharedSections.find((section) => section.kind === "identity");
  const splitShared = identitySection
    ? splitLegacyIdentityContent(identitySection.content)
    : { identity: undefined, eligibility: emptySectionContent("eligibility") as EligibilityContent };
  const sharedSections = value.sharedSections
    .filter((section) => section.id !== "eligibility")
    .map((section) => section.id === identitySection?.id ? { ...section, content: splitShared.identity! } : section);
  sharedSections.push({
    id: "eligibility",
    title: "병역 · 보훈 · 장애 · 취업보호",
    kind: "eligibility",
    content: splitShared.eligibility,
  });

  const roleProfiles = value.roleProfiles.map((profile) => ({
    ...profile,
    settings: identitySection ? migrateLayeredIdentitySettings(profile.settings, identitySection.id) : profile.settings,
    sectionOrder: [...orderResumeSections(value.sharedSections, profile).map((section) => section.id).filter((id) => id !== "eligibility"), "eligibility"],
  }));
  const variants = value.variants.map((variant) => {
    const profile = value.roleProfiles.find((item) => item.id === variant.roleProfileId) ?? value.roleProfiles[0];
    return {
      ...variant,
      settings: identitySection ? migrateLayeredIdentitySettings(variant.settings, identitySection.id) : variant.settings,
      sectionOrder: profile
        ? [...orderResumeSections(value.sharedSections, profile, variant).map((section) => section.id).filter((id) => id !== "eligibility"), "eligibility"]
        : [...(variant.sectionOrder ?? []), "eligibility"],
    };
  });
  return { ...value, version: 5, sharedSections, roleProfiles, variants, importLedger: value.importLedger ?? [] };
}

type MigratableState = ResumeDocumentState | VersionFourState;

function upgradeGenericRole<T extends MigratableState>(state: T): T {
  const profile = state.roleProfiles[0];
  const generic = state.roleProfiles.length === 1
    && profile?.roleTitle === "지원 직무"
    && ((profile.id === "role-general" && profile.name === "기본 직군")
      || profile.name === "기본 이력서 직군");
  if (!generic) return state;
  const roleProfiles = starterRoleProfiles();
  roleProfiles[0] = { ...roleProfiles[0], settings: profile.settings, customSections: profile.customSections, sectionOrder: profile.sectionOrder };
  return {
    ...state,
    roleProfiles,
    variants: state.variants.map((variant) => variant.roleProfileId === profile.id ? { ...variant, roleProfileId: roleProfiles[0].id } : variant),
    activeRoleProfileId: roleProfiles[0].id,
  } as T;
}

function isLegacyProjectItem(item: ItemContent) {
  if (item.itemKind) return item.itemKind === "project" || item.itemKind === "activity";
  return /(?:프로젝트|project)/i.test(item.title);
}

function splitLegacyExperienceContent(content: ItemsContent) {
  const work: ItemContent[] = [];
  const projects: ItemContent[] = [];
  for (const item of content.items) {
    if (isLegacyProjectItem(item)) {
      projects.push({ ...item, itemKind: item.itemKind === "activity" ? "activity" : "project" });
    } else {
      work.push({ ...item, itemKind: "work" });
    }
  }
  return {
    work: { ...content, items: work },
    projects: { sortDirection: content.sortDirection, items: projects } satisfies ItemsContent,
    projectIds: new Set(projects.map((item) => item.id)),
  };
}

function splitLegacyExperienceSetting(
  settings: Record<string, SectionSetting>,
  sharedProjectIds: ReadonlySet<string>,
) {
  const source = settings.experience;
  if (!source || settings.projects) return settings;
  const experience = { ...source };
  const projects: SectionSetting = {
    mode: source.mode,
    layout: source.layout,
    pageBreakBefore: source.pageBreakBefore,
  };
  const projectIds = new Set(sharedProjectIds);
  if (source.content && isItemsContent(source.content)) {
    const split = splitLegacyExperienceContent(source.content);
    experience.content = split.work;
    projects.content = split.projects;
    for (const id of split.projectIds) projectIds.add(id);
  }
  if (source.itemSettings) {
    const experienceItems: Record<string, ItemSetting> = {};
    const projectItems: Record<string, ItemSetting> = {};
    for (const [id, setting] of Object.entries(source.itemSettings)) {
      const project = setting.content ? isLegacyProjectItem(setting.content) : projectIds.has(id);
      (project ? projectItems : experienceItems)[id] = setting.content
        ? { ...setting, content: { ...setting.content, itemKind: project ? setting.content.itemKind === "activity" ? "activity" : "project" : "work" } }
        : setting;
      if (project) projectIds.add(id);
    }
    experience.itemSettings = experienceItems;
    projects.itemSettings = projectItems;
  }
  if (source.itemOrder) {
    experience.itemOrder = source.itemOrder.filter((id) => !projectIds.has(id));
    projects.itemOrder = source.itemOrder.filter((id) => projectIds.has(id));
  }
  return { ...settings, experience, projects };
}

function insertProjectsAfterExperience(order?: string[]) {
  return order ? insertSectionId(order, "projects", "experience") : order;
}

function upgradeRoleTemplatesV2<T extends MigratableState>(state: T): T {
  if (state.templateRevision === 2 || state.templateRevision === 3 || state.templateRevision === 4) return state;
  const experienceIndex = state.sharedSections.findIndex((section) => section.id === "experience" && isItemsContent(section.content));
  const existingProjects = state.sharedSections.find((section) => section.id === "projects");
  let sharedSections = state.sharedSections;
  let projectIds = new Set<string>();
  if (experienceIndex >= 0 && !existingProjects) {
    const experience = state.sharedSections[experienceIndex];
    const split = splitLegacyExperienceContent(experience.content as ItemsContent);
    projectIds = split.projectIds;
    sharedSections = [...state.sharedSections];
    sharedSections.splice(
      experienceIndex,
      1,
      { ...experience, title: experience.title === "경력 · 프로젝트" ? "경력" : experience.title, content: split.work },
      {
        id: "projects",
        title: "프로젝트 · 경력기술",
        kind: "items",
        content: split.projects,
      },
    );
  }
  const addCoverLetter = state.templateRevision === undefined;
  return {
    ...state,
    templateRevision: 2,
    sharedSections,
    roleProfiles: state.roleProfiles.map((profile) => ({
      ...profile,
      settings: splitLegacyExperienceSetting(profile.settings, projectIds),
      sectionOrder: insertProjectsAfterExperience(profile.sectionOrder),
      customSections: !addCoverLetter || profile.customSections.some((section) => section.kind === "narrative" && section.title === "자기소개서")
        ? profile.customSections
        : [...profile.customSections, roleCoverLetterSection(profile.id)],
    })),
    variants: state.variants.map((variant) => ({
      ...variant,
      settings: splitLegacyExperienceSetting(variant.settings, projectIds),
      sectionOrder: insertProjectsAfterExperience(variant.sectionOrder),
    })),
  } as T;
}

function insertCareerDescriptionsAfterProjects(order?: string[]) {
  return order ? insertSectionId(order, "careerDescriptions", "projects") : order;
}

function upgradeCareerDescriptionTemplate<T extends MigratableState>(state: T): T {
  if (state.templateRevision === 3 || state.templateRevision === 4) return state;
  const projectsIndex = state.sharedSections.findIndex((section) => section.id === "projects");
  const existingCareerDescriptions = state.sharedSections.some((section) => section.id === "careerDescriptions");
  let sharedSections = state.sharedSections.map((section) => section.id === "projects" && section.title === "프로젝트 · 경력기술"
    ? { ...section, title: "프로젝트" }
    : section);
  if (!existingCareerDescriptions) {
    const section: ResumeSection = {
      id: "careerDescriptions",
      title: "경력기술서",
      kind: "items",
      content: { sortDirection: "latest-first", items: [] },
    };
    sharedSections = [...sharedSections];
    sharedSections.splice(projectsIndex >= 0 ? projectsIndex + 1 : sharedSections.length, 0, section);
  }
  return {
    ...state,
    templateRevision: 3,
    sharedSections,
    roleProfiles: state.roleProfiles.map((profile) => ({
      ...profile,
      sectionOrder: insertCareerDescriptionsAfterProjects(profile.sectionOrder),
    })),
    variants: state.variants.map((variant) => ({
      ...variant,
      sectionOrder: insertCareerDescriptionsAfterProjects(variant.sectionOrder),
    })),
  } as T;
}

const DEFAULT_PROJECT_TITLES = new Set(["프로젝트", "프로젝트 · 경력기술", "경력 상세"]);
const DEFAULT_CAREER_DESCRIPTION_TITLES = new Set(["경력기술서"]);

function canonicalCareerTitle(projectsTitle?: string, careerDescriptionsTitle?: string) {
  const project = projectsTitle?.trim();
  const career = careerDescriptionsTitle?.trim();
  if (project && !DEFAULT_PROJECT_TITLES.has(project)) return project;
  if (career && !DEFAULT_CAREER_DESCRIPTION_TITLES.has(career)) return career;
  return "경력 상세";
}

function collisionSafeItemId(id: string, used: Set<string>) {
  if (!used.has(id)) return id;
  let index = 2;
  let candidate = `${id}-career-detail-${index}`;
  while (used.has(candidate)) candidate = `${id}-career-detail-${++index}`;
  return candidate;
}

function mergeCareerContent(
  projectsContent: SectionContent | undefined,
  careerDescriptionsContent: SectionContent | undefined,
  inheritedCareerIdMap: ReadonlyMap<string, string> = new Map(),
) {
  const projects = projectsContent && isItemsContent(projectsContent) ? projectsContent : { items: [] } satisfies ItemsContent;
  const careerDescriptions = careerDescriptionsContent && isItemsContent(careerDescriptionsContent) ? careerDescriptionsContent : { items: [] } satisfies ItemsContent;
  const used = new Set<string>();
  const projectItems = projects.items.map((item) => {
    const next = normalizeCareerDetailItem(item);
    const id = collisionSafeItemId(next.id, used);
    used.add(id);
    return id === next.id ? next : { ...next, id };
  });
  const careerIdMap = new Map<string, string>();
  const careerItems = careerDescriptions.items.map((item) => {
    const next = normalizeCareerDetailItem(item);
    const inheritedId = inheritedCareerIdMap.get(next.id);
    const id = collisionSafeItemId(inheritedId ?? next.id, used);
    used.add(id);
    careerIdMap.set(next.id, id);
    return { ...next, id };
  });
  const sortDirection = projects.sortDirection ?? careerDescriptions.sortDirection;
  return {
    content: {
      ...projects,
      ...(sortDirection ? { sortDirection } : {}),
      items: [...projectItems, ...careerItems],
    } satisfies ItemsContent,
    careerIdMap,
  };
}

function remapCareerItemSetting(setting: ItemSetting, id: string): ItemSetting {
  return setting.content
    ? { ...setting, content: { ...normalizeCareerDetailItem(setting.content), id } }
    : setting;
}

function mergeCompatibleCareerSettings(
  projects: SectionSetting | undefined,
  careerDescriptions: SectionSetting | undefined,
  careerIdMap: ReadonlyMap<string, string>,
) {
  if (!projects && !careerDescriptions) return undefined;
  const projectItems = Object.fromEntries(Object.entries(projects?.itemSettings ?? {}).map(([id, setting]) => [id, remapCareerItemSetting(setting, id)]));
  const careerItems = Object.fromEntries(Object.entries(careerDescriptions?.itemSettings ?? {}).map(([oldId, setting]) => {
    const id = careerIdMap.get(oldId) ?? oldId;
    return [id, remapCareerItemSetting(setting, id)];
  }));
  const itemOrder = [
    ...(projects?.itemOrder ?? []),
    ...(careerDescriptions?.itemOrder ?? []).map((id) => careerIdMap.get(id) ?? id),
  ];
  const title = canonicalCareerTitle(projects?.title, careerDescriptions?.title);
  return {
    mode: projects?.mode ?? careerDescriptions?.mode ?? "inherit",
    layout: projects?.layout ?? careerDescriptions?.layout ?? "standard",
    ...((projects?.pageBreakBefore ?? careerDescriptions?.pageBreakBefore) !== undefined
      ? { pageBreakBefore: projects?.pageBreakBefore ?? careerDescriptions?.pageBreakBefore }
      : {}),
    ...(title === "경력 상세" ? {} : { title }),
    ...(Object.keys(projectItems).length || Object.keys(careerItems).length ? { itemSettings: { ...projectItems, ...careerItems } } : {}),
    ...(itemOrder.length ? { itemOrder: [...new Set(itemOrder)] } : {}),
  } satisfies SectionSetting;
}

function hasSectionLevelCareerOverride(setting: SectionSetting | undefined) {
  return Boolean(setting && (setting.mode !== "inherit" || setting.content !== undefined));
}

function materializeCareerSetting(
  projectsSection: ResumeSection,
  careerDescriptionsSection: ResumeSection | undefined,
  projectsSetting: SectionSetting | undefined,
  careerDescriptionsSetting: SectionSetting | undefined,
  projectsResolved: ReturnType<typeof resolveSection>,
  careerDescriptionsResolved: ReturnType<typeof resolveSection> | undefined,
  careerIdMap: ReadonlyMap<string, string>,
) {
  if (!projectsSetting && !careerDescriptionsSetting) return undefined;
  if (!hasSectionLevelCareerOverride(projectsSetting) && !hasSectionLevelCareerOverride(careerDescriptionsSetting)) {
    return mergeCompatibleCareerSettings(projectsSetting, careerDescriptionsSetting, careerIdMap);
  }
  const bothHidden = projectsResolved.mode === "hidden" && (!careerDescriptionsResolved || careerDescriptionsResolved.mode === "hidden");
  const merged = mergeCareerContent(
    projectsResolved.mode === "hidden" ? undefined : projectsResolved.content,
    !careerDescriptionsResolved || careerDescriptionsResolved.mode === "hidden" ? undefined : careerDescriptionsResolved.content,
    careerIdMap,
  );
  const title = canonicalCareerTitle(projectsSetting?.title, careerDescriptionsSetting?.title);
  return {
    mode: bothHidden ? "hidden" : "override",
    layout: projectsSetting?.layout ?? careerDescriptionsSetting?.layout ?? projectsSection.layout ?? careerDescriptionsSection?.layout ?? "standard",
    ...((projectsSetting?.pageBreakBefore ?? careerDescriptionsSetting?.pageBreakBefore) !== undefined
      ? { pageBreakBefore: projectsSetting?.pageBreakBefore ?? careerDescriptionsSetting?.pageBreakBefore }
      : {}),
    ...(title === "경력 상세" ? {} : { title }),
    ...(!bothHidden ? { content: merged.content } : {}),
  } satisfies SectionSetting;
}

function remapCareerSectionOrder(order?: string[]) {
  if (!order) return order;
  const next: string[] = [];
  let inserted = false;
  for (const id of order) {
    if (id === "projects" || id === "careerDescriptions") {
      if (!inserted) next.push("projects");
      inserted = true;
    } else if (!next.includes(id)) next.push(id);
  }
  return next;
}

export function upgradeCareerDepthTemplate<T extends MigratableState>(state: T): T {
  if (state.templateRevision === 4) return state;
  const oldProjects = state.sharedSections.find((section) => section.id === "projects" && isItemsContent(section.content));
  const oldCareerDescriptions = state.sharedSections.find((section) => section.id === "careerDescriptions" && isItemsContent(section.content));
  const projectsSection: ResumeSection = oldProjects ?? {
    id: "projects",
    title: "경력 상세",
    kind: "items",
    content: { sortDirection: "latest-first", items: [] },
  };
  const sharedMerge = mergeCareerContent(oldProjects?.content, oldCareerDescriptions?.content);
  const canonicalProjects: ResumeSection = {
    ...projectsSection,
    title: canonicalCareerTitle(oldProjects?.title, oldCareerDescriptions?.title),
    content: sharedMerge.content,
  };
  let inserted = false;
  const sharedSections = state.sharedSections.flatMap((section) => {
    if (section.id !== "projects" && section.id !== "careerDescriptions") return [section];
    if (inserted) return [];
    inserted = true;
    return [canonicalProjects];
  });
  if (!inserted) {
    const experienceIndex = sharedSections.findIndex((section) => section.id === "experience");
    sharedSections.splice(experienceIndex >= 0 ? experienceIndex + 1 : sharedSections.length, 0, canonicalProjects);
  }

  const roleProfiles = state.roleProfiles.map((profile) => {
    const projectsSetting = profile.settings.projects;
    const careerSetting = profile.settings.careerDescriptions;
    const projectsResolved = resolveSection(projectsSection, profile);
    const careerResolved = oldCareerDescriptions ? resolveSection(oldCareerDescriptions, profile) : undefined;
    const mergedSetting = materializeCareerSetting(projectsSection, oldCareerDescriptions, projectsSetting, careerSetting, projectsResolved, careerResolved, sharedMerge.careerIdMap);
    const settings = { ...profile.settings };
    delete settings.careerDescriptions;
    if (mergedSetting) settings.projects = mergedSetting;
    else delete settings.projects;
    return { ...profile, settings, sectionOrder: remapCareerSectionOrder(profile.sectionOrder) };
  });
  const variants = state.variants.map((variant) => {
    const originalProfile = state.roleProfiles.find((profile) => profile.id === variant.roleProfileId) ?? state.roleProfiles[0];
    const projectsSetting = variant.settings.projects;
    const careerSetting = variant.settings.careerDescriptions;
    const projectsResolved = resolveSection(projectsSection, originalProfile, variant);
    const careerResolved = oldCareerDescriptions ? resolveSection(oldCareerDescriptions, originalProfile, variant) : undefined;
    const mergedSetting = materializeCareerSetting(projectsSection, oldCareerDescriptions, projectsSetting, careerSetting, projectsResolved, careerResolved, sharedMerge.careerIdMap);
    const settings = { ...variant.settings };
    delete settings.careerDescriptions;
    if (mergedSetting) settings.projects = mergedSetting;
    else delete settings.projects;
    return { ...variant, settings, sectionOrder: remapCareerSectionOrder(variant.sectionOrder) };
  });
  return {
    ...state,
    templateRevision: 4,
    sharedSections,
    roleProfiles,
    variants,
    importLedger: Array.isArray(state.importLedger)
      ? state.importLedger.map((entry) => entry.targetSectionId === "careerDescriptions" ? { ...entry, targetSectionId: "projects" } : entry)
      : state.importLedger,
  } as T;
}

function upgradeRoleTemplates<T extends MigratableState>(state: T): T {
  return upgradeCareerDepthTemplate(upgradeCareerDescriptionTemplate(upgradeRoleTemplatesV2(state)));
}

export function parseResumeDocumentState(raw: string | null): ResumeDocumentState | null {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!isRecord(value) || !Array.isArray(value.sharedSections) || !Array.isArray(value.variants)) return null;
    if (value.version === 1) {
      const legacy = value as LegacyState;
      let identityRole = "";
      const sharedSections = legacy.sharedSections.map((section) => {
        const migrated = migrateLegacyContent(section);
        if (section.kind === "identity") identityRole = migrated.role;
        return { ...section, content: migrated.content };
      });
      const versionFour = migrateVersionThree(migrateVersionTwo({ version: 2, sharedSections, variants: legacy.variants.map((variant) => ({ ...variant, customSections: [], settings: Object.fromEntries(Object.entries(variant.settings).map(([sectionId, setting]) => {
        const section = legacy.sharedSections.find((item) => item.id === sectionId);
        const content = setting.content !== undefined && section ? migrateLegacyContent({ ...section, content: setting.content }).content : undefined;
        return [sectionId, { ...setting, content }];
      })) })), activeVariantId: legacy.activeVariantId }, identityRole));
      return versionFour ? migrateVersionFour(upgradeGenericRole(versionFour)) : null;
    }
    if (value.version === 2) {
      const oldIdentity = (value.sharedSections as VersionTwoState["sharedSections"]).find((section) => section.kind === "identity")?.content as (IdentityContent & { role?: string }) | undefined;
      const versionFour = migrateVersionThree(migrateVersionTwo(value as VersionTwoState, oldIdentity?.role ?? ""));
      return versionFour ? migrateVersionFour(upgradeGenericRole(versionFour)) : null;
    }
    if (value.version === 3) {
      if (!Array.isArray(value.roleProfiles) || typeof value.activeRoleProfileId !== "string" || typeof value.activeVariantId !== "string") return null;
      const versionFour = migrateVersionThree(value as VersionThreeState);
      return versionFour ? migrateVersionFour(upgradeGenericRole(versionFour)) : null;
    }
    if ((value.version !== 4 && value.version !== 5) || !Array.isArray(value.roleProfiles) || typeof value.activeRoleProfileId !== "string" || (value.activeVariantId !== null && typeof value.activeVariantId !== "string")) return null;
    const state = value as unknown as MigratableState;
    if (state.activeVariantId !== null && !state.variants.some((item) => isRecord(item) && item.id === state.activeVariantId)) return null;
    if (!state.roleProfiles.some((item) => isRecord(item) && item.id === state.activeRoleProfileId)) return null;
    const normalized = upgradeRoleTemplates(upgradeGenericRole({
      ...state,
      roleProfiles: state.roleProfiles.map((profile) => ({ ...profile, settings: isRecord(profile.settings) ? profile.settings : {}, customSections: Array.isArray(profile.customSections) ? profile.customSections : [] })),
      variants: state.variants.map((variant) => ({ ...variant, roleProfileId: state.roleProfiles.some((profile) => profile.id === variant.roleProfileId) ? variant.roleProfileId : state.roleProfiles[0].id, customSections: Array.isArray(variant.customSections) ? variant.customSections : [], settings: isRecord(variant.settings) ? variant.settings : {} })),
    } as MigratableState));
    if (normalized.version === 4) return migrateVersionFour(normalized);
    return {
      ...normalized,
      importLedger: Array.isArray(normalized.importLedger)
        ? normalized.importLedger.filter((entry): entry is ResumeImportLedgerEntry =>
          isRecord(entry)
          && typeof entry.candidateKey === "string"
          && typeof entry.payloadHash === "string"
          && typeof entry.targetSectionId === "string"
          && typeof entry.appliedAt === "string")
        : [],
    };
  } catch {
    return null;
  }
}
