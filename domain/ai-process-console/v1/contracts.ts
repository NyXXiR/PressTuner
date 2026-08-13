import { z } from "zod";

export const IdentifierSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/);
export const OpaqueReferenceSchema = z.string().min(1).max(256).regex(/^ref:[A-Za-z0-9._:/+-]+$/);
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const TimestampSchema = z.string().datetime({ offset: true });
export const ExecutionModeSchema = z.enum(["TEST", "LIVE"]);

const SafeExternalLinkSchema = z.strictObject({
  label: z.string().min(1).max(64),
  url: z.string().url().max(2048),
});

const LangSmithObservabilityReferenceV1Schema = z.strictObject({ provider: z.literal("LANGSMITH"), traceId: IdentifierSchema, spanId: IdentifierSchema.optional(), link: SafeExternalLinkSchema.optional() });
const OpenTelemetryObservabilityReferenceV1Schema = z.strictObject({ provider: z.literal("OPENTELEMETRY"), traceId: IdentifierSchema, spanId: IdentifierSchema.optional(), link: SafeExternalLinkSchema.optional() });
const PostHogObservabilityReferenceV1BaseSchema = z.strictObject({ provider: z.literal("POSTHOG"), metricKey: IdentifierSchema, windowStart: TimestampSchema, windowEnd: TimestampSchema, link: SafeExternalLinkSchema.optional() });

const addPostHogIntervalIssue = (
  reference: z.infer<typeof PostHogObservabilityReferenceV1BaseSchema>,
  context: z.RefinementCtx,
) => {
  if (Date.parse(reference.windowStart) >= Date.parse(reference.windowEnd)) {
    context.addIssue({ code: "custom", message: "PostHog windowStart must be earlier than windowEnd", path: ["windowEnd"] });
  }
};

const ObservabilityReferenceV1BaseSchema = z.discriminatedUnion("provider", [
  LangSmithObservabilityReferenceV1Schema,
  OpenTelemetryObservabilityReferenceV1Schema,
  PostHogObservabilityReferenceV1BaseSchema,
]);

export const ObservabilityReferenceV1Schema = ObservabilityReferenceV1BaseSchema.superRefine((reference, context) => {
  if (reference.provider === "POSTHOG") addPostHogIntervalIssue(reference, context);
});

export type ObservabilityReferenceV1 = z.infer<typeof ObservabilityReferenceV1Schema>;
export type TechnicalObservabilityReferenceV1 = Extract<ObservabilityReferenceV1, { provider: "LANGSMITH" | "OPENTELEMETRY" }>;
export type PostHogObservabilityReferenceV1 = Extract<ObservabilityReferenceV1, { provider: "POSTHOG" }>;

type ReferenceCategory = "TECHNICAL" | "POSTHOG";
const categoryOf = (reference: ObservabilityReferenceV1): ReferenceCategory => reference.provider === "POSTHOG" ? "POSTHOG" : "TECHNICAL";
const linksEqual = (left: ObservabilityReferenceV1["link"], right: ObservabilityReferenceV1["link"]) => left?.label === right?.label && left?.url === right?.url;
const referencesEqual = (left: ObservabilityReferenceV1, right: ObservabilityReferenceV1): boolean => {
  if (left.provider !== right.provider || !linksEqual(left.link, right.link)) return false;
  if (left.provider === "POSTHOG" && right.provider === "POSTHOG") return left.metricKey === right.metricKey && left.windowStart === right.windowStart && left.windowEnd === right.windowEnd;
  if (left.provider !== "POSTHOG" && right.provider !== "POSTHOG") return left.traceId === right.traceId && left.spanId === right.spanId;
  return false;
};

