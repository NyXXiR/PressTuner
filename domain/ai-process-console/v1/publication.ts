import { pressCreationProcess, ragQueryProcess, type PressAiProcessDefinition } from "@/domain/press-ai-debugger/processRegistry";
import { canonicalJson, canonicalJsonFile, sha256Canonical, sha256Text } from "./canonicalJson";
import { MemoSourcePolicyV1Schema, ProcessDefinitionV1Schema, ProjectIntegrationManifestV1Schema, assertPrivacySafe, type ArtifactReferenceV1, type ProcessDefinitionV1, type ProjectIntegrationManifestV1 } from "./contracts";
import { fixtureRegistry } from "./fixtureRegistry";
import { buildProcessDefinitionV2, buildProcessDefinitionV2Compatibility } from "../v2/publication";
import { fixtureRegistryV2 } from "../v2/fixtureRegistry";
import type { ProcessDefinitionV2 } from "../v2/contracts";

export const AI_PROCESS_CONSOLE_SOURCE = "urn:presstuner:ai-process-console:facts:v1";
export const AI_PROCESS_CONSOLE_DESTINATION = "presstuner.ai-process-console.test-run.v1";

export const memoSourcePolicy = Object.freeze(MemoSourcePolicyV1Schema.parse({
  schemaVersion: "1.0",
  policyId: "presstuner:memo-source-policy:v1",
  classification: "CONTENT_FREE",
  description: "Synthetic memo claims are checked against fixture-owned claim hashes; source text is never published in facts.",
}));

function artifactReference(args: { artifactId: string; schemaVersion?: string; locator: string; value: unknown; sha256?: string }): ArtifactReferenceV1 {
  const canonical = canonicalJson(args.value);
  return { artifactId: args.artifactId, schemaVersion: args.schemaVersion ?? "1.0", sha256: args.sha256 ?? sha256Text(canonical), mediaType: "application/json", sizeBytes: Buffer.byteLength(canonical), locator: args.locator };
}

export const memoSourcePolicyReference = Object.freeze(artifactReference({
  artifactId: "presstuner-memo-source-policy-v1",
  locator: "ref:policies/presstuner/memo-source/v1",
  value: memoSourcePolicy,
}));

const nodeKinds = new Map<string, "ACTION" | "HUMAN_GATE" | "TERMINAL">([
  ["article-initialization", "ACTION"], ["brief-normalization", "HUMAN_GATE"], ["draft-generation", "HUMAN_GATE"], ["draft-review", "HUMAN_GATE"], ["selected-rewrite", "TERMINAL"],
]);

const evidencePolicies = new Map<string, ProcessDefinitionV1["nodes"][number]["evidencePolicy"]>([
  ["article-initialization", { kind: "NONE" }],
  ["brief-normalization", { kind: "SOURCE_BOUND", sourceSetRef: memoSourcePolicyReference }],
  ["draft-generation", { kind: "EXTERNAL_VERIFICATION", verifierRef: "presstuner:verifier:evidence-fact-consistency:v1" }],
  ["draft-review", { kind: "NONE" }],
  ["selected-rewrite", { kind: "NONE" }],
]);

function buildDefinition(args: {
  process: PressAiProcessDefinition;
  nodeKind: (nodeId: string) => ProcessDefinitionV1["nodes"][number]["kind"];
  handlerRef: (nodeId: string, operationKey: string) => string;
  evidencePolicy: (nodeId: string) => ProcessDefinitionV1["nodes"][number]["evidencePolicy"];
}): ProcessDefinitionV1 {
  const base = {
    schemaVersion: "1.0" as const,
    processId: args.process.id,
    version: args.process.version,
    entryNodeIds: [args.process.nodes.slice().sort((a, b) => a.sequence - b.sequence)[0].id],
    nodes: args.process.nodes.slice().sort((a, b) => a.sequence - b.sequence).map((node) => ({
      nodeId: node.id,
      label: node.label,
      kind: args.nodeKind(node.id),
      handlerRef: args.handlerRef(node.id, node.operationKey),
      evidencePolicy: args.evidencePolicy(node.id),
    })),
    transitions: args.process.edges.slice().sort((a, b) => a.sequence - b.sequence).map((edge) => ({
      transitionId: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      decisionRef: `presstuner:decision:${edge.id}:v1`,
    })),
  };
  return ProcessDefinitionV1Schema.parse({ ...base, canonicalSha256: sha256Canonical(base) });
}

export function buildProcessDefinition(): ProcessDefinitionV1 {
  // Publication convention: hash canonical definition content with canonicalSha256 omitted,
  // then inject that digest into the published definition and all descriptor references.
  return buildDefinition({
    process: pressCreationProcess,
    nodeKind: (nodeId) => nodeKinds.get(nodeId)!,
    handlerRef: (_nodeId, operationKey) => `presstuner:handler:${operationKey}:v1`,
    evidencePolicy: (nodeId) => evidencePolicies.get(nodeId)!,
  });
}

const ragNodeKinds = new Map<string, ProcessDefinitionV1["nodes"][number]["kind"]>([
  ["request-intake", "ACTION"],
  ["retrieval-execution", "ACTION"],
  ["evidence-decision", "DECISION"],
  ["response-behavior", "ACTION"],
  ["verification", "DECISION"],
  ["fallback", "ACTION"],
  ["terminal-evaluation", "TERMINAL"],
]);

export function buildRagQueryProcessDefinition(): ProcessDefinitionV1 {
  return buildDefinition({
    process: ragQueryProcess,
    nodeKind: (nodeId) => ragNodeKinds.get(nodeId)!,
    handlerRef: (nodeId) => `presstuner:handler:rag-query:${nodeId}:v1`,
    evidencePolicy: () => ({ kind: "NONE" }),
  });
}

