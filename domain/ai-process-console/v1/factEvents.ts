import { canonicalJson, sha256Canonical, sha256Text } from "./canonicalJson";
import { AI_PROCESS_CONSOLE_SOURCE, buildProjectManifest, buildProcessDefinition, processDefinitionReference } from "./publication";
import { EventV1Schema, assertPrivacySafe, resolveObservabilityReferencesV1, type ArtifactReferenceV1, type CanonicalMetadata, type EventV1, type ObservabilityReferenceV1, type ProjectIntegrationManifestV1 } from "./contracts";

type FactData = EventV1["data"];
type FactType = EventV1["type"];

export type FactIdentity = Readonly<{
  caseId: string;
  objectType: string;
  operationId: string;
  attemptId: string;
  correlationId: string;
  testRunId: string;
  trace?: ObservabilityReferenceV1;
  observabilityReferences?: readonly ObservabilityReferenceV1[];
}>;

export type FactFactory = Readonly<{
  identity: FactIdentity;
  eventIdFor: (logicalKey: string) => string;
  create: (input: { type: FactType; logicalKey: string; sequence: number; data: FactData; occurredAt?: Date; causationId?: string }) => EventV1;
}>;

function deterministicEventId(source: string, attemptId: string, logicalKey: string): string {
  return `event-${sha256Canonical({ source, attemptId, logicalKey }).slice(0, 48)}`;
}

export function buildCheckpointOutputReference(args: { checkpointId: string; output: unknown }): ArtifactReferenceV1 {
  const canonical = canonicalJson(args.output);
  return Object.freeze({
    artifactId: `checkpoint-${args.checkpointId}`,
    schemaVersion: "1.0",
    sha256: sha256Text(canonical),
    mediaType: "application/json",
    sizeBytes: Buffer.byteLength(canonical),
    locator: `ref:press-ai-debug-checkpoints/${args.checkpointId}/output`,
  });
}

function contentFreeReference(reference: ObservabilityReferenceV1): ObservabilityReferenceV1 {
  if (reference.provider === "POSTHOG") return Object.freeze({ provider: reference.provider, metricKey: reference.metricKey, windowStart: reference.windowStart, windowEnd: reference.windowEnd });
  return Object.freeze({ provider: reference.provider, traceId: reference.traceId, ...(reference.spanId === undefined ? {} : { spanId: reference.spanId }) });
}

function reconcileMetadata(event: Omit<EventV1, "metadata">, claimed: CanonicalMetadata): CanonicalMetadata {
  const derived: CanonicalMetadata = { eventId: event.id, occurredAt: event.time, eventType: event.type, correlationId: event.correlationId, sequence: event.sequence, executionMode: event.executionMode };
  if (event.causationId !== undefined) derived.causationId = event.causationId;
  for (const field of ["attemptId", "nodeId", "transitionId", "testRunId"] as const) {
    const value = (event.data as Record<string, unknown>)[field];
    if (typeof value === "string") derived[field] = value;
  }
  for (const [key, value] of Object.entries(derived)) {
    const claimedValue = claimed[key as keyof CanonicalMetadata];
    if (claimedValue !== undefined && claimedValue !== value) throw new Error(`AI_PROCESS_CONSOLE_ENVELOPE_MISMATCH:${key}`);
  }
  return { ...claimed, ...derived };
}

