import assert from "node:assert/strict";
import test from "node:test";

import {
  applySelectedExperienceBoost,
  buildCareerRetrievalQuery,
  collectGroundableCareerFactIds,
  isRetrievableCareerExperience,
  validateGroundingSelection,
} from "./retrievalPolicy";

test("selected experiences receive the fixed RRF preference boost", () => {
  assert.deepEqual(
    applySelectedExperienceBoost(
      [
        { id: "unselected", score: 0.03 },
        { id: "selected", score: 0.02 },
      ],
      ["selected"],
    ),
    [
      { id: "selected", score: 0.04, isPreferred: true },
      { id: "unselected", score: 0.03, isPreferred: false },
    ],
  );
});

test("retrieval query includes application target context without treating it as memory", () => {
  assert.equal(
    buildCareerRetrievalQuery({
      questionText: "Describe impact",
      companyName: "Acme",
      jobTitle: "Engineer",
      jdText: "Own reliability",
      instruction: "Be concise",
    }),
    [
      "Question: Describe impact",
      "Company: Acme",
      "Role: Engineer",
      "Job description: Own reliability",
      "Instruction: Be concise",
    ].join("\n"),
  );
});

test("retrieval excludes another owner, unconfirmed, and stale embeddings", () => {
  const base = {
    userId: "user-a",
    memoryStatus: "CONFIRMED" as const,
    embeddingContentHash: "hash",
    currentContentHash: "hash",
    embeddingModel: "text-embedding-3-small",
    expectedEmbeddingModel: "text-embedding-3-small",
  };
  assert.equal(isRetrievableCareerExperience(base, "user-a"), true);
  assert.equal(
    isRetrievableCareerExperience({ ...base, userId: "user-b" }, "user-a"),
    false,
  );
  assert.equal(
    isRetrievableCareerExperience({ ...base, memoryStatus: "ARCHIVED" }, "user-a"),
    false,
  );
  assert.equal(
    isRetrievableCareerExperience({ ...base, embeddingContentHash: null }, "user-a"),
    false,
  );
});

test("grounding IDs must be a subset of retrieved IDs", () => {
  assert.deepEqual(
    validateGroundingSelection({
      usedExperienceIds: ["experience-1"],
      usedFactIds: ["fact-1"],
      retrievedExperienceIds: ["experience-1", "experience-2"],
      retrievedFactIds: ["fact-1"],
    }),
    {
      experienceIds: ["experience-1"],
      factIds: ["fact-1"],
    },
  );
  assert.throws(
    () =>
      validateGroundingSelection({
        usedExperienceIds: ["other-user-experience"],
        usedFactIds: [],
        retrievedExperienceIds: ["experience-1"],
        retrievedFactIds: [],
      }),
    /Unknown grounding ID/,
  );
});

test("every trusted fact exposed through a retrieved experience is groundable", () => {
  assert.deepEqual(
    collectGroundableCareerFactIds({
      facts: [{ id: "ranked-fact" }, { id: "shared-fact" }],
      experiences: [
        {
          facts: [
            { id: "shared-fact" },
            { id: "experience-context-fact" },
          ],
        },
      ],
    }),
    ["ranked-fact", "shared-fact", "experience-context-fact"],
  );
});