export const ObservabilityReferencesV1Schema: z.ZodType<readonly ObservabilityReferenceV1[]> = z.array(ObservabilityReferenceV1Schema).min(1).max(2).superRefine((references, context) => {
  const categories = new Set<ReferenceCategory>();
  for (const [index, reference] of references.entries()) {
    const category = categoryOf(reference);
    if (categories.has(category)) context.addIssue({ code: "custom", message: "Observability references must contain at most one reference per category", path: [index] });
    categories.add(category);
  }
  if (references.length === 2 && categoryOf(references[0]) !== "TECHNICAL") context.addIssue({ code: "custom", message: "Technical observability reference must precede PostHog", path: [0] });
});

export type ObservabilityReferenceCarrierV1 = {
  trace?: ObservabilityReferenceV1;
  observabilityReferences?: readonly ObservabilityReferenceV1[];
};

export function resolveObservabilityReferencesV1(input: ObservabilityReferenceCarrierV1): readonly ObservabilityReferenceV1[] {
  const trace = input.trace === undefined ? undefined : ObservabilityReferenceV1Schema.parse(input.trace);
  const additive = input.observabilityReferences === undefined ? [] : z.array(ObservabilityReferenceV1Schema).min(1).max(2).parse(input.observabilityReferences);
  let technical: TechnicalObservabilityReferenceV1 | undefined;
  let posthog: PostHogObservabilityReferenceV1 | undefined;
  for (const reference of [trace, ...additive]) {
    if (!reference) continue;
    const current = reference.provider === "POSTHOG" ? posthog : technical;
    if (current && !referencesEqual(current, reference)) throw new Error(`Observability reference conflict in ${categoryOf(reference).toLowerCase()} category`);
    if (reference.provider === "POSTHOG") posthog = reference;
    else technical = reference;
  }
  return Object.freeze([...(technical ? [technical] : []), ...(posthog ? [posthog] : [])]);
}

export const forbiddenIntegrationKeys = Object.freeze([
  "body", "content", "evidenceText", "input", "output", "prompt", "raw", "sourceBody",
  "authorization", "callbackUrl", "credential", "headers", "hostname", "password", "secret", "token", "url",
] as const);

const forbidden = new Set<string>(forbiddenIntegrationKeys.map((key) => key.toLowerCase()));
export function findForbiddenIntegrationPaths(value: unknown, path = "$", seen = new Set<object>()): string[] {
  if (value === null || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((child, index) => findForbiddenIntegrationPaths(child, `${path}[${index}]`, seen));
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    ...(forbidden.has(key.toLowerCase()) ? [`${path}.${key}`] : []),
    ...findForbiddenIntegrationPaths(child, `${path}.${key}`, seen),
  ]);
}

export function assertPrivacySafe(value: unknown): void {
  const paths = findForbiddenIntegrationPaths(value);
  if (paths.length > 0) throw new Error(`AI_PROCESS_CONSOLE_FORBIDDEN_KEY:${paths.join(",")}`);
}

export const SafeArtifactSummarySchema = z.strictObject({
  classification: z.enum(["PUBLIC", "INTERNAL_SAFE"]),
  text: z.string().min(1).max(160),
});

export const ArtifactReferenceV1Schema = z.strictObject({
  artifactId: IdentifierSchema,
  schemaVersion: z.string().min(1).max(32),
  sha256: Sha256Schema,
  mediaType: z.string().min(1).max(128),
  sizeBytes: z.number().int().nonnegative().max(1_000_000_000),
  locator: OpaqueReferenceSchema,
  summary: SafeArtifactSummarySchema.optional(),
});

export const MemoSourcePolicyV1Schema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  policyId: IdentifierSchema,
  classification: z.literal("CONTENT_FREE"),
  description: z.string().min(1).max(500),
});

export const EvidencePolicyV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("NONE") }),
  z.strictObject({ kind: z.literal("SOURCE_BOUND"), sourceSetRef: ArtifactReferenceV1Schema }),
  z.strictObject({ kind: z.literal("RETRIEVED_CORPUS"), corpusRef: ArtifactReferenceV1Schema, minimumEvidenceItems: z.number().int().min(1).max(20) }),
  z.strictObject({ kind: z.literal("EXTERNAL_VERIFICATION"), verifierRef: IdentifierSchema }),
]);

