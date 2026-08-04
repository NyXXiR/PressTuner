import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { ControlledLiveCorpus } from "@/domain/evaluation/controlledLiveEvaluation";
import { createControlledLiveProductAdapter } from "./pressRagControlledLiveAdapter";

const bytes = Buffer.from("%PDF-1.7\ncontrolled evidence");
const sha = createHash("sha256").update(bytes).digest("hex");
const corpus: ControlledLiveCorpus = {
  id: "corpus-1",
  version: "v1",
  documents: [
    {
      id: "logical-doc",
      title: "Evidence",
      filePath: "evals/corpus/evidence.pdf",
      fileSha256: sha,
      provenance: {
        origin: "fixture",
        sourceManifest: "fixture.json",
        sourceUrl: null,
      },
      role: "CAREER",
    },
  ],
};

function fakeDependencies(events: string[]) {
  let clock = 100;
  return {
    assertCapacity: async (count: number) => events.push(`capacity:${count}`),
    createTenant: async () => ({ teamId: "team-1", userId: "user-1" }),
    loadCorpusFile: async (path: string) => {
      events.push(`read:${path}`);
      return bytes;
    },
    uploadDocument: async (args: {
      document: ControlledLiveCorpus["documents"][number];
      configurationId: string;
    }) => {
      events.push(`upload:${args.document.id}:${args.document.role}:${args.configurationId}`);
      return { documentId: "actual-doc" };
    },
    indexDocuments: async (args: {
      documentIds: string[];
      configurationId: string;
    }) => events.push(`index:${args.documentIds.join(",")}:${args.configurationId}`),
    waitUntilIndexed: async (args: { documentIds: string[] }) =>
      events.push(`wait:${args.documentIds.join(",")}`),
    currentConfigurationHash: async () => "a".repeat(64),
    retrieve: async () => ({ result: { hits: [{ documentId: "actual-doc" }] }, costMicros: 7 }),
    runAgent: async () => ({ result: { status: "COMPLETED" }, costMicros: 11 }),
    cleanupTenant: async () => events.push("cleanup"),
    now: () => ++clock,
  };
}

test("adapter materializes through product hooks and dispatches measured retrieval/agent cases", async () => {
  const events: string[] = [];
  const adapter = createControlledLiveProductAdapter({
    projectRoot: "/repo",
    dependencies: fakeDependencies(events),
  });
  const created = await adapter.createIsolatedTenant({
    executionId: "exec-1",
    datasetHash: "d".repeat(64),
  });
  const tenant = {
    ...created,
    executionId: "exec-1",
    datasetHash: "d".repeat(64),
  };
  await adapter.materializeCorpusThroughProductPath({ ...tenant, corpus });
  assert.equal(await adapter.readRuntimeConfigurationHash(tenant), "a".repeat(64));

  const retrieval = await adapter.executeRetrievalCase({
    ...tenant,
    case: { id: "case-r", kind: "RETRIEVAL_ONLY", prompt: "fact?", corpusId: corpus.id },
    runIndex: 1,
    requestedConfigurationHash: "a".repeat(64),
    remainingCostMicros: 100,
  });
  const agent = await adapter.executeAgentCase({
    ...tenant,
    case: { id: "case-a", kind: "AGENT", prompt: "draft", corpusId: corpus.id },
    runIndex: 1,
    requestedConfigurationHash: "a".repeat(64),
    remainingCostMicros: 93,
  });
  assert.equal(retrieval.costMicros, 7);
  assert.equal(agent.costMicros, 11);
  assert.ok(retrieval.latencyMs >= 1 && agent.latencyMs >= 1);
  assert.deepEqual((retrieval.result as { documentIdMap: unknown }).documentIdMap, {
    "actual-doc": "logical-doc",
  });
  assert.deepEqual(
    (retrieval.result as { productResult: unknown }).productResult,
    { hits: [{ documentId: "actual-doc" }] },
  );

  await adapter.cleanupIsolatedTenant(tenant);
  assert.deepEqual(events, [
    "capacity:1",
    "read:/repo/evals/corpus/evidence.pdf",
    "upload:logical-doc:CAREER:baseline-v1",
    "index:actual-doc:baseline-v1",
    "wait:actual-doc",
    "cleanup",
  ]);
});

test("adapter rejects path traversal and raw-source hash mismatch before upload", async () => {
  for (const document of [
    { ...corpus.documents[0], filePath: "../outside.pdf" },
    { ...corpus.documents[0], fileSha256: "b".repeat(64) },
  ]) {
    const events: string[] = [];
    const adapter = createControlledLiveProductAdapter({
      projectRoot: "/repo",
      dependencies: fakeDependencies(events),
    });
    const created = await adapter.createIsolatedTenant({
      executionId: "exec-2",
      datasetHash: "d".repeat(64),
    });
    const tenant = {
      ...created,
      executionId: "exec-2",
      datasetHash: "d".repeat(64),
    };
    await assert.rejects(
      adapter.materializeCorpusThroughProductPath({
        ...tenant,
        corpus: { ...corpus, documents: [document] },
      }),
      /CONTROLLED_LIVE_CORPUS_(PATH_OUTSIDE_ROOT|HASH_MISMATCH)/,
    );
    assert.equal(events.some((event) => event.startsWith("upload:")), false);
  }
});