export function processDefinitionReference(definition: ProcessDefinitionV1 | ProcessDefinitionV2 = buildProcessDefinition()): ArtifactReferenceV1 {
  return artifactReference({ artifactId: `presstuner-${definition.processId}-${definition.version}`, schemaVersion: definition.schemaVersion, locator: `ref:definitions/presstuner/${definition.processId}/${definition.version}`, value: definition, sha256: definition.canonicalSha256 });
}

export function buildProjectManifest(input?: ProcessDefinitionV1 | ProcessDefinitionV2 | readonly (ProcessDefinitionV1 | ProcessDefinitionV2)[]): ProjectIntegrationManifestV1 {
  const definitions = input === undefined
    ? [buildProcessDefinition(), buildProcessDefinitionV2(), buildProcessDefinitionV2Compatibility(), buildRagQueryProcessDefinition()]
    : Array.isArray(input) ? input : [input];
  const manifest = {
    schemaVersion: "1.0" as const,
    manifestId: "presstuner.ai-process-console.v1",
    projectId: "presstuner",
    displayName: "PressTuner",
    environment: "conformance",
    serviceName: "presstuner",
    processes: definitions.map((definition) => ({ processId: definition.processId, version: definition.version, canonicalSha256: definition.canonicalSha256, definition: processDefinitionReference(definition) })),
    capabilities: {
      domainEvents: { schemaVersion: "1.0" as const, source: AI_PROCESS_CONSOLE_SOURCE, delivery: "AT_LEAST_ONCE" as const, ordering: "PER_ATTEMPT_MONOTONIC_SEQUENCE" as const, deduplicationKey: "SOURCE_AND_EVENT_ID" as const, transactionalOutbox: true as const },
      testRun: { available: true as const, isolation: "PROJECT_OWNED_FIXTURE_ONLY" as const, endpoint: { destinationId: AI_PROCESS_CONSOLE_DESTINATION, transport: "INJECTED" as const } },
      projectTestDebug: { available: true as const, protocol: "AIPC_PROJECT_TEST_DEBUG_V2" as const, isolation: "PROJECT_OWNED_TEST_ONLY" as const, endpoint: { destinationId: "presstuner.ai-process-console.project-test-debug.v2", transport: "INJECTED" as const } },
    },
  };
  assertPrivacySafe(manifest);
  return ProjectIntegrationManifestV1Schema.parse(manifest);
}

export function publishedArtifacts(): Readonly<Record<string, unknown>> {
  const definition = buildProcessDefinition();
  const definitionV2 = buildProcessDefinitionV2();
  const definitionV2Compatibility = buildProcessDefinitionV2Compatibility();
  const ragDefinition = buildRagQueryProcessDefinition();
  const definitions = [definition, definitionV2, definitionV2Compatibility, ragDefinition];
  const testFixtures = [
    ...fixtureRegistry.filter(({ fixture }) => fixture.fixtureId === "success-v1").map(({ fixture, artifact }) => ({ declarationId: fixture.fixtureId, label: "PressTuner v1 합성 성공", projectId: "presstuner", processId: fixture.processId, processVersion: fixture.processVersion, processDefinitionSha256: definition.canonicalSha256, fixture: artifact })),
    ...fixtureRegistryV2.map(({ fixture, artifact }) => ({ declarationId: fixture.fixtureId, label: fixture.scenario === "QUALITY_BLOCK" ? "PressTuner v2 완성본 품질 BLOCK" : fixture.scenario === "TRANSITION_WARN" ? "PressTuner v2 브리프 전이 WARN" : fixture.scenario === "TRANSITION_BLOCK" ? "PressTuner v2 브리프 전이 BLOCK" : "PressTuner v2 합성 성공", projectId: "presstuner", processId: fixture.processId, processVersion: fixture.processVersion, processDefinitionSha256: fixture.processVersion === definitionV2Compatibility.version ? definitionV2Compatibility.canonicalSha256 : definitionV2.canonicalSha256, fixture: artifact })),
  ];
  return Object.freeze({
    "integrations/ai-process-console/v1/project-manifest.json": buildProjectManifest(definitions),
    "integrations/ai-process-console/registration-bundle.json": { manifest: buildProjectManifest(definitions), definitions, testFixtures },
    "integrations/ai-process-console/v1/press-creation-2.1.0.definition.json": definition,
    "integrations/ai-process-console/v2/press-creation-3.0.0.definition.json": definitionV2,
    "integrations/ai-process-console/v2/press-creation-3.1.0.definition.json": definitionV2Compatibility,
    "integrations/ai-process-console/v1/rag-query-1.0.0.definition.json": ragDefinition,
    "integrations/ai-process-console/v1/memo-source-policy-v1.json": memoSourcePolicy,
    ...Object.fromEntries(fixtureRegistry.map(({ fixture }) => [`evals/ai-process-console/press-creation/2.1.0/${fixture.fixtureId}.json`, fixture])),
    ...Object.fromEntries(fixtureRegistryV2.map(({ fixture }) => [
      `evals/ai-process-console/press-creation/${fixture.processVersion}/${fixture.processVersion === definitionV2Compatibility.version ? "success-v2" : fixture.fixtureId}.json`,
      fixture,
    ])),
  });
}

export function renderedPublishedArtifacts(): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(Object.entries(publishedArtifacts()).map(([path, value]) => [path, canonicalJsonFile(value)])));
}
