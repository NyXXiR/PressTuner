import { z } from "zod";

import { normalizeTagGroups, serializeTagGroups } from "./contentPresentation";
import { findResumeItemDateIssue, normalizeResumeItemDates } from "./itemDatePolicy";
import {
  clearDocumentItemSetting,
  clearRoleProfileItemSetting,
  narrativePlainText,
  orderResumeSections,
  resolveSection,
  resolveSectionTitle,
  resetRoleProfileSectionToShared,
  resetSupportVariantSectionToRole,
  updateCustomSection,
  updateDocumentItemSetting,
  updateRoleCustomSection,
  updateRoleProfileItemSetting,
  updateRoleProfileSectionSetting,
  updateSectionSetting,
  updateSharedSection,
  updateSharedSectionTitle,
  type EligibilityContent,
  type IdentityContent,
  type ItemContent,
  type ItemsContent,
  type NarrativeContent,
  type ResumeDocumentState,
  type ResumeRoleProfile,
  type ResumeSection,
  type ResumeVariant,
  type SectionContent,
  type TagsContent,
} from "./model";
import { resumeDocumentFingerprint } from "./persistence";

export const RESUME_AI_EDIT_PROTOCOL = "briefflow.resume.edit" as const;
export const RESUME_AI_EDIT_RESULT_PROTOCOL = "briefflow.resume.edit-result" as const;

const ShortTextSchema = z.string().max(500);
const BodyTextSchema = z.string().max(30_000);
const OptionalMonthSchema = z.union([
  z.literal(""),
  z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
]).optional();

export const ResumeAiEditContextSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("shared") }).strict(),
  z.object({ scope: z.literal("role"), roleProfileId: z.string().min(1) }).strict(),
  z.object({
    scope: z.literal("variant"),
    roleProfileId: z.string().min(1),
    variantId: z.string().min(1),
  }).strict(),
]);

export type ResumeAiEditContext = z.infer<typeof ResumeAiEditContextSchema>;

const IdentityPatchSchema = z.object({
  name: ShortTextSchema.optional(),
  email: ShortTextSchema.optional(),
  phone: ShortTextSchema.optional(),
  location: ShortTextSchema.optional(),
  gender: ShortTextSchema.optional(),
  birthDate: ShortTextSchema.optional(),
  links: z.array(ShortTextSchema).max(20).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one identity field is required");

const EligibilityPatchSchema = z.object({
  militaryStatus: ShortTextSchema.optional(),
  veteranStatus: ShortTextSchema.optional(),
  disabilityStatus: ShortTextSchema.optional(),
  employmentProtectionStatus: ShortTextSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one eligibility field is required");

const ItemKindSchema = z.enum([
  "work",
  "career-detail",
  "project",
  "career-description",
  "education",
  "credential",
  "award",
  "activity",
  "language",
  "training",
]);
const DetailTypeSchema = z.enum(["project", "responsibility", "improvement", "troubleshooting"]);
const ItemPatchShape = {
  itemKind: ItemKindSchema.optional(),
  meta: ShortTextSchema.optional(),
  startMonth: OptionalMonthSchema,
  endMonth: OptionalMonthSchema,
  endMonthEnabled: z.boolean().optional(),
  isCurrent: z.boolean().optional(),
  title: ShortTextSchema.optional(),
  subtitle: ShortTextSchema.optional(),
  detailType: DetailTypeSchema.optional(),
  detailLabel: ShortTextSchema.optional(),
  relatedWorkItemId: z.string().max(200).optional(),
  relatedWorkTitle: ShortTextSchema.optional(),
  body: BodyTextSchema.optional(),
  excludeFromCareerDuration: z.boolean().optional(),
} as const;
const ItemPatchSchema = z.object(ItemPatchShape).strict()
  .refine((value) => Object.keys(value).length > 0, "At least one item field is required");
const NewItemSchema = z.object(ItemPatchShape).extend({
  title: z.string().trim().min(1).max(500),
  body: BodyTextSchema,
}).strict();

export const ResumeAiEditOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("UPDATE_SECTION_TITLE"),
    sectionId: z.string().min(1),
    title: z.string().trim().min(1).max(200),
  }).strict(),
  z.object({
    type: z.literal("UPDATE_NARRATIVE"),
    sectionId: z.string().min(1),
    body: BodyTextSchema,
  }).strict(),
  z.object({
    type: z.literal("UPDATE_IDENTITY"),
    sectionId: z.string().min(1),
    patch: IdentityPatchSchema,
  }).strict(),
  z.object({
    type: z.literal("UPDATE_ELIGIBILITY"),
    sectionId: z.string().min(1),
    patch: EligibilityPatchSchema,
  }).strict(),
  z.object({
    type: z.literal("UPDATE_ITEM"),
    sectionId: z.string().min(1),
    itemId: z.string().min(1),
    patch: ItemPatchSchema,
  }).strict(),
  z.object({
    type: z.literal("ADD_ITEM"),
    sectionId: z.string().min(1),
    item: NewItemSchema,
  }).strict(),
  z.object({
    type: z.literal("UPDATE_TAGS"),
    sectionId: z.string().min(1),
    add: z.array(ShortTextSchema).max(100).default([]),
    remove: z.array(ShortTextSchema).max(100).default([]),
  }).strict().refine((value) => value.add.length > 0 || value.remove.length > 0, "Tags to add or remove are required"),
  z.object({
    type: z.literal("RESET_SECTION_TO_PARENT"),
    sectionId: z.string().min(1),
  }).strict(),
]);