export const ClaimEvidenceEvaluationV1Schema = z.strictObject({
  claimId: IdentifierSchema,
  claimSha256: Sha256Schema,
  result: z.enum(["SUPPORTED", "UNSUPPORTED", "CONTRADICTED"]),
  evidenceArtifacts: z.array(ArtifactReferenceV1Schema).max(20),
  evaluatorRef: IdentifierSchema,
  reasonCodes: z.array(z.enum(["CITATION_MATCH", "INSUFFICIENT_EVIDENCE", "SOURCE_CONFLICT", "VERIFIER_UNAVAILABLE", "POLICY_NOT_APPLICABLE"])).max(8),
});

export const ProcessNodeV1Schema = z.strictObject({
  nodeId: IdentifierSchema,
  label: z.string().min(1).max(120),
  kind: z.enum(["ACTION", "DECISION", "HUMAN_GATE", "TERMINAL"]),
  handlerRef: IdentifierSchema,
  inputSchema: ArtifactReferenceV1Schema.optional(),
  outputSchema: ArtifactReferenceV1Schema.optional(),
  evidencePolicy: EvidencePolicyV1Schema,
});

export const ProcessTransitionV1Schema = z.strictObject({
  transitionId: IdentifierSchema,
  sourceNodeId: IdentifierSchema,
  targetNodeId: IdentifierSchema,
  decisionRef: IdentifierSchema,
});

export const ProcessDefinitionV1Schema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  processId: IdentifierSchema,
  version: z.string().min(1).max(64),
  canonicalSha256: Sha256Schema,
  entryNodeIds: z.array(IdentifierSchema).min(1),
  nodes: z.array(ProcessNodeV1Schema).min(1),
  transitions: z.array(ProcessTransitionV1Schema),
}).superRefine((definition, context) => {
  const nodeIds = new Set<string>();
  for (const node of definition.nodes) {
    if (nodeIds.has(node.nodeId)) context.addIssue({ code: "custom", message: `Duplicate node ID: ${node.nodeId}`, path: ["nodes"] });
    nodeIds.add(node.nodeId);
  }
  const transitionIds = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const transition of definition.transitions) {
    if (transitionIds.has(transition.transitionId)) context.addIssue({ code: "custom", message: `Duplicate transition ID: ${transition.transitionId}`, path: ["transitions"] });
    transitionIds.add(transition.transitionId);
    if (!nodeIds.has(transition.sourceNodeId)) context.addIssue({ code: "custom", message: `Missing source node: ${transition.sourceNodeId}`, path: ["transitions"] });
    if (!nodeIds.has(transition.targetNodeId)) context.addIssue({ code: "custom", message: `Missing target node: ${transition.targetNodeId}`, path: ["transitions"] });
    adjacency.set(transition.sourceNodeId, [...(adjacency.get(transition.sourceNodeId) ?? []), transition.targetNodeId]);
  }
  for (const entry of definition.entryNodeIds) if (!nodeIds.has(entry)) context.addIssue({ code: "custom", message: `Missing entry node: ${entry}`, path: ["entryNodeIds"] });
  if (!definition.nodes.some((node) => node.kind === "TERMINAL")) context.addIssue({ code: "custom", message: "At least one terminal node is required", path: ["nodes"] });
  const reachable = new Set<string>();
  const queue = [...definition.entryNodeIds];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (reachable.has(node) || !nodeIds.has(node)) continue;
    reachable.add(node);
    queue.push(...(adjacency.get(node) ?? []));
  }
  for (const node of nodeIds) if (!reachable.has(node)) context.addIssue({ code: "custom", message: `Unreachable node: ${node}`, path: ["nodes"] });
});

