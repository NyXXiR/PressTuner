import { z } from "zod";

const boundedText = (maximum: number) => z.string().max(maximum);
const optionalText = (maximum: number) => boundedText(maximum).optional();
const identifier = z.string().min(1).max(160);
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u);

const resumeItemSchema = z.object({
  id: identifier,
  itemKind: z.enum([
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
  ]).optional(),
  meta: boundedText(500),
  startMonth: yearMonth.optional(),
  endMonth: yearMonth.optional(),
  endMonthEnabled: z.boolean().optional(),
  isCurrent: z.boolean().optional(),
  title: boundedText(500),
  subtitle: boundedText(1_000),
  detailType: z.enum(["project", "responsibility", "improvement", "troubleshooting"]).optional(),
  relatedWorkItemId: optionalText(160),
  relatedWorkTitle: optionalText(500),
  body: boundedText(30_000),
  source: z.object({
    type: z.literal("experience-brick"),
    id: identifier,
  }).strict().optional(),
}).strict();

const identityContentSchema = z.object({
  name: boundedText(300),
  email: boundedText(500),
  phone: optionalText(100),
  location: optionalText(500),
  gender: optionalText(100),
  birthDate: optionalText(100),
  links: z.array(boundedText(2_000)).max(30),
  photo: z.string()
    .max(2_000_000)
    .regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/u, "Photo must be a local JPEG data URL")
    .optional(),
  photoName: optionalText(500),
}).strict();

const eligibilityContentSchema = z.object({
  militaryStatus: optionalText(200),
  veteranStatus: optionalText(200),
  disabilityStatus: optionalText(200),
  employmentProtectionStatus: optionalText(200),
}).strict();

const narrativeContentSchema = z.object({
  body: boundedText(120_000),
  blocks: z.array(z.object({
    id: identifier,
    type: z.enum(["p", "h1", "h2", "h3", "h4", "h5", "h6"]),
    runs: z.array(z.object({
      text: boundedText(30_000),
      bold: z.boolean().optional(),
    }).strict()).max(300),
  }).strict()).max(500).optional(),
}).strict();

const itemsContentSchema = z.object({
  items: z.array(resumeItemSchema).max(300),
  sortDirection: z.enum(["latest-first", "oldest-first"]).optional(),
  careerDurationOverrideMonths: z.number().int().min(0).max(1_200).optional(),
}).strict();

const tagsContentSchema = z.object({
  items: z.array(boundedText(500)).max(300),
}).strict();

const sectionBase = {
  id: identifier,
  title: boundedText(500),
  layout: z.enum(["standard", "compact", "cards"]).optional(),
  pageBreakBefore: z.boolean().optional(),
  sharedCustom: z.boolean().optional(),
  custom: z.boolean().optional(),
  hidden: z.boolean().optional(),
};

const resumePdfSectionSchema = z.discriminatedUnion("kind", [
  z.object({ ...sectionBase, kind: z.literal("identity"), content: identityContentSchema }).strict(),
  z.object({ ...sectionBase, kind: z.literal("eligibility"), content: eligibilityContentSchema }).strict(),
  z.object({ ...sectionBase, kind: z.literal("narrative"), content: narrativeContentSchema }).strict(),
  z.object({ ...sectionBase, kind: z.literal("items"), content: itemsContentSchema }).strict(),
  z.object({ ...sectionBase, kind: z.literal("tags"), content: tagsContentSchema }).strict(),
]);

export const resumePdfSnapshotSchema = z.object({
  company: boundedText(500),
  documentName: boundedText(500),
  role: boundedText(500),
  sections: z.array(resumePdfSectionSchema).max(80),
  relatedWorkItems: z.array(resumeItemSchema).max(300),
  currentMonth: yearMonth.optional(),
}).strict().refine(
  (snapshot) => JSON.stringify(snapshot).length <= 8_000_000,
  { message: "Resume PDF snapshot is too large" },
);

export const resumePdfRequestSchema = z.object({
  snapshot: resumePdfSnapshotSchema,
}).strict();

export type ResumePdfSnapshot = z.infer<typeof resumePdfSnapshotSchema>;
export type ResumePdfSection = ResumePdfSnapshot["sections"][number];

export function safeResumePdfFilename(documentName: string): string {
  const sanitized = documentName
    .replace(/\p{Cc}/gu, "")
    .replace(/[<>:"/\\|?*]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[ .]+$/gu, "");
  const withoutSuffix = sanitized.replace(/(?:\.pdf)+$/giu, "").trim().replace(/[ .]+$/gu, "");
  const base = Array.from(withoutSuffix).slice(0, 115).join("").trim().replace(/[ .]+$/gu, "");
  return `${base || "resume"}.pdf`;
}
