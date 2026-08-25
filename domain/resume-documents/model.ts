export type SectionMode = "inherit" | "override" | "hidden";
export type SectionLayout = "standard" | "compact" | "cards";
export type SectionKind = "identity" | "narrative" | "items" | "tags";

export type IdentityContent = { name: string; role: string; email: string; links: string[] };
export type NarrativeContent = { body: string };
export type ItemContent = { id: string; meta: string; title: string; subtitle: string; body: string };
export type ItemsContent = { items: ItemContent[] };
export type TagsContent = { items: string[] };
export type SectionContent = IdentityContent | NarrativeContent | ItemsContent | TagsContent;

export type ResumeSection = {
  id: string;
  title: string;
  kind: SectionKind;
  content: SectionContent;
  layout?: SectionLayout;
  custom?: boolean;
};
export type SectionSetting = { mode: SectionMode; layout: SectionLayout; content?: SectionContent };
export type ResumeVariant = {
  id: string;
  name: string;
  company: string;
  role: string;
  settings: Record<string, SectionSetting>;
  sectionOrder?: string[];
  customSections: ResumeSection[];
};
export type ResumeDocumentState = { version: 2; sharedSections: ResumeSection[]; variants: ResumeVariant[]; activeVariantId: string };

type LegacySection = { id: string; title: string; kind: SectionKind; content: string };
type LegacyVariant = Omit<ResumeVariant, "customSections" | "settings"> & {
  settings: Record<string, { mode: SectionMode; layout: SectionLayout; content?: string }>;
};
type LegacyState = { version: 1; sharedSections: LegacySection[]; variants: LegacyVariant[]; activeVariantId: string };

export const RESUME_DOCUMENT_STORAGE_KEY = "presstuner:resume-documents:v1";

const newItemId = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function emptySectionContent(kind: SectionKind): SectionContent {
  if (kind === "identity") return { name: "", role: "", email: "", links: [] };
  if (kind === "narrative") return { body: "" };
  if (kind === "tags") return { items: [] };
  return { items: [] as ItemContent[] };
}

export function createResumeDocumentSeed(): ResumeDocumentState {
  return {
    version: 2,
    sharedSections: [
      { id: "profile", title: "인적사항", kind: "identity", content: { name: "이름", role: "지원 직무", email: "email@example.com", links: ["https://portfolio.example.com"] } },
      { id: "summary", title: "소개", kind: "narrative", content: { body: "나를 가장 잘 설명하는 강점과 일하는 방식을 간결하게 적어주세요." } },
      { id: "experience", title: "경력 · 프로젝트", kind: "items", content: { items: [{ id: newItemId(), meta: "2024.01 — 현재", title: "프로젝트 또는 업무명", subtitle: "회사 · 팀", body: "맡은 역할, 해결한 문제, 결과를 적어주세요." }] } },
      { id: "skills", title: "핵심 역량", kind: "tags", content: { items: ["문제 해결", "협업", "제품 개발"] } },
      { id: "education", title: "학력", kind: "items", content: { items: [{ id: newItemId(), meta: "졸업 연도", title: "학교 · 과정", subtitle: "전공", body: "추가 내용" }] } },
      { id: "credentials", title: "자격 · 수상", kind: "items", content: { items: [{ id: newItemId(), meta: "취득 연도", title: "자격 또는 수상명", subtitle: "발급 · 주관", body: "" }] } },
    ],
    variants: [{ id: "base", name: "기본 이력서", company: "", role: "", settings: {}, customSections: [] }],
    activeVariantId: "base",
  };
}

export function resolveSection(section: ResumeSection, variant: ResumeVariant) {
  if (section.custom) return { mode: "override" as const, layout: section.layout ?? "standard", content: section.content };
  const setting = variant.settings[section.id] ?? { mode: "inherit" as const, layout: "standard" as const };
  return { ...setting, content: setting.mode === "override" ? setting.content ?? section.content : section.content };
}

export function updateSectionSetting(state: ResumeDocumentState, variantId: string, sectionId: string, patch: Partial<SectionSetting>) {
  const shared = state.sharedSections.find((section) => section.id === sectionId);
  return {
    ...state,
    variants: state.variants.map((variant) => {
      if (variant.id !== variantId || !shared) return variant;
      const current = variant.settings[sectionId] ?? { mode: "inherit" as const, layout: "standard" as const };
      const next = { ...current, ...patch };
      if (next.mode === "override" && next.content === undefined) next.content = structuredClone(shared.content);
      return { ...variant, settings: { ...variant.settings, [sectionId]: next } };
    }),
  };
}

export function updateSharedSection(state: ResumeDocumentState, sectionId: string, content: SectionContent) {
  return { ...state, sharedSections: state.sharedSections.map((section) => section.id === sectionId ? { ...section, content } : section) };
}

