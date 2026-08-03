import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveKnowledgeRole,
  isKnowledgeRoleSearchable,
} from "./classification";

test("document override wins and returning to automatic restores the chunk role", () => {
  assert.equal(
    effectiveKnowledgeRole({
      automaticRole: "FACT",
      documentOverride: "STYLE_POLICY",
    }),
    "STYLE_POLICY",
  );
  assert.equal(
    effectiveKnowledgeRole({
      automaticRole: "FACT",
      documentOverride: null,
    }),
    "FACT",
  );
});

test("unclassified chunks fail closed unless a document override exists", () => {
  assert.equal(
    isKnowledgeRoleSearchable({
      automaticRole: null,
      documentOverride: null,
      requestedRoles: ["FACT"],
    }),
    false,
  );
  assert.equal(
    isKnowledgeRoleSearchable({
      automaticRole: null,
      documentOverride: "FACT",
      requestedRoles: ["FACT"],
    }),
    true,
  );
});
