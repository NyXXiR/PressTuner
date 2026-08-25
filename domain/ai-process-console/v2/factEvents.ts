import { canonicalJson, sha256Canonical, sha256Text } from "../v1/canonicalJson";
import { AI_PROCESS_CONSOLE_SOURCE } from "../v1/publication";
import type { ArtifactReferenceV1 } from "../v1/contracts";
import { AttemptMetadataV2Schema, EventV2Schema, RunMetadataV2Schema, type AttemptMetadataV2, type EventV2, type ProcessDefinitionV2, type RunMetadataV2 } from "./contracts";
import { buildProcessDefinitionV2 } from "./publication";

export type V2FactIdentity = Readonly<{
  caseId: string;
  objectType: string;
  operationId: string;
  attemptId: string;
  testRunId?: string;
}>;

export type V2FactFactory = Readonly<{
  identity: V2FactIdentity;
  metadata: AttemptMetadataV2;
  eventIdFor: (logicalKey: string) => string;
  create: (input: { type: EventV2["type"]; logicalKey: string; sequence: number; data: unknown; occurredAt?: Date; causationId?: string }) => EventV2;
}>;

export type V2RunFactFactory = Readonly<{
  testRunId: string;
  metadata: RunMetadataV2;
  eventIdFor: (logicalKey: string) => string;
  create: (input: { type: Extract<EventV2, { metadata: { scope: "RUN" } }>["type"]; logicalKey: string; sequence: number; data: unknown; occurredAt?: Date; causationId?: string }) => EventV2;
}>;

const eventId = (attemptId: string, logicalKey: string) => `event-${sha256Canonical({ source: AI_PROCESS_CONSOLE_SOURCE, attemptId, logicalKey }).slice(0, 48)}`;

export function buildV2OutputReference(args: { checkpointId: string; output: unknown }): ArtifactReferenceV1 {
  const content = canonicalJson(args.output);
  return Object.freeze({ artifactId: `checkpoint-${args.checkpointId}`, schemaVersion: "2.0", sha256: sha256Text(content), mediaType: "application/json", sizeBytes: Buffer.byteLength(content), locator: `ref:press-ai-debug-checkpoints/${args.checkpointId}/output` });
}

export function createV2FactFactory(args: { identity: V2FactIdentity; definition?: ProcessDefinitionV2; executionMode?: "TEST" | "LIVE"; clock?: () => Date }): V2FactFactory {
  const definition = args.definition ?? buildProcessDefinitionV2();
  const executionMode = args.executionMode ?? "TEST";
  const metadata = Object.freeze({
    projectId: "presstuner", environment: "conformance", serviceName: "presstuner",
    processId: definition.processId, processVersion: definition.version, processDefinitionHash: definition.canonicalSha256,
    scope: "ATTEMPT" as const, caseId: args.identity.caseId, objectType: args.identity.objectType, operationId: args.identity.operationId,
    attemptId: args.identity.attemptId, executionMode,
    ...(executionMode === "TEST" ? { testRunId: args.identity.testRunId } : {}),
  });
  const parsedMetadata = AttemptMetadataV2Schema.parse(metadata) as AttemptMetadataV2;
  const clock = args.clock ?? (() => new Date());
  const eventIdFor = (logicalKey: string) => eventId(args.identity.attemptId, logicalKey);
  return Object.freeze({
    identity: Object.freeze({ ...args.identity }), metadata: parsedMetadata, eventIdFor,
    create(input) {
      return Object.freeze(EventV2Schema.parse({
        specversion: "1.0", id: eventIdFor(input.logicalKey), source: AI_PROCESS_CONSOLE_SOURCE, subject: `attempts/${args.identity.attemptId}`,
        time: (input.occurredAt ?? clock()).toISOString(), schemaVersion: "2.0", correlationId: args.identity.caseId,
        ...(input.causationId ? { causationId: input.causationId } : {}), sequence: input.sequence, metadata: parsedMetadata,
        type: input.type, data: input.data,
      }));
    },
  });
}

export function createV2RunFactFactory(args: { testRunId: string; definition?: ProcessDefinitionV2; clock?: () => Date }): V2RunFactFactory {
  const definition = args.definition ?? buildProcessDefinitionV2();
  const metadata = RunMetadataV2Schema.parse({
    projectId: "presstuner", environment: "conformance", serviceName: "presstuner",
    processId: definition.processId, processVersion: definition.version, processDefinitionHash: definition.canonicalSha256,
    scope: "RUN", executionMode: "TEST", testRunId: args.testRunId,
  });
  const clock = args.clock ?? (() => new Date());
  const eventIdFor = (logicalKey: string) => eventId(args.testRunId, logicalKey);
  return Object.freeze({
    testRunId: args.testRunId, metadata, eventIdFor,
    create(input) {
      return Object.freeze(EventV2Schema.parse({
        specversion: "1.0", id: eventIdFor(input.logicalKey), source: AI_PROCESS_CONSOLE_SOURCE, subject: `test-runs/${args.testRunId}`,
        time: (input.occurredAt ?? clock()).toISOString(), schemaVersion: "2.0", correlationId: args.testRunId,
        ...(input.causationId ? { causationId: input.causationId } : {}), sequence: input.sequence, metadata,
        type: input.type, data: input.data,
      }));
    },
  });
}

export const canonicalV2FactContent = (event: EventV2) => canonicalJson(EventV2Schema.parse(event));
