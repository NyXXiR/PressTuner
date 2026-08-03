import assert from "node:assert/strict";
import test from "node:test";

import { projectCareerFacts } from "./factProjection";

test("confirmed structured experiences produce deterministic active facts", () => {
  const facts = projectCareerFacts({
    title: "Checkout migration",
    content: "Moved checkout without downtime.",
    organization: "Acme",
    roleTitle: "Engineer",
    experienceType: "PROJECT",
    startDate: new Date("2025-01-01T00:00:00.000Z"),
    endDate: null,
    isCurrent: true,
    actions: ["Designed the cutover"],
    outcomes: ["No downtime"],
    metrics: ["20% fewer failures"],
    tools: ["PostgreSQL"],
    tags: ["reliability"],
  });

  assert.deepEqual(
    facts.map(({ kind, value, fieldPath }) => ({ kind, value, fieldPath })),
    [
      { kind: "ORGANIZATION", value: "Acme", fieldPath: "organization" },
      { kind: "TITLE", value: "Engineer", fieldPath: "roleTitle" },
      { kind: "TYPE", value: "PROJECT", fieldPath: "experienceType" },
      { kind: "START_DATE", value: "2025-01-01", fieldPath: "startDate" },
      { kind: "ACTION", value: "Designed the cutover", fieldPath: "actions[0]" },
      { kind: "OUTCOME", value: "No downtime", fieldPath: "outcomes[0]" },
      { kind: "METRIC", value: "20% fewer failures", fieldPath: "metrics[0]" },
      { kind: "TOOL", value: "PostgreSQL", fieldPath: "tools[0]" },
      { kind: "TAG", value: "reliability", fieldPath: "tags[0]" },
      {
        kind: "SUMMARY",
        value: "Checkout migration\nMoved checkout without downtime.",
        fieldPath: "summary",
      },
    ],
  );
  assert.equal(facts.every((fact) => fact.normalizedValue.length > 0), true);
});