export type ResumeAiEditOperation = z.infer<typeof ResumeAiEditOperationSchema>;

export const ResumeAiEditResultSchema = z.object({
  protocol: z.literal(RESUME_AI_EDIT_RESULT_PROTOCOL),
  version: z.literal(1),
  baseFingerprint: z.string().regex(/^[0-9a-f]{8}$/),
  editContext: ResumeAiEditContextSchema,
  operations: z.array(ResumeAiEditOperationSchema).min(1).max(50),
  assumptions: z.array(z.string().max(1_000)).max(20).default([]),
  warnings: z.array(z.string().max(1_000)).max(20).default([]),
}).strict();

export type ResumeAiEditResult = z.infer<typeof ResumeAiEditResultSchema>;

type ResolvedContext = {
  profile?: ResumeRoleProfile;
  variant?: ResumeVariant;
  sections: ResumeSection[];
};

export type ResumeAiEditChange = {
  operationType: ResumeAiEditOperation["type"];
  sectionId: string;
  sectionTitle: string;
  before: string;
  after: string;
};

export type PreparedResumeAiEdit = {
  state: ResumeDocumentState;
  changes: ResumeAiEditChange[];
  assumptions: string[];
  warnings: string[];
};

export class ResumeAiEditError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ResumeAiEditError";
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function contextEquals(left: ResumeAiEditContext, right: ResumeAiEditContext) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveContext(state: ResumeDocumentState, context: ResumeAiEditContext): ResolvedContext {
  if (context.scope === "shared") return { sections: state.sharedSections };
  const profile = state.roleProfiles.find((item) => item.id === context.roleProfileId);
  if (!profile) throw new ResumeAiEditError("RESUME_AI_EDIT_ROLE_NOT_FOUND", "선택한 직군 이력서를 찾을 수 없습니다.");
  if (context.scope === "role") {
    return { profile, sections: orderResumeSections(state.sharedSections, profile) };
  }
  const variant = state.variants.find(
    (item) => item.id === context.variantId && item.roleProfileId === profile.id,
  );
  if (!variant) throw new ResumeAiEditError("RESUME_AI_EDIT_VARIANT_NOT_FOUND", "선택한 지원 버전을 찾을 수 없습니다.");
  return { profile, variant, sections: orderResumeSections(state.sharedSections, profile, variant) };
}

