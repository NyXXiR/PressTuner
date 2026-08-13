import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { canonicalJson, canonicalJsonFile, sha256Canonical, sha256Text } from "./canonicalJson";
import { MemoSourcePolicyV1Schema, ProcessDefinitionV1Schema, ProjectIntegrationManifestV1Schema, assertPrivacySafe, type ArtifactReferenceV1, type ProcessDefinitionV1, type ProjectIntegrationManifestV1 } from "./contracts";
import { fixtureRegistry } from "./fixtureRegistry";

export const AI_PROCESS_CONSOLE_SOURCE = "urn:presstuner:ai-process-console:facts:v1";
export const AI_PROCESS_CONSOLE_DESTINATION = "presstuner.ai-process-console.test-run.v1";

export const memoSourcePolicy = Object.freeze(MemoSourcePolicyV1Schema.parse({
  schemaVersion: "1.0",
  policyId: "presstuner:memo-source-policy:v1",
  classification: "CONTENT_FREE",
  description: "Synthetic memo claims are checked against fixture-owned claim hashes; source text is never published in facts.",
}));

function artifactReference(args: { artifactId: string; locator: string; value: unknown; sha256?: string }): ArtifactReferenceV1 {
  const canonical = canonicalJson(args.value);
  return { artifactId: args.artifactId, schemaVersion: "1.0", sha256: args.sha256 ?? sha256Text(canonical), mediaType: "application/json", sizeBytes: Buffer.byteLength(canonical), locator: args.locator };
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

export function buildProcessDefinition(): ProcessDefinitionV1 {
  const base = {
    schemaVersion: "1.0" as const,
    processId: pressCreationProcess.id,
    version: pressCreationProcess.version,
    entryNodeIds: [pressCreationProcess.nodes.slice().sort((a, b) => a.sequence - b.sequence)[0].id],
    nodes: pressCreationProcess.nodes.slice().sort((a, b) => a.sequence - b.sequence).map((node) => ({
      nodeId: node.id,
      label: node.label,
      kind: nodeKinds.get(node.id)!,
      handlerRef: `presstuner:handler:${node.operationKey}:v1`,
      evidencePolicy: evidencePolicies.get(node.id)!,
    })),
    transitions: pressCreationProcess.edges.slice().sort((a, b) => a.sequence - b.sequence).map((edge) => ({
      transitionId: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      decisionRef: `presstuner:decision:${edge.id}:v1`,
    })),
  };
  // Publication convention: hash canonical definition content with canonicalSha256 omitted,
  // then inject that digest into the published definition and all descriptor references.
  return ProcessDefinitionV1Schema.parse({ ...base, canonicalSha256: sha256Canonical(base) });
}

export function processDefinitionReference(definition = buildProcessDefinition()): ArtifactReferenceV1 {
  return artifactReference({ artifactId: "presstuner-press-creation-2.1.0", locator: "ref:definitions/presstuner/press-creation/2.1.0", value: definition, sha256: definition.canonicalSha256 });
}

export function buildProjectManifest(definition = buildProcessDefinition()): ProjectIntegrationManifestV1 {
  const manifest = {
    schemaVersion: "1.0" as const,
    manifestId: "presstuner.ai-process-console.v1",
    projectId: "presstuner",
    displayName: "PressTuner",
    environment: "conformance",
    serviceName: "presstuner",
    processes: [{ processId: definition.processId, version: definition.version, canonicalSha256: definition.canonicalSha256, definition: processDefinitionReference(definition) }],
    capabilities: {
      domainEvents: { schemaVersion: "1.0" as const, source: AI_PROCESS_CONSOLE_SOURCE, delivery: "AT_LEAST_ONCE" as const, ordering: "PER_ATTEMPT_MONOTONIC_SEQUENCE" as const, deduplicationKey: "SOURCE_AND_EVENT_ID" as const, transactionalOutbox: true as const },
      testRun: { available: true as const, isolation: "PROJECT_OWNED_FIXTURE_ONLY" as const, endpoint: { destinationId: AI_PROCESS_CONSOLE_DESTINATION, transport: "INJECTED" as const } },
    },
  };
  assertPrivacySafe(manifest);
  return ProjectIntegrationManifestV1Schema.parse(manifest);
}

export function publishedArtifacts(): Readonly<Record<string, unknown>> {
  const definition = buildProcessDefinition();
  return Object.freeze({
    "integrations/ai-process-console/v1/project-manifest.json": buildProjectManifest(definition),
    "integrations/ai-process-console/v1/press-creation-2.1.0.definition.json": definition,
    "integrations/ai-process-console/v1/memo-source-policy-v1.json": memoSourcePolicy,
    ...Object.fromEntries(fixtureRegistry.map(({ fixture }) => [`evals/ai-process-console/press-creation/2.1.0/${fixture.fixtureId}.json`, fixture])),
  });
}

export function renderedPublishedArtifacts(): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(Object.entries(publishedArtifacts()).map(([path, value]) => [path, canonicalJsonFile(value)])));
}
