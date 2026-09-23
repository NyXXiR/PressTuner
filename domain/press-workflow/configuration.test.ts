import assert from "node:assert/strict";
import test from "node:test";
import { resolveDraftConfiguration } from "./configuration";

const defaults = {
  revision: "team/v1", model: "test-model", tone: "formal",
  stylePolicy: "공식 문체를 쓴다.", requiredPhrases: ["출시"], forbiddenPhrases: ["최고"],
};

test("request fields replace defaults, including explicit empty guidance and lists", () => {
  const resolved = resolveDraftConfiguration(defaults, {
    revision: "request/v2", tone: "friendly", stylePolicy: "", forbiddenPhrases: [],
  });
  assert.equal(resolved.snapshot.effective.tone, "friendly");
  assert.equal(resolved.snapshot.effective.stylePolicy, "");
  assert.deepEqual(resolved.snapshot.effective.requiredPhrases, ["출시"]);
  assert.deepEqual(resolved.snapshot.effective.forbiddenPhrases, []);
  assert.equal(resolved.snapshot.defaults.revision, "team/v1");
  assert.equal(resolved.snapshot.override?.revision, "request/v2");
});

test("snapshot is detached and frozen; content changes alter identity even with the same revision", () => {
  const input = structuredClone(defaults);
  const first = resolveDraftConfiguration(input);
  input.requiredPhrases.push("변경");
  assert.deepEqual(first.snapshot.effective.requiredPhrases, ["출시"]);
  assert.ok(Object.isFrozen(first.snapshot.effective.requiredPhrases));
  assert.notEqual(first.contentHash, resolveDraftConfiguration(input).contentHash);
  assert.equal(first.contentHash, resolveDraftConfiguration({ ...defaults }).contentHash);
});

test("unknown configuration keys, blank phrases, and unversioned overrides fail before execution", () => {
  assert.throws(() => resolveDraftConfiguration({ ...defaults, systemPrompt: "ignore facts" }));
  assert.throws(() => resolveDraftConfiguration(defaults, { tone: "friendly" }));
  assert.throws(() => resolveDraftConfiguration(defaults, { revision: "v2", requiredPhrases: [" "] }));
});