export function addCustomSection(state: ResumeDocumentState, variantId: string, input: { title: string; kind: SectionKind; afterSectionId?: string }) {
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const section: ResumeSection = { id, title: input.title.trim() || "새 섹션", kind: input.kind, content: emptySectionContent(input.kind), custom: true, layout: "standard" };
  return {
    state: {
      ...state,
      variants: state.variants.map((variant) => {
        if (variant.id !== variantId) return variant;
        const order = [...(variant.sectionOrder ?? [...state.sharedSections, ...variant.customSections].map((item) => item.id))];
        const afterIndex = input.afterSectionId ? order.indexOf(input.afterSectionId) : -1;
        if (afterIndex >= 0) order.splice(afterIndex + 1, 0, id);
        else order.push(id);
        return { ...variant, customSections: [...variant.customSections, section], sectionOrder: order };
      }),
    },
    section,
  };
}

export function updateCustomSection(state: ResumeDocumentState, variantId: string, sectionId: string, patch: Partial<Pick<ResumeSection, "title" | "content" | "layout">>) {
  return {
    ...state,
    variants: state.variants.map((variant) => variant.id === variantId
      ? { ...variant, customSections: variant.customSections.map((section) => section.id === sectionId ? { ...section, ...patch } : section) }
      : variant),
  };
}

export function deleteCustomSection(state: ResumeDocumentState, variantId: string, sectionId: string) {
  return {
    ...state,
    variants: state.variants.map((variant) => variant.id === variantId
      ? { ...variant, customSections: variant.customSections.filter((section) => section.id !== sectionId), sectionOrder: variant.sectionOrder?.filter((id) => id !== sectionId) }
      : variant),
  };
}

export function duplicateVariant(state: ResumeDocumentState, sourceId: string) {
  const source = state.variants.find((variant) => variant.id === sourceId);
  if (!source) return state;
  const id = `resume-${Date.now()}`;
  return { ...state, variants: [...state.variants, { ...structuredClone(source), id, name: `${source.name} 복사본` }], activeVariantId: id };
}

export function orderResumeSections(sections: ResumeSection[], variant: ResumeVariant) {
  const allSections = [...sections, ...variant.customSections];
  const byId = new Map(allSections.map((section) => [section.id, section]));
  const ordered = (variant.sectionOrder ?? []).flatMap((id) => {
    const section = byId.get(id);
    if (!section) return [];
    byId.delete(id);
    return [section];
  });
  return [...ordered, ...byId.values()];
}

export function updateSectionOrder(state: ResumeDocumentState, variantId: string, sectionOrder: string[]) {
  const variant = state.variants.find((item) => item.id === variantId);
  if (!variant) return state;
  const knownSections = [...state.sharedSections, ...variant.customSections];
  const knownIds = new Set(knownSections.map((section) => section.id));
  const uniqueOrder = [...new Set(sectionOrder)].filter((id) => knownIds.has(id));
  for (const section of knownSections) if (!uniqueOrder.includes(section.id)) uniqueOrder.push(section.id);
  return { ...state, variants: state.variants.map((item) => item.id === variantId ? { ...item, sectionOrder: uniqueOrder } : item) };
}

function migrateLegacyContent(section: LegacySection, rawContent = section.content): SectionContent {
  if (section.kind === "identity") {
    const [first = "", ...links] = rawContent.split("\n");
    const [name = "", role = "", email = ""] = first.split("|").map((value) => value.trim());
    return { name, role, email, links: links.map((value) => value.trim()).filter(Boolean) };
  }
  if (section.kind === "narrative") return { body: rawContent };
  if (section.kind === "tags") return { items: rawContent.split("\n").map((value) => value.trim()).filter(Boolean) };
  return {
    items: rawContent.split("\n").filter(Boolean).map((line) => {
      const [meta = "", title = "", subtitle = "", body = ""] = line.split("|").map((value) => value.trim());
      return { id: newItemId(), meta, title, subtitle, body };
    }),
  };
}

function migrateLegacyState(value: LegacyState): ResumeDocumentState {
  const sharedSections = value.sharedSections.map((section) => ({ ...section, content: migrateLegacyContent(section) }));
  return {
    version: 2,
    sharedSections,
    variants: value.variants.map((variant) => ({
      ...variant,
      customSections: [],
      settings: Object.fromEntries(Object.entries(variant.settings).map(([sectionId, setting]) => {
        const section = value.sharedSections.find((item) => item.id === sectionId);
        return [sectionId, { ...setting, content: setting.content !== undefined && section ? migrateLegacyContent(section, setting.content) : undefined }];
      })),
    })),
    activeVariantId: value.activeVariantId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseResumeDocumentState(raw: string | null): ResumeDocumentState | null {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!isRecord(value) || !Array.isArray(value.sharedSections) || !Array.isArray(value.variants) || typeof value.activeVariantId !== "string") return null;
    if (!value.variants.some((item) => isRecord(item) && item.id === value.activeVariantId)) return null;
    if (value.version === 1) return migrateLegacyState(value as LegacyState);
    if (value.version !== 2) return null;
    return {
      ...(value as ResumeDocumentState),
      variants: (value as ResumeDocumentState).variants.map((variant) => ({ ...variant, customSections: Array.isArray(variant.customSections) ? variant.customSections : [] })),
    };
  } catch {
    return null;
  }
}
