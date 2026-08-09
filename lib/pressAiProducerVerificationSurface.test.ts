import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(path, "utf8");

test("saved attempts mount a revision-aware read-only producer verification panel", async () => {
  const [debuggerSource, panel, client, page] = await Promise.all([
    source("components/demo/PressAiProcessDebugger.tsx"),
    source("components/demo/PressAiProducerVerificationPanel.tsx"),
    source("lib/pressAiProcessDebuggerClient.ts"),
    source("app/demo/rag-test/page.tsx"),
  ]);
  assert.match(debuggerSource, /PressAiProducerVerificationPanel attemptId=\{attempt\.id\} revision=\{attempt\.revision\}/);
  assert.match(panel, /\[load, revision\]/);
  assert.match(panel, /Refresh verification/);
  assert.match(client, /ProducerVerificationReportSchema/);
  assert.match(client, /producer-verification/);
  assert.match(page, /producer protocol/);
  assert.match(page, /export const dynamic = "force-static"/);
});

test("verification rendering uses fixed safe fields and omits sensitive identity surfaces", async () => {
  const panel = await source("components/demo/PressAiProducerVerificationPanel.tsx");
  for (const label of ["Manifest", "Canonical", "Facts", "Content-free OTLP", "External delivery evidence", "Replay summary"]) assert.match(panel, new RegExp(label));
  assert.doesNotMatch(panel, /Object\.entries|JSON\.stringify|operationId|environment|baseUrl|writeKey|error\.message/);
  assert.doesNotMatch(panel, />\{attemptId\}</);
  assert.match(panel, /disabled/);
  assert.match(panel, /not_observed/);
});
