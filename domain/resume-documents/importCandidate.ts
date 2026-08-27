import { z } from "zod";

import type {
  EligibilityContent,
  IdentityContent,
  ItemContent,
  ItemsContent,
  NarrativeContent,
  ResumeDocumentState,
  ResumeSection,
  SectionKind,
  TagsContent,
} from "./model";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isCalendarDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

const IdentityFieldPayloadSchema = z.object({
  type: z.literal("identity-field"),
  field: z.enum(["name", "email", "phone", "location", "birthDate", "gender", "link"]),
  value: z.string().trim().min(1).max(2_000),
}).superRefine((value, context) => {
  if (value.field === "birthDate" && !isCalendarDate(value.value)) {
    context.addIssue({ code: "custom", path: ["value"], message: "Invalid birth date" });
  }
  if (value.field === "email" && !z.email().safeParse(value.value).success) {
    context.addIssue({ code: "custom", path: ["value"], message: "Invalid email" });
  }
  if (value.field === "link" && !z.url().safeParse(value.value).success) {
    context.addIssue({ code: "custom", path: ["value"], message: "Invalid link" });
  }
});

const IdentityFieldsSchema = z.object({
  name: z.string().trim().min(1).max(2_000).optional(),
  email: z.string().trim().min(1).max(2_000).optional(),
  phone: z.string().trim().min(1).max(2_000).optional(),
  location: z.string().trim().min(1).max(2_000).optional(),
  birthDate: z.string().trim().min(1).max(2_000).optional(),
  gender: z.string().trim().min(1).max(2_000).optional(),
  link: z.string().trim().min(1).max(2_000).optional(),
}).superRefine((fields, context) => {
  if (!Object.values(fields).some(Boolean)) {
    context.addIssue({ code: "custom", message: "At least one identity field is required" });
  }
  if (fields.birthDate && !isCalendarDate(fields.birthDate)) {
    context.addIssue({ code: "custom", path: ["birthDate"], message: "Invalid birth date" });
  }
  if (fields.email && !z.email().safeParse(fields.email).success) {
    context.addIssue({ code: "custom", path: ["email"], message: "Invalid email" });
  }
  if (fields.link && !z.url().safeParse(fields.link).success) {
    context.addIssue({ code: "custom", path: ["link"], message: "Invalid link" });
  }
});

const OptionalMonthSchema = z.string().trim().refine(
  (value) => value === "" || MONTH_PATTERN.test(value),
  "Invalid month",
).optional();

export const ResumeDocumentCandidatePayloadSchema = z.union([
  IdentityFieldPayloadSchema,
  z.object({
    type: z.literal("identity"),
    fields: IdentityFieldsSchema,
  }),
  z.object({
    type: z.literal("narrative"),
    body: z.string().trim().min(1).max(20_000),
  }),
  z.object({
    type: z.literal("item"),
    itemKind: z.enum([
      "work",
      "project",
      "education",
      "credential",
      "award",
      "activity",
      "language",
      "training",
    ]),
    title: z.string().trim().min(1).max(500),
    subtitle: z.string().trim().max(500).default(""),
    relatedWorkTitle: z.string().trim().max(500).optional(),
    body: z.string().trim().max(10_000).default(""),
    startMonth: OptionalMonthSchema,
    endMonth: OptionalMonthSchema,
    isCurrent: z.boolean().default(false),
    tags: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  }).superRefine((value, context) => {
    if (value.startMonth && value.endMonth && value.startMonth > value.endMonth) {
      context.addIssue({ code: "custom", path: ["endMonth"], message: "End month precedes start month" });
    }
  }),
  z.object({
    type: z.literal("tags"),
    values: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
  }),
  z.object({
    type: z.literal("eligibility-field"),
    field: z.enum(["militaryStatus", "veteranStatus", "disabilityStatus", "employmentProtectionStatus"]),
    value: z.string().trim().min(1).max(500),
  }),
]);

export type ResumeDocumentCandidatePayload = z.infer<typeof ResumeDocumentCandidatePayloadSchema>;
export type ResumeDocumentCandidateKind = "IDENTITY_FIELD" | "NARRATIVE" | "ITEM" | "TAGS" | "ELIGIBILITY_FIELD";
export type ResumeDocumentApplyMode = "FILL_EMPTY" | "APPEND" | "MERGE" | "REPLACE";

