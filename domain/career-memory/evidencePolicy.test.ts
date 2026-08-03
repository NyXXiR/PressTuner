import assert from "node:assert/strict";
import test from "node:test";
import { areEvidenceValuesCompatible, classifyCareerFieldRisk, fingerprintCareerValue, hasCompatibleEvidence, isCompatibleCareerFactKind } from "./evidencePolicy";

test("career evidence policy", async (t) => {
  await t.test("fingerprints equivalent scalar values stably", () => {
    assert.equal(fingerprintCareerValue("  Acme   Corp "), fingerprintCareerValue("acme corp"));
  });
  await t.test("handles array field paths deterministically", () => {
    assert.equal(classifyCareerFieldRisk("metrics[0]"), "NUMBER");
    assert.equal(classifyCareerFieldRisk("actions[0]"), "OTHER");
    assert.equal(classifyCareerFieldRisk("metrics[1]"), classifyCareerFieldRisk("metrics[0]"));
    assert.equal(classifyCareerFieldRisk("isCurrent"), "DATE");
    assert.equal(classifyCareerFieldRisk("title"), "OTHER");
    assert.equal(classifyCareerFieldRisk("roleTitle"), "TITLE");
  });
  await t.test("only maps fact kinds to their canonical compatible paths", () => {
    assert.equal(isCompatibleCareerFactKind("ORGANIZATION", "organization"), true);
    assert.equal(isCompatibleCareerFactKind("TITLE", "title"), false);
    assert.equal(isCompatibleCareerFactKind("TITLE", "roleTitle"), true);
    assert.equal(isCompatibleCareerFactKind("START_DATE", "startDate"), true);
    assert.equal(isCompatibleCareerFactKind("END_DATE", "endDate"), true);
    assert.equal(isCompatibleCareerFactKind("METRIC", "metrics[12]"), true);

    assert.equal(isCompatibleCareerFactKind("METRIC", "summary"), false);
    assert.equal(isCompatibleCareerFactKind("START_DATE", "period"), false);
    assert.equal(isCompatibleCareerFactKind("TITLE", "unknownPath"), false);
    assert.equal(isCompatibleCareerFactKind("SUMMARY", "organization"), false);
    assert.equal(isCompatibleCareerFactKind("START_DATE", "isCurrent"), false);
    assert.equal(isCompatibleCareerFactKind("METRIC", "metrics"), false);
  });
  await t.test("matches evidence to the exact normalized field value", () => {
    assert.equal(areEvidenceValuesCompatible({ fieldPath: "metrics[0]", value: "  Increased conversion by 25% ", evidence: { fieldPath: "metrics[0]", valueHash: fingerprintCareerValue("Increased conversion by 25%") } }), true);
    assert.equal(areEvidenceValuesCompatible({ fieldPath: "metrics[0]", value: "Increased conversion by 30%", evidence: { fieldPath: "metrics[0]", valueHash: fingerprintCareerValue("Increased conversion by 25%") } }), false);
  });
  await t.test("serializes arrays unambiguously and rejects unsupported values", () => {
    assert.notEqual(
      fingerprintCareerValue(["a", "b"]),
      fingerprintCareerValue(["a\u001fb"]),
    );
    assert.notEqual(
      fingerprintCareerValue(["a", "b"]),
      fingerprintCareerValue("a\u001fb"),
    );
    assert.throws(() => fingerprintCareerValue({ value: "Acme" }), /unsupported/i);
    assert.throws(() => fingerprintCareerValue(new Date(Number.NaN)), /invalid date/i);
  });
  await t.test("requires compatible field evidence for high-risk facts", () => {
    assert.equal(hasCompatibleEvidence({ kind: "METRIC", fieldPath: "metrics[0]", value: "25%", evidence: [{ fieldPath: "summary", valueHash: fingerprintCareerValue("Delivered a 25% improvement") }] }), false);
    assert.equal(hasCompatibleEvidence({ kind: "METRIC", fieldPath: "metrics[0]", value: "25%", evidence: [{ fieldPath: "metrics[0]", valueHash: fingerprintCareerValue("25%") }] }), true);
    assert.equal(hasCompatibleEvidence({ kind: "METRIC", fieldPath: "summary", value: "25%", evidence: [] }), false);
    assert.equal(hasCompatibleEvidence({ kind: "START_DATE", fieldPath: "period", value: "2024", evidence: [] }), false);
  });
});
