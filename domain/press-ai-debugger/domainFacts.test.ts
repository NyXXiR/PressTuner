import assert from "node:assert/strict";
import test from "node:test";
import { extractPressDomainFacts } from "./domainFacts";

test("typed domain facts ignore runtime metadata and arbitrary passthrough fields", () => {
  const result = extractPressDomainFacts({ oneLiner: "반드시 30% 이상 개선한다. https://example.test/778899 /api/665544 retrievalScore:0.123456 quota=918273", eventAt: "2026-08-20", tone: "formal", usage: { quota: 918273 }, createdAt: "2099-12-31T00:00:00Z", url: "https://example.test/778899", path: "/api/665544", retrievalScore: 0.123456, arbitrary: "999999" }, "brief");
  const text = JSON.stringify(result); assert.match(text, /30%|2026-08-20/); assert.doesNotMatch(text, /918273|2099-12-31|778899|665544|0.123456|999999|formal/);
});

test("dates are not also emitted as partial numeric facts", () => {
  const result = extractPressDomainFacts({ eventAt: "2026-08-20", oneLiner: "8월 20일까지 공개한다." }, "brief");
  assert.deepEqual(result.facts.filter(({ kind }) => kind === "DATE").map(({ kind, normalizedValue }) => ({ kind, normalizedValue })), [
    { kind: "DATE", normalizedValue: "8월 20일" },
    { kind: "DATE", normalizedValue: "2026-08-20" },
  ]);
  assert.equal(result.facts.some(({ kind }) => kind === "NUMBER"), false);
});