export type ResumeDocumentImportCommand = {
  candidateKey: string;
  payloadHash: string;
  targetSectionId: string;
  applyMode: ResumeDocumentApplyMode;
  payload: ResumeDocumentCandidatePayload;
  appliedAt: string;
};

export function isResumeDocumentApplyModeAllowed(
  payload: ResumeDocumentCandidatePayload,
  mode: ResumeDocumentApplyMode,
) {
  if (payload.type === "item") return mode === "APPEND";
  if (payload.type === "tags") return mode === "MERGE" || mode === "REPLACE";
  if (payload.type === "narrative") return mode === "FILL_EMPTY" || mode === "MERGE" || mode === "REPLACE";
  return mode === "FILL_EMPTY" || mode === "REPLACE";
}

export const resumeDocumentPayloadSectionKind = (payload: ResumeDocumentCandidatePayload): SectionKind => {
  if (payload.type === "identity-field" || payload.type === "identity") return "identity";
  if (payload.type === "eligibility-field") return "eligibility";
  if (payload.type === "narrative") return "narrative";
  if (payload.type === "tags") return "tags";
  return "items";
};

const STARTER_PLACEHOLDERS = new Set([
  "이름",
  "email@example.com",
  "나를 가장 잘 설명하는 강점과 일하는 방식을 간결하게 적어주세요.",
]);

const isEmptyValue = (value: string | undefined) => !value?.trim() || STARTER_PLACEHOLDERS.has(value.trim());
const normalizeKey = (value: string | undefined) => value?.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ") ?? "";

const identityEntries = (payload: Extract<ResumeDocumentCandidatePayload, { type: "identity" | "identity-field" }>) =>
  payload.type === "identity-field"
    ? [[payload.field, payload.value] as const]
    : Object.entries(payload.fields) as Array<[keyof typeof payload.fields, string]>;

function itemKey(item: Pick<ItemContent, "title" | "subtitle" | "startMonth" | "endMonth">) {
  return [item.title, item.subtitle, item.startMonth, item.endMonth].map(normalizeKey).join("|");
}

function textSimilarity(left: string | undefined, right: string | undefined) {
  const tokens = (value: string | undefined) => new Set(
    normalizeKey(value).split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 2),
  );
  const a = tokens(left);
  const b = tokens(right);
  if (a.size < 2 || b.size < 2) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / (a.size + b.size - intersection);
}

export type ResumeImportOverlap = {
  level: "none" | "exact" | "possible";
  message?: string;
};

export function inspectResumeImportOverlap(
  section: ResumeSection,
  payload: ResumeDocumentCandidatePayload,
): ResumeImportOverlap {
  if (section.kind !== resumeDocumentPayloadSectionKind(payload)) return { level: "none" };
  if (payload.type === "identity-field" || payload.type === "identity") {
    const content = section.content as IdentityContent;
    const entries = identityEntries(payload);
    const matches = entries.filter(([field, value]) => field === "link"
      ? content.links.some((link) => normalizeKey(link) === normalizeKey(value))
      : normalizeKey(content[field]) === normalizeKey(value));
    return matches.length === entries.length
      ? { level: "exact", message: "인적사항에 같은 값이 이미 있습니다." }
      : { level: "none" };
  }
  if (payload.type === "eligibility-field") {
    const content = section.content as EligibilityContent;
    return normalizeKey(content[payload.field]) === normalizeKey(payload.value)
      ? { level: "exact", message: "같은 값이 이미 있습니다." }
      : { level: "none" };
  }
  if (payload.type === "tags") {
    const current = new Set((section.content as TagsContent).items.map(normalizeKey));
    return payload.values.every((value) => current.has(normalizeKey(value)))
      ? { level: "exact", message: "제안된 역량이 모두 이미 있습니다." }
      : { level: "none" };
  }
  if (payload.type === "narrative") {
    const existing = (section.content as NarrativeContent).body;
    const currentKey = normalizeKey(existing);
    const payloadKey = normalizeKey(payload.body);
    if (currentKey && payloadKey && (currentKey.includes(payloadKey) || payloadKey.includes(currentKey))) {
      return { level: "exact", message: "같은 소개 내용이 이미 있습니다." };
    }
    return textSimilarity(existing, payload.body) >= 0.72
      ? { level: "possible", message: "기존 소개와 내용이 많이 겹칩니다. 개별 확인이 필요합니다." }
      : { level: "none" };
  }
  const items = (section.content as ItemsContent).items;
  if (items.some((item) => itemKey(item) === itemKey(payload))) {
    return { level: "exact", message: "같은 제목·소속·기간의 항목이 이미 있습니다." };
  }
  const possible = items.some((item) => {
    const sameTitle = normalizeKey(item.title) === normalizeKey(payload.title);
    const samePeriod = normalizeKey(item.startMonth) === normalizeKey(payload.startMonth)
      && normalizeKey(item.endMonth) === normalizeKey(payload.endMonth);
    const combinedExisting = [item.title, item.subtitle, item.body].join(" ");
    const combinedCandidate = [payload.title, payload.subtitle, payload.body].join(" ");
    return (sameTitle && samePeriod) || textSimilarity(combinedExisting, combinedCandidate) >= 0.72;
  });
  return possible
    ? { level: "possible", message: "기존 항목과 제목·기간 또는 내용이 유사합니다. 개별 확인이 필요합니다." }
    : { level: "none" };
}

