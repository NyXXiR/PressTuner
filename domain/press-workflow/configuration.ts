import { z } from "zod";
import { sha256Canonical } from "../evaluation/configurationIdentity";

const nonEmpty = z.string().trim().min(1);
const writingFields = {
  model: nonEmpty,
  tone: z.enum(["formal", "neutral", "friendly"]),
  stylePolicy: z.string(),
  requiredPhrases: z.array(nonEmpty),
  forbiddenPhrases: z.array(nonEmpty),
};
export const draftDefaultsSchema = z.object({ revision: nonEmpty, ...writingFields }).strict();
export const draftOverrideSchema = z.object(writingFields).partial().extend({ revision: nonEmpty }).strict();

export const draftInputSchema = z.object({
  announceType: nonEmpty,
  serviceName: z.string().optional(),
  oneLiner: z.string().optional(),
  points: z.array(z.string()),
  quoteMessage: z.string().optional(),
  quoteWho: z.string().optional(),
  rawText: z.string().optional(),
  eventAt: z.string().datetime({ offset: true }).optional(),
  publishAt: z.string().datetime({ offset: true }).optional(),
  acceptedFacts: z.array(z.object({
    id: nonEmpty, content: nonEmpty, evidence: z.string().optional(),
  }).strict()).default([]),
  styleExamples: z.string().default(""),
}).strict().refine((input) => new Set(input.acceptedFacts.map((fact) => fact.id)).size === input.acceptedFacts.length,
  "accepted fact IDs must be unique");

export const draftRunInputSchema = z.object({
  caseId: nonEmpty,
  frozenAt: z.string().datetime({ offset: true }),
  input: draftInputSchema,
  defaults: draftDefaultsSchema,
  override: draftOverrideSchema.optional(),
}).strict();

export type DraftConfiguration = Omit<z.infer<typeof draftDefaultsSchema>, "revision">;

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Explicit fields replace defaults, including empty strings/arrays. Never append old guidance. */
export function resolveDraftConfiguration(defaultsInput: unknown, overrideInput?: unknown) {
  const defaults = draftDefaultsSchema.parse(defaultsInput);
  const override = overrideInput === undefined ? null : draftOverrideSchema.parse(overrideInput);
  const fields = z.object(writingFields).parse(defaults);
  const replacement = override === null ? {} : Object.fromEntries(
    Object.entries(override).filter(([key, value]) => key !== "revision" && value !== undefined),
  );
  const effective = z.object(writingFields).parse({ ...fields, ...replacement });
  const snapshot = freeze({ defaults, override, effective });
  return freeze({ snapshot, contentHash: sha256Canonical(snapshot) });
}