export const ProjectProcessDescriptorV1Schema = z.strictObject({
  processId: IdentifierSchema,
  version: z.string().min(1).max(64),
  canonicalSha256: Sha256Schema,
  definition: ArtifactReferenceV1Schema,
}).superRefine((descriptor, context) => {
  if (descriptor.definition.sha256 !== descriptor.canonicalSha256) context.addIssue({ code: "custom", message: "Definition artifact hash must match canonicalSha256", path: ["definition", "sha256"] });
});

export const ProjectIntegrationManifestV1Schema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  manifestId: IdentifierSchema,
  projectId: IdentifierSchema,
  displayName: z.string().min(1).max(120),
  environment: z.string().min(1).max(64),
  serviceName: z.string().min(1).max(128),
  processes: z.array(ProjectProcessDescriptorV1Schema).min(1).max(100),
  capabilities: z.strictObject({
    domainEvents: z.strictObject({
      schemaVersion: z.literal("1.0"),
      source: z.string().min(5).max(256).regex(/^urn:[A-Za-z0-9][A-Za-z0-9._:/+-]*$/),
      delivery: z.literal("AT_LEAST_ONCE"),
      ordering: z.literal("PER_ATTEMPT_MONOTONIC_SEQUENCE"),
      deduplicationKey: z.literal("SOURCE_AND_EVENT_ID"),
      transactionalOutbox: z.literal(true),
    }),
    testRun: z.discriminatedUnion("available", [
      z.strictObject({ available: z.literal(false) }),
      z.strictObject({ available: z.literal(true), isolation: z.literal("PROJECT_OWNED_FIXTURE_ONLY"), endpoint: z.strictObject({ destinationId: IdentifierSchema, transport: z.literal("INJECTED") }) }),
    ]),
  }),
}).superRefine((manifest, context) => {
  const identities = new Set<string>();
  for (const [index, descriptor] of manifest.processes.entries()) {
    const identity = `${descriptor.processId}\u0000${descriptor.version}`;
    if (identities.has(identity)) context.addIssue({ code: "custom", message: "Duplicate process/version descriptor", path: ["processes", index] });
    identities.add(identity);
  }
});

export const CanonicalMetadataSchema = z.strictObject({
  projectId: IdentifierSchema.optional(), environment: z.string().min(1).max(64).optional(), serviceName: z.string().min(1).max(128).optional(),
  caseId: IdentifierSchema.optional(), objectType: z.string().min(1).max(64).optional(), objectRef: OpaqueReferenceSchema.optional(), operationId: IdentifierSchema.optional(),
  attemptId: IdentifierSchema.optional(), correlationId: IdentifierSchema.optional(), processId: IdentifierSchema.optional(), processVersion: z.string().min(1).max(64).optional(),
  processDefinitionHash: Sha256Schema.optional(), executionMode: ExecutionModeSchema.optional(), testRunId: IdentifierSchema.optional(), traceId: IdentifierSchema.optional(), spanId: IdentifierSchema.optional(),
  eventId: IdentifierSchema.optional(), occurredAt: TimestampSchema.optional(), eventType: z.string().min(1).max(160).optional(), sequence: z.number().int().nonnegative().optional(),
  nodeId: IdentifierSchema.optional(), transitionId: IdentifierSchema.optional(), causationId: IdentifierSchema.optional(),
});

const envelope = {
  specversion: z.literal("1.0"), id: IdentifierSchema, source: z.string().min(1).max(256), subject: z.string().min(1).max(256), time: TimestampSchema,
  schemaVersion: z.literal("1.0"), correlationId: IdentifierSchema, causationId: IdentifierSchema.optional(), sequence: z.number().int().nonnegative(),
  executionMode: ExecutionModeSchema, trace: ObservabilityReferenceV1Schema.optional(), observabilityReferences: ObservabilityReferencesV1Schema.optional(), metadata: CanonicalMetadataSchema.optional(),
} as const;
const refineObservabilityCarrier = (value: ObservabilityReferenceCarrierV1, context: z.RefinementCtx) => {
  try { resolveObservabilityReferencesV1(value); }
  catch { context.addIssue({ code: "custom", message: "Legacy and additive observability references conflict", path: ["observabilityReferences"] }); }
};
const event = <T extends string, S extends z.ZodType>(type: T, data: S) => z.strictObject({ ...envelope, type: z.literal(type), data }).superRefine(refineObservabilityCarrier);