function commandItem(payload: Extract<ResumeDocumentCandidatePayload, { type: "item" }>, candidateKey: string): ItemContent {
  const start = payload.startMonth ?? "";
  const endMonth = payload.isCurrent ? "" : payload.endMonth ?? "";
  const end = payload.isCurrent ? "현재" : endMonth;
  return {
    id: `import-${candidateKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    itemKind: payload.itemKind,
    meta: start && end ? `${start.replace("-", ".")} — ${end.replace("-", ".")}` : start || end,
    startMonth: payload.startMonth,
    endMonth,
    endMonthEnabled: Boolean(endMonth),
    isCurrent: payload.isCurrent,
    title: payload.title,
    subtitle: payload.subtitle,
    relatedWorkTitle: payload.relatedWorkTitle,
    body: payload.body,
  };
}

function applyPayloadToSection(
  current: ResumeSection,
  command: ResumeDocumentImportCommand,
  payload: ResumeDocumentCandidatePayload,
) {
  if (payload.type === "identity-field" || payload.type === "identity") {
    const content = current.content as IdentityContent;
    if (!(["FILL_EMPTY", "REPLACE"] as ResumeDocumentApplyMode[]).includes(command.applyMode)) {
      throw new Error("RESUME_IMPORT_APPLY_MODE_INVALID");
    }
    const next = identityEntries(payload).reduce<IdentityContent>((result, [field, value]) => {
      if (field === "link") {
        const existingLinks = result.links.length === 1 && result.links[0] === "https://portfolio.example.com" ? [] : result.links;
        if (command.applyMode === "FILL_EMPTY" && existingLinks.length > 0) return result;
        return { ...result, links: command.applyMode === "REPLACE" ? [value] : [value] };
      }
      if (command.applyMode === "FILL_EMPTY" && !isEmptyValue(result[field])) return result;
      return { ...result, [field]: value };
    }, content);
    return { ...current, content: next };
  }
  if (payload.type === "eligibility-field") {
    const content = current.content as EligibilityContent;
    const existing = content[payload.field];
    if (command.applyMode === "FILL_EMPTY" && !isEmptyValue(existing)) return current;
    if (!(["FILL_EMPTY", "REPLACE"] as ResumeDocumentApplyMode[]).includes(command.applyMode)) {
      throw new Error("RESUME_IMPORT_APPLY_MODE_INVALID");
    }
    return { ...current, content: { ...content, [payload.field]: payload.value } };
  }
  if (payload.type === "narrative") {
    const content = current.content as NarrativeContent;
    if (command.applyMode === "FILL_EMPTY" && !isEmptyValue(content.body)) return current;
    if (command.applyMode === "MERGE" && !isEmptyValue(content.body)) {
      if (inspectResumeImportOverlap(current, payload).level === "exact") return current;
      return { ...current, content: { body: `${content.body.trim()}\n\n${payload.body}` } };
    }
    if (!(["FILL_EMPTY", "REPLACE", "MERGE"] as ResumeDocumentApplyMode[]).includes(command.applyMode)) {
      throw new Error("RESUME_IMPORT_APPLY_MODE_INVALID");
    }
    return { ...current, content: { body: payload.body } };
  }
  if (payload.type === "tags") {
    if (!(["APPEND", "MERGE", "REPLACE"] as ResumeDocumentApplyMode[]).includes(command.applyMode)) {
      throw new Error("RESUME_IMPORT_APPLY_MODE_INVALID");
    }
    const content = current.content as TagsContent;
    const starterTags = ["문제 해결", "협업", "제품 개발"];
    const existingItems = content.items.length === starterTags.length && content.items.every((item, index) => item === starterTags[index])
      ? []
      : content.items;
    const values = command.applyMode === "REPLACE" ? payload.values : [...existingItems, ...payload.values];
    const seen = new Set<string>();
    return {
      ...current,
      content: {
        items: values.filter((value) => {
          const key = normalizeKey(value);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      },
    };
  }
  if (command.applyMode !== "APPEND") throw new Error("RESUME_IMPORT_APPLY_MODE_INVALID");
  const content = current.content as ItemsContent;
  const nextItem = commandItem(payload, command.candidateKey);
  const starterTitles = new Set([
    "회사명",
    "이전 회사명",
    "프로젝트명",
    "프로젝트 또는 업무명",
    "이전 프로젝트 또는 업무명",
    "학교 · 과정",
    "자격 또는 수상명",
  ]);
  const existingItems = content.items.filter((item) => !starterTitles.has(item.title));
  const duplicate = existingItems.some((item) => itemKey(item) === itemKey(nextItem));
  return duplicate && existingItems.length === content.items.length
    ? current
    : { ...current, content: { ...content, items: duplicate ? existingItems : [...existingItems, nextItem] } };
}

function applyPayload(
  state: ResumeDocumentState,
  command: ResumeDocumentImportCommand,
  payload: ResumeDocumentCandidatePayload,
) {
  const matchingSections = [
    ...state.sharedSections,
    ...state.roleProfiles.flatMap((profile) => profile.customSections),
    ...state.variants.flatMap((variant) => variant.customSections),
  ].filter((section) => section.id === command.targetSectionId);
  if (matchingSections.length === 0) throw new Error("RESUME_IMPORT_SECTION_NOT_FOUND");
  if (matchingSections.length > 1) throw new Error("RESUME_IMPORT_SECTION_AMBIGUOUS");
  const section = matchingSections[0];
  if (section.kind !== resumeDocumentPayloadSectionKind(payload)) throw new Error("RESUME_IMPORT_SECTION_KIND_MISMATCH");
  const update = (current: ResumeSection) => current.id === section.id
    ? applyPayloadToSection(current, command, payload)
    : current;
  return {
    ...state,
    sharedSections: state.sharedSections.map(update),
    roleProfiles: state.roleProfiles.map((profile) => ({
      ...profile,
      customSections: profile.customSections.map(update),
    })),
    variants: state.variants.map((variant) => ({
      ...variant,
      customSections: variant.customSections.map(update),
    })),
  };
}

export function applyResumeImportCommand(
  state: ResumeDocumentState,
  input: ResumeDocumentImportCommand,
): ResumeDocumentState {
  const payload = ResumeDocumentCandidatePayloadSchema.parse(input.payload);
  if (!isResumeDocumentApplyModeAllowed(payload, input.applyMode)) {
    throw new Error("RESUME_IMPORT_APPLY_MODE_INVALID");
  }
  const existing = state.importLedger.find((entry) => entry.candidateKey === input.candidateKey);
  if (existing?.payloadHash === input.payloadHash) return state;
  if (existing) throw new Error("RESUME_IMPORT_COMMAND_HASH_CONFLICT");
  if (!input.candidateKey.trim() || !input.payloadHash.trim() || !input.appliedAt.trim()) {
    throw new Error("RESUME_IMPORT_COMMAND_INVALID");
  }
  const applied = applyPayload(state, input, payload);
  return {
    ...applied,
    importLedger: [
      ...state.importLedger,
      {
        candidateKey: input.candidateKey,
        payloadHash: input.payloadHash,
        targetSectionId: input.targetSectionId,
        appliedAt: input.appliedAt,
      },
    ],
  };
}