function sectionInContext(state: ResumeDocumentState, context: ResumeAiEditContext, sectionId: string) {
  const resolved = resolveContext(state, context);
  const section = resolved.sections.find((item) => item.id === sectionId);
  if (!section) throw new ResumeAiEditError("RESUME_AI_EDIT_SECTION_NOT_FOUND", `편집 범위에 없는 섹션입니다: ${sectionId}`);
  return { ...resolved, section };
}

function effectiveContent(state: ResumeDocumentState, context: ResumeAiEditContext, sectionId: string) {
  const { section, profile, variant } = sectionInContext(state, context, sectionId);
  return resolveSection(section, profile, variant).content;
}

function effectiveTitle(state: ResumeDocumentState, context: ResumeAiEditContext, sectionId: string) {
  const { section, profile, variant } = sectionInContext(state, context, sectionId);
  return resolveSectionTitle(section, profile, variant);
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function writeSectionContent(
  state: ResumeDocumentState,
  context: ResumeAiEditContext,
  sectionId: string,
  content: SectionContent,
) {
  const { section, profile, variant } = sectionInContext(state, context, sectionId);
  if (context.scope === "shared") return updateSharedSection(state, section.id, content);
  if (!profile) return state;
  if (context.scope === "role") {
    if (profile.customSections.some((item) => item.id === section.id)) {
      return updateRoleCustomSection(state, profile.id, section.id, { content });
    }
    const parent = state.sharedSections.find((item) => item.id === section.id);
    if (parent && same(parent.content, content)) {
      return updateRoleProfileSectionSetting(state, profile.id, section.id, {
        mode: "inherit",
        content: undefined,
      });
    }
    return updateRoleProfileSectionSetting(state, profile.id, section.id, {
      mode: "override",
      content,
    });
  }
  if (!variant) return state;
  if (variant.customSections.some((item) => item.id === section.id)) {
    return updateCustomSection(state, variant.id, section.id, { content });
  }
  const parentContent = resolveSection(section, profile).content;
  if (same(parentContent, content)) {
    return updateSectionSetting(state, variant.id, section.id, {
      mode: "inherit",
      content: undefined,
    });
  }
  return updateSectionSetting(state, variant.id, section.id, {
    mode: "override",
    content,
  });
}

function writeSectionTitle(
  state: ResumeDocumentState,
  context: ResumeAiEditContext,
  sectionId: string,
  title: string,
) {
  const { section, profile, variant } = sectionInContext(state, context, sectionId);
  if (context.scope === "shared") return updateSharedSectionTitle(state, section.id, title);
  if (!profile) return state;
  if (context.scope === "role") {
    if (profile.customSections.some((item) => item.id === section.id)) {
      return updateRoleCustomSection(state, profile.id, section.id, { title });
    }
    const parentTitle = state.sharedSections.find((item) => item.id === section.id)?.title;
    return updateRoleProfileSectionSetting(state, profile.id, section.id, {
      title: parentTitle === title ? undefined : title,
    });
  }
  if (!variant) return state;
  if (variant.customSections.some((item) => item.id === section.id)) {
    return updateCustomSection(state, variant.id, section.id, { title });
  }
  const parentTitle = resolveSectionTitle(section, profile);
  return updateSectionSetting(state, variant.id, section.id, {
    title: parentTitle === title ? undefined : title,
  });
}

function resetSection(state: ResumeDocumentState, context: ResumeAiEditContext, sectionId: string) {
  const { section, profile, variant } = sectionInContext(state, context, sectionId);
  if (context.scope === "shared") {
    throw new ResumeAiEditError("RESUME_AI_EDIT_SHARED_RESET_INVALID", "공통 정보에는 상위 편집 범위가 없습니다.");
  }
  if (!profile || profile.customSections.some((item) => item.id === section.id)) {
    throw new ResumeAiEditError("RESUME_AI_EDIT_CUSTOM_RESET_INVALID", "현재 범위가 소유한 전용 섹션은 상위 내용으로 되돌릴 수 없습니다.");
  }
  if (context.scope === "role") return resetRoleProfileSectionToShared(state, profile.id, section.id);
  if (!variant || variant.customSections.some((item) => item.id === section.id)) {
    throw new ResumeAiEditError("RESUME_AI_EDIT_CUSTOM_RESET_INVALID", "현재 범위가 소유한 전용 섹션은 상위 내용으로 되돌릴 수 없습니다.");
  }
  return resetSupportVariantSectionToRole(state, variant.id, section.id);
}

function writeItemContent(
  state: ResumeDocumentState,
  context: ResumeAiEditContext,
  sectionId: string,
  itemId: string,
  content: ItemContent,
) {
  const { section, profile, variant } = sectionInContext(state, context, sectionId);
  if (context.scope === "shared") {
    const current = section.content as ItemsContent;
    return updateSharedSection(state, section.id, {
      ...current,
      items: current.items.map((item) => item.id === itemId ? content : item),
    });
  }
  if (!profile) return state;
  if (context.scope === "role") {
    const ownedSection = profile.customSections.find((item) => item.id === section.id);
    const sectionSetting = profile.settings[section.id];
    if (ownedSection || sectionSetting?.mode === "override") {
      const current = effectiveContent(state, context, section.id) as ItemsContent;
      return writeSectionContent(state, context, section.id, {
        ...current,
        items: current.items.map((item) => item.id === itemId ? content : item),
      });
    }
    const parentItem = (section.content as ItemsContent).items.find((item) => item.id === itemId);
    return parentItem && same(
      normalizeResumeItemDates(parentItem, section.id),
      normalizeResumeItemDates(content, section.id),
    )
      ? clearRoleProfileItemSetting(state, profile.id, section.id, itemId)
      : updateRoleProfileItemSetting(state, profile.id, section.id, itemId, { mode: "override", content });
  }
  if (!variant) return state;
  const ownedSection = variant.customSections.find((item) => item.id === section.id);
  const sectionSetting = variant.settings[section.id];
  if (ownedSection || sectionSetting?.mode === "override") {
    const current = effectiveContent(state, context, section.id) as ItemsContent;
    return writeSectionContent(state, context, section.id, {
      ...current,
      items: current.items.map((item) => item.id === itemId ? content : item),
    });
  }
  const parent = resolveSection(section, profile).content as ItemsContent;
  const parentItem = parent.items.find((item) => item.id === itemId);
  return parentItem && same(
    normalizeResumeItemDates(parentItem, section.id),
    normalizeResumeItemDates(content, section.id),
  )
    ? clearDocumentItemSetting(state, variant.id, section.id, itemId)
    : updateDocumentItemSetting(state, variant.id, section.id, itemId, { mode: "override", content });
}

function normalizedText(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function itemFingerprint(item: Pick<ItemContent, "title" | "subtitle" | "body" | "startMonth" | "endMonth">) {
  return [item.title, item.subtitle, item.body, item.startMonth, item.endMonth].map(normalizedText).join("\u0000");
}

function defaultItemId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return `ai-${globalThis.crypto.randomUUID()}`;
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function applyOperation(
  state: ResumeDocumentState,
  context: ResumeAiEditContext,
  operation: ResumeAiEditOperation,
  idFactory: () => string,
) {
  const { section } = sectionInContext(state, context, operation.sectionId);
  if (operation.type === "RESET_SECTION_TO_PARENT") return resetSection(state, context, section.id);
  if (operation.type === "UPDATE_SECTION_TITLE") {
    return writeSectionTitle(state, context, section.id, operation.title);
  }
  const current = effectiveContent(state, context, section.id);
  if (operation.type === "UPDATE_NARRATIVE") {
    if (section.kind !== "narrative") throw new ResumeAiEditError("RESUME_AI_EDIT_SECTION_KIND_MISMATCH", `${section.title}은 서술형 섹션이 아닙니다.`);
    return writeSectionContent(state, context, section.id, { body: operation.body });
  }
  if (operation.type === "UPDATE_IDENTITY") {
    if (section.kind !== "identity") throw new ResumeAiEditError("RESUME_AI_EDIT_SECTION_KIND_MISMATCH", `${section.title}은 인적사항 섹션이 아닙니다.`);
    return writeSectionContent(state, context, section.id, { ...(current as IdentityContent), ...operation.patch });
  }
  if (operation.type === "UPDATE_ELIGIBILITY") {
    if (section.kind !== "eligibility") throw new ResumeAiEditError("RESUME_AI_EDIT_SECTION_KIND_MISMATCH", `${section.title}은 자격 정보 섹션이 아닙니다.`);
    return writeSectionContent(state, context, section.id, { ...(current as EligibilityContent), ...operation.patch });
  }
  if (operation.type === "UPDATE_ITEM" || operation.type === "ADD_ITEM") {
    if (section.kind !== "items") throw new ResumeAiEditError("RESUME_AI_EDIT_SECTION_KIND_MISMATCH", `${section.title}은 항목형 섹션이 아닙니다.`);
    const content = current as ItemsContent;
    if (operation.type === "UPDATE_ITEM") {
      const existing = content.items.find((item) => item.id === operation.itemId);
      if (!existing) throw new ResumeAiEditError("RESUME_AI_EDIT_ITEM_NOT_FOUND", `편집 범위에 없는 항목입니다: ${operation.itemId}`);
      const updated = normalizeResumeItemDates({
        ...existing,
        ...operation.patch,
        ...(operation.patch.body !== undefined ? { bodyBlocks: undefined } : {}),
      }, section.id);
      const dateIssue = findResumeItemDateIssue(updated, section.id);
      if (dateIssue) throw new ResumeAiEditError("RESUME_AI_EDIT_ITEM_DATE_INVALID", dateIssue.message);
      return writeItemContent(state, context, section.id, existing.id, updated);
    }
    const added = normalizeResumeItemDates({
      id: idFactory(),
      ...operation.item,
      meta: operation.item.meta ?? "",
      subtitle: operation.item.subtitle ?? "",
    }, section.id);
    if (content.items.some((item) => itemFingerprint(item) === itemFingerprint(added))) {
      throw new ResumeAiEditError("RESUME_AI_EDIT_DUPLICATE_ITEM", `${section.title}에 같은 내용의 항목이 이미 있습니다.`);
    }
    const dateIssue = findResumeItemDateIssue(added, section.id);
    if (dateIssue) throw new ResumeAiEditError("RESUME_AI_EDIT_ITEM_DATE_INVALID", dateIssue.message);
    return writeSectionContent(state, context, section.id, {
      ...content,
      items: [...content.items, added],
    });
  }
  if (operation.type === "UPDATE_TAGS") {
    if (section.kind !== "tags") throw new ResumeAiEditError("RESUME_AI_EDIT_SECTION_KIND_MISMATCH", `${section.title}은 키워드 섹션이 아닙니다.`);
    const groups = normalizeTagGroups(current as TagsContent);
    const removals = new Set(operation.remove.map(normalizedText));
    const existing = new Set<string>();
    const filtered = groups.map((group) => ({
      ...group,
      keywords: group.keywords.filter((keyword) => {
        const normalized = normalizedText(keyword.label);
        if (removals.has(normalized)) return false;
        existing.add(normalized);
        return true;
      }),
    }));
    const target = filtered[0] ?? { id: "keywords", title: "기타", items: [], keywords: [] };
    const additions = operation.add
      .map((label) => label.trim())
      .filter((label) => label && !existing.has(normalizedText(label)));
    target.keywords = [
      ...target.keywords,
      ...additions.map((label, index) => ({ id: `${target.id}-ai-${Date.now().toString(36)}-${index}`, label })),
    ];
    if (!filtered.length) filtered.push(target);
    return writeSectionContent(state, context, section.id, serializeTagGroups(filtered));
  }
  return state;
}

function simplifiedContent(section: ResumeSection, content: SectionContent) {
  if (section.kind === "identity") {
    return Object.fromEntries(
      Object.entries(content as IdentityContent).filter(([key]) => key !== "photo" && key !== "photoName"),
    );
  }
  if (section.kind === "narrative") return { body: narrativePlainText(content as NarrativeContent) };
  if (section.kind === "items") {
    return {
      items: (content as ItemsContent).items.map((item) => Object.fromEntries(
        Object.entries(item).filter(([key]) => key !== "bodyBlocks" && key !== "source"),
      )),
    };
  }
  if (section.kind === "tags") {
    return {
      groups: normalizeTagGroups(content as TagsContent).map((group) => ({
        id: group.id,
        title: group.title,
        items: group.keywords.map((keyword) => keyword.label),
      })),
    };
  }
  return content;
}

function sectionSummary(section: ResumeSection, content: SectionContent) {
  if (section.kind === "narrative") return narrativePlainText(content as NarrativeContent);
  return JSON.stringify(simplifiedContent(section, content), null, 2);
}

export function createResumeAiEditBundle(
  state: ResumeDocumentState,
  context: ResumeAiEditContext,
) {
  const resolved = resolveContext(state, context);
  const sections = resolved.sections.map((section) => {
    const result = resolveSection(section, resolved.profile, resolved.variant);
    return {
      id: section.id,
      title: resolveSectionTitle(section, resolved.profile, resolved.variant),
      kind: section.kind,
      resolution: {
        source: result.source,
        mode: result.mode,
        hidden: result.mode === "hidden",
      },
      content: simplifiedContent(section, result.content),
    };
  });
  return {
    protocol: RESUME_AI_EDIT_PROTOCOL,
    version: 1,
    baseFingerprint: resumeDocumentFingerprint(JSON.stringify(state)),
    editContext: context,
    rules: {
      language: "ko-KR",
      useOnlyProvidedFacts: true,
      preserveSectionIdsAndItemIds: true,
      doNotInventMetricsDatesOrganizationsOrCredentials: true,
      doNotAddOrDeleteSections: true,
      returnJsonOnly: true,
      allowedOperations: [
        "UPDATE_SECTION_TITLE",
        "UPDATE_NARRATIVE",
        "UPDATE_IDENTITY",
        "UPDATE_ELIGIBILITY",
        "UPDATE_ITEM",
        "ADD_ITEM",
        "UPDATE_TAGS",
        "RESET_SECTION_TO_PARENT",
      ],
    },
    outputContract: {
      protocol: RESUME_AI_EDIT_RESULT_PROTOCOL,
      version: 1,
      baseFingerprint: "Copy the input baseFingerprint exactly",
      editContext: "Copy the input editContext exactly",
      operations: "Return only the operations needed for changed content",
      assumptions: "List any assumptions; use an empty array when there are none",
      warnings: "List missing facts or risks; use an empty array when there are none",
    },
    operationContracts: {
      UPDATE_SECTION_TITLE: { type: "UPDATE_SECTION_TITLE", sectionId: "existing section id", title: "new title" },
      UPDATE_NARRATIVE: { type: "UPDATE_NARRATIVE", sectionId: "existing narrative section id", body: "complete revised body" },
      UPDATE_IDENTITY: { type: "UPDATE_IDENTITY", sectionId: "existing identity section id", patch: { name: "only fields that change", email: "optional", phone: "optional", location: "optional", gender: "optional", birthDate: "optional", links: ["optional"] } },
      UPDATE_ELIGIBILITY: { type: "UPDATE_ELIGIBILITY", sectionId: "existing eligibility section id", patch: { militaryStatus: "only fields that change", veteranStatus: "optional", disabilityStatus: "optional", employmentProtectionStatus: "optional" } },
      UPDATE_ITEM: { type: "UPDATE_ITEM", sectionId: "existing items section id", itemId: "existing item id", patch: { title: "only fields that change", subtitle: "optional", body: "optional", meta: "optional", startMonth: "YYYY-MM optional", endMonth: "YYYY-MM optional", isCurrent: false } },
      ADD_ITEM: { type: "ADD_ITEM", sectionId: "existing items section id", item: { title: "required", body: "required", subtitle: "optional", meta: "optional", startMonth: "YYYY-MM optional", endMonth: "YYYY-MM optional", isCurrent: false } },
      UPDATE_TAGS: { type: "UPDATE_TAGS", sectionId: "existing tags section id", add: ["new tag"], remove: ["existing tag"] },
      RESET_SECTION_TO_PARENT: { type: "RESET_SECTION_TO_PARENT", sectionId: "an inherited section id" },
    },
    sections,
  };
}

export function serializeResumeAiEditBundle(
  state: ResumeDocumentState,
  context: ResumeAiEditContext,
) {
  return JSON.stringify(createResumeAiEditBundle(state, context), null, 2);
}

export function parseResumeAiEditResult(raw: string): ResumeAiEditResult {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  let value: unknown;
  try {
    value = JSON.parse(withoutFence);
  } catch {
    throw new ResumeAiEditError("RESUME_AI_EDIT_JSON_INVALID", "JSON 형식을 읽을 수 없습니다. GPT의 JSON 응답 전체를 붙여넣어 주세요.");
  }
  const parsed = ResumeAiEditResultSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join(".") : "result";
    throw new ResumeAiEditError("RESUME_AI_EDIT_RESULT_INVALID", `${path}: ${issue?.message ?? "편집 결과 형식이 올바르지 않습니다."}`);
  }
  return parsed.data;
}

export function selectResumeAiEditSections(
  result: ResumeAiEditResult,
  sectionIds: Iterable<string>,
): ResumeAiEditResult {
  const selected = new Set(sectionIds);
  const operations = result.operations.filter((operation) => selected.has(operation.sectionId));
  if (!operations.length) {
    throw new ResumeAiEditError("RESUME_AI_EDIT_SELECTION_REQUIRED", "반영할 섹션을 하나 이상 선택해 주세요.");
  }
  return { ...result, operations };
}

export function prepareResumeAiEdit(
  state: ResumeDocumentState,
  expectedContext: ResumeAiEditContext,
  result: ResumeAiEditResult,
  options: { idFactory?: () => string } = {},
): PreparedResumeAiEdit {
  const currentFingerprint = resumeDocumentFingerprint(JSON.stringify(state));
  if (result.baseFingerprint !== currentFingerprint) {
    throw new ResumeAiEditError("RESUME_AI_EDIT_DOCUMENT_CHANGED", "JSON을 복사한 뒤 이력서가 변경됐습니다. 최신 내용을 다시 복사해 GPT에 요청해 주세요.");
  }
  if (!contextEquals(result.editContext, expectedContext)) {
    throw new ResumeAiEditError("RESUME_AI_EDIT_CONTEXT_CHANGED", "GPT 결과의 편집 범위가 현재 선택한 공통·직군·지원 버전과 다릅니다.");
  }
  resolveContext(state, expectedContext);
  let next = clone(state);
  const changes: ResumeAiEditChange[] = [];
  const idFactory = options.idFactory ?? defaultItemId;
  for (const operation of result.operations) {
    const beforeContent = effectiveContent(next, expectedContext, operation.sectionId);
    const beforeTitle = effectiveTitle(next, expectedContext, operation.sectionId);
    const section = sectionInContext(next, expectedContext, operation.sectionId).section;
    const updated = applyOperation(next, expectedContext, operation, idFactory);
    const afterContent = effectiveContent(updated, expectedContext, operation.sectionId);
    const afterTitle = effectiveTitle(updated, expectedContext, operation.sectionId);
    if (same(beforeContent, afterContent) && beforeTitle === afterTitle) continue;
    changes.push({
      operationType: operation.type,
      sectionId: section.id,
      sectionTitle: afterTitle,
      before: operation.type === "UPDATE_SECTION_TITLE" ? beforeTitle : sectionSummary(section, beforeContent),
      after: operation.type === "UPDATE_SECTION_TITLE" ? afterTitle : sectionSummary(section, afterContent),
    });
    next = updated;
  }
  if (!changes.length) {
    throw new ResumeAiEditError("RESUME_AI_EDIT_NO_CHANGES", "현재 이력서와 달라지는 내용이 없습니다.");
  }
  return {
    state: next,
    changes,
    assumptions: result.assumptions,
    warnings: result.warnings,
  };
}
