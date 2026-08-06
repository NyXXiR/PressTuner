import assert from "node:assert/strict";
import test from "node:test";

import { PRESS_AGENT_RAG_DEBUGGER_PROMPT_PRESETS, PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS, StartRagDebuggerRunRequestSchema } from "./pressAgentRagDebugger";

const valid = { prompt: "질문", promptPresetId: null, retrievalConfigurationId: "baseline-v1", documentIds: ["doc-1"] };

test("accepts only the two debugger retrieval presets and known prompt presets", () => {
  assert.equal(StartRagDebuggerRunRequestSchema.parse(valid).retrievalConfigurationId, "baseline-v1");
  assert.equal(StartRagDebuggerRunRequestSchema.parse({ ...valid, retrievalConfigurationId: "candidate-v3", promptPresetId: "fact-summary" }).promptPresetId, "fact-summary");
  assert.equal(StartRagDebuggerRunRequestSchema.safeParse({ ...valid, retrievalConfigurationId: "candidate-v2" }).success, false);
  assert.equal(StartRagDebuggerRunRequestSchema.safeParse({ ...valid, promptPresetId: "unknown" }).success, false);
});

test("requires 1-50 unique documents and rejects unknown request fields", () => {
  assert.equal(StartRagDebuggerRunRequestSchema.safeParse({ ...valid, documentIds: [] }).success, false);
  assert.equal(StartRagDebuggerRunRequestSchema.safeParse({ ...valid, documentIds: ["doc-1", "doc-1"] }).success, false);
  assert.equal(StartRagDebuggerRunRequestSchema.safeParse({ ...valid, documentIds: Array.from({ length: 51 }, (_, i) => `doc-${i}`) }).success, false);
  assert.equal(StartRagDebuggerRunRequestSchema.safeParse({ ...valid, documentNames: ["untrusted"] }).success, false);
});

test("exposes stable Korean preset copy", () => {
  assert.match(PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS["candidate-v3"].description, /문서 코드/);
  assert.match(PRESS_AGENT_RAG_DEBUGGER_PROMPT_PRESETS["metrics-and-dates"].prompt, /수치/);
});
