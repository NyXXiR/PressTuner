import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStructuredCareerBrickPayload,
  careerBrickToFormData,
  updateCareerCurrentState,
} from "./careerFormPayload";

const form = {
  title: "Backend work",
  content: "Improved service",
  startDate: "2024-01",
  endDate: "2024-07",
  isCurrent: true,
  tags: ["api"],
};

test("career form payload sends structured date assertions and clears current end", () => {
  const payload = buildStructuredCareerBrickPayload(form, {
    originalText: "Owner entered text",
  });
  assert.equal("period" in payload, false);
  assert.equal(payload.startDate, "2024-01");
  assert.equal(payload.endDate, null);
  assert.equal(payload.isCurrent, true);
  assert.equal(payload.originalText, "Owner entered text");
});

test("career form payload preserves a non-current structured end date", () => {
  const payload = buildStructuredCareerBrickPayload({ ...form, isCurrent: false });
  assert.equal(payload.startDate, "2024-01");
  assert.equal(payload.endDate, "2024-07");
  assert.equal(payload.isCurrent, false);
});

test("current-state reducer immediately clears the end date", () => {
  const next = updateCareerCurrentState(
    { isCurrent: false, endDate: "2024-07-31", untouched: "value" },
    true,
  );
  assert.deepEqual(next, {
    isCurrent: true,
    endDate: null,
    untouched: "value",
  });
});

test("structured brick dates populate month inputs without period synthesis", () => {
  const formData = careerBrickToFormData({
    title: "Backend work",
    content: "Improved service",
    tags: ["api"],
    startDate: "2023-02-01T00:00:00.000Z",
    endDate: null,
    isCurrent: true,
    period: "legacy value that must not be reparsed",
  });
  assert.deepEqual(formData, {
    title: "Backend work",
    content: "Improved service",
    startDate: "2023-02",
    endDate: "",
    isCurrent: true,
    tags: ["api"],
  });
});