export const EventV1Schema = z.discriminatedUnion("type", [
  event("dev.aiprocess.event.test-run.accepted.v1", z.strictObject({ testRunId: IdentifierSchema, processDefinition: ArtifactReferenceV1Schema })),
  event("dev.aiprocess.event.test-run.rejected.v1", z.strictObject({ testRunId: IdentifierSchema, reasonCode: z.enum(["FIXTURE_NOT_FOUND", "DEFINITION_NOT_FOUND", "ISOLATION_UNAVAILABLE", "REQUEST_INVALID"]) })),
  event("dev.aiprocess.event.attempt.started.v1", z.strictObject({ attemptId: IdentifierSchema })),
  event("dev.aiprocess.event.node.execution.started.v1", z.strictObject({ nodeId: IdentifierSchema, handlerRef: IdentifierSchema })),
  event("dev.aiprocess.event.node.execution.completed.v1", z.strictObject({ nodeId: IdentifierSchema, handlerRef: IdentifierSchema, durationMs: z.number().int().nonnegative(), outputArtifact: ArtifactReferenceV1Schema.optional() })),
  event("dev.aiprocess.event.node.execution.failed.v1", z.strictObject({ nodeId: IdentifierSchema, handlerRef: IdentifierSchema, errorCode: IdentifierSchema })),
  event("dev.aiprocess.event.transition.evaluated.v1", z.strictObject({ transitionId: IdentifierSchema, sourceNodeId: IdentifierSchema, targetNodeId: IdentifierSchema, matched: z.boolean(), decisionRef: IdentifierSchema })),
  event("dev.aiprocess.event.transition.selected.v1", z.strictObject({ transitionId: IdentifierSchema, sourceNodeId: IdentifierSchema, targetNodeId: IdentifierSchema, decisionRef: IdentifierSchema })),
  event("dev.aiprocess.event.evidence.evaluated.v1", z.strictObject({ nodeId: IdentifierSchema, policy: EvidencePolicyV1Schema, evaluations: z.array(ClaimEvidenceEvaluationV1Schema).max(100) })),
  event("dev.aiprocess.event.attempt.completed.v1", z.strictObject({ attemptId: IdentifierSchema, resultArtifact: ArtifactReferenceV1Schema.optional() })),
  event("dev.aiprocess.event.attempt.failed.v1", z.strictObject({ attemptId: IdentifierSchema, failureCode: IdentifierSchema })),
  event("dev.aiprocess.event.test-run.completed.v1", z.strictObject({ testRunId: IdentifierSchema, outcome: z.enum(["SUCCEEDED", "FAILED"]) })),
]);

export const TestRunRequestedCommandV1Schema = z.strictObject({
  ...envelope,
  type: z.literal("dev.aiprocess.command.test-run.requested.v1"),
  executionMode: z.literal("TEST"),
  data: z.strictObject({ testRunId: IdentifierSchema, projectId: IdentifierSchema, processDefinition: ArtifactReferenceV1Schema, fixture: ArtifactReferenceV1Schema }),
}).superRefine(refineObservabilityCarrier);

export type ArtifactReferenceV1 = z.infer<typeof ArtifactReferenceV1Schema>;
export type ProcessDefinitionV1 = z.infer<typeof ProcessDefinitionV1Schema>;
export type ProjectIntegrationManifestV1 = z.infer<typeof ProjectIntegrationManifestV1Schema>;
export type CanonicalMetadata = z.infer<typeof CanonicalMetadataSchema>;
export type EventV1 = z.infer<typeof EventV1Schema>;
export type TestRunRequestedCommandV1 = z.infer<typeof TestRunRequestedCommandV1Schema>;