export function createResolvedFactFactory(args: { identity: FactIdentity; manifest?: ProjectIntegrationManifestV1; clock?: () => Date }): FactFactory {
  const definition = buildProcessDefinition();
  const manifest = args.manifest ?? buildProjectManifest(definition);
  const descriptor = manifest.processes.find((item) => item.processId === definition.processId && item.version === definition.version);
  if (!descriptor) throw new Error("AI_PROCESS_CONSOLE_DEFINITION_NOT_FOUND");
  const clock = args.clock ?? (() => new Date());
  const effectiveReferences = resolveObservabilityReferencesV1(args.identity).map(contentFreeReference);
  const technical = effectiveReferences.find((reference) => reference.provider !== "POSTHOG");
  const posthog = effectiveReferences.find((reference) => reference.provider === "POSTHOG");
  const trace = technical ?? posthog;
  const observabilityReferences = technical && posthog ? Object.freeze([posthog]) : undefined;
  const identity = Object.freeze({
    caseId: args.identity.caseId,
    objectType: args.identity.objectType,
    operationId: args.identity.operationId,
    attemptId: args.identity.attemptId,
    correlationId: args.identity.correlationId,
    testRunId: args.identity.testRunId,
    ...(trace === undefined ? {} : { trace }),
    ...(observabilityReferences === undefined ? {} : { observabilityReferences }),
  });
  const inherited: CanonicalMetadata = {
    projectId: manifest.projectId, environment: manifest.environment, serviceName: manifest.serviceName,
    caseId: args.identity.caseId, objectType: args.identity.objectType, operationId: args.identity.operationId,
    attemptId: args.identity.attemptId, correlationId: args.identity.correlationId,
    processId: descriptor.processId, processVersion: descriptor.version, processDefinitionHash: descriptor.canonicalSha256,
    executionMode: "TEST", testRunId: args.identity.testRunId,
  };
  if (technical?.provider === "LANGSMITH" || technical?.provider === "OPENTELEMETRY") {
    inherited.traceId = technical.traceId;
    if (technical.spanId !== undefined) inherited.spanId = technical.spanId;
  }
  const eventIdFor = (logicalKey: string) => deterministicEventId(AI_PROCESS_CONSOLE_SOURCE, args.identity.attemptId, logicalKey);
  return Object.freeze({
    identity,
    eventIdFor,
    create(input) {
      const id = eventIdFor(input.logicalKey);
      const bare = {
        specversion: "1.0" as const, id, source: AI_PROCESS_CONSOLE_SOURCE, subject: `attempts/${args.identity.attemptId}`,
        time: (input.occurredAt ?? clock()).toISOString(), schemaVersion: "1.0" as const, correlationId: args.identity.correlationId,
        causationId: input.causationId, sequence: input.sequence, executionMode: "TEST" as const,
        ...(trace === undefined ? {} : { trace }),
        ...(observabilityReferences === undefined ? {} : { observabilityReferences }),
        type: input.type, data: input.data,
      } as Omit<EventV1, "metadata">;
      const parsed = EventV1Schema.parse({ ...bare, metadata: reconcileMetadata(bare, inherited) });
      assertPrivacySafe(parsed);
      return Object.freeze(parsed);
    },
  });
}

export function createUnresolvedRejectionFact(args: { testRunId: string; correlationId: string; commandId: string; reasonCode: "FIXTURE_NOT_FOUND" | "DEFINITION_NOT_FOUND" | "ISOLATION_UNAVAILABLE" | "REQUEST_INVALID"; occurredAt?: Date }): EventV1 {
  const time = (args.occurredAt ?? new Date()).toISOString();
  const id = deterministicEventId(AI_PROCESS_CONSOLE_SOURCE, args.testRunId, `rejected:${args.commandId}`);
  const bare = {
    specversion: "1.0" as const, id, source: AI_PROCESS_CONSOLE_SOURCE, subject: `test-runs/${args.testRunId}`, time, schemaVersion: "1.0" as const,
    correlationId: args.correlationId, causationId: args.commandId, sequence: 1, executionMode: "TEST" as const,
    type: "dev.aiprocess.event.test-run.rejected.v1" as const, data: { testRunId: args.testRunId, reasonCode: args.reasonCode },
  };
  const metadata: CanonicalMetadata = { projectId: "presstuner", environment: "conformance", serviceName: "presstuner", correlationId: args.correlationId, executionMode: "TEST", testRunId: args.testRunId, eventId: id, occurredAt: time, eventType: bare.type, sequence: 1, causationId: args.commandId };
  const parsed = EventV1Schema.parse({ ...bare, metadata });
  assertPrivacySafe(parsed);
  return Object.freeze(parsed);
}

export function hashPrivateClaim(value: string): string {
  return sha256Canonical({ claim: value });
}

export const publishedProcessDefinitionReference = processDefinitionReference(buildProcessDefinition());
export const canonicalFactContent = (event: EventV1) => canonicalJson(EventV1Schema.parse(event));
