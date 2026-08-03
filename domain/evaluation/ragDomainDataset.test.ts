import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parsePressRagFixtures } from "./pressRagEvaluation";

const cases = JSON.parse(
  readFileSync("evals/press-rag/v2/cases.json", "utf8"),
).cases as Array<Record<string, unknown>>;
const documents = JSON.parse(
  readFileSync("evals/press-rag/v2/corpus.json", "utf8"),
).documents as Array<{ id: string; role: string }>;

for (const version of ["v1", "v2"] as const) {
  test(`${version} fixtures pass the production evaluation boundary`, () => {
    const fixtures = parsePressRagFixtures({
      dataset: JSON.parse(
        readFileSync(`evals/press-rag/${version}/cases.json`, "utf8"),
      ),
      corpus: JSON.parse(
        readFileSync(`evals/press-rag/${version}/corpus.json`, "utf8"),
      ),
    });

    assert.equal(fixtures.dataset.cases.length, 30);
    assert.equal(fixtures.dataset.version, `press-rag-${version}`);
    assert.equal(fixtures.corpus.version, `press-rag-${version}`);
  });
}

test("v2 dataset covers each grounded-domain contract", () => {
  assert.equal(cases.length, 30);
  assert.deepEqual(
    new Set(cases.map((entry) => entry.scenario)),
    new Set(["ROLE_ISOLATION", "ACCEPTANCE", "VERIFICATION", "CITATION"]),
  );
  assert.ok(cases.some((entry) => entry.expectedVerification === "BLOCK"));
  assert.ok(cases.some((entry) => entry.expectedVerification === "WARN"));
  assert.ok(cases.some((entry) => entry.expectedVerification === "PASS"));
});

test("non-factual corpus roles can never become final evidence", () => {
  const nonFactIds = new Set(
    documents
      .filter(({ role }) => role !== "FACT")
      .map(({ id }) => id),
  );
  for (const entry of cases) {
    const finalIds = entry.expectedFinalDocumentIds as string[];
    assert.equal(
      finalIds.some((id) => nonFactIds.has(id)),
      false,
      String(entry.id),
    );
  }
});
