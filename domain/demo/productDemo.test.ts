import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceDemoStage,
  demoBrief,
  demoPressRelease,
  initialDemoStage,
  roughNotes,
} from "./productDemo";

test("demo fixtures preserve the same launch facts through every stage", () => {
  assert.equal(roughNotes.length, 4);
  assert.match(demoBrief.announcement, /FlowNote 2\.0/);
  assert.match(demoBrief.announcement, /9월 18일/);
  assert.ok(demoBrief.keyMessages.some((message) => message.includes("32%")));
  assert.match(demoPressRelease.title, /FlowNote 2\.0/);
  assert.match(demoPressRelease.lead, /9월 18일/);
  assert.ok(
    demoPressRelease.paragraphs.some((paragraph) => paragraph.includes("32%")),
  );
});

test("the portfolio flow advances deterministically through generation completion", () => {
  assert.equal(initialDemoStage, "notes");
  assert.equal(advanceDemoStage("notes"), "brief");
  assert.equal(advanceDemoStage("brief"), "draft");
  assert.equal(advanceDemoStage("draft"), "complete");
  assert.equal(advanceDemoStage("complete"), "complete");
});
