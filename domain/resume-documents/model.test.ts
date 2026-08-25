import assert from "node:assert/strict";
import test from "node:test";
import { addCustomSection, createResumeDocumentSeed, deleteCustomSection, orderResumeSections, parseResumeDocumentState, resolveSection, updateSectionOrder, updateSectionSetting, updateSharedSection } from "./model";

test("shared edits flow only into inherited resume sections", () => {
  const seed = createResumeDocumentSeed();
  const customized = updateSectionSetting(seed, "base", "summary", { mode: "override", content: { body: "지원별 소개" } });
  const next = updateSharedSection(customized, "summary", { body: "새 공통 소개" });
  const summary = next.sharedSections.find((section) => section.id === "summary")!;
  assert.deepEqual(resolveSection(summary, next.variants[0]).content, { body: "지원별 소개" });
});

test("a section can be hidden in one resume", () => {
  const seed = createResumeDocumentSeed();
  const next = updateSectionSetting(seed, "base", "credentials", { mode: "hidden" });
  assert.equal(resolveSection(next.sharedSections[5], next.variants[0]).mode, "hidden");
});

test("section order is stored independently for each resume", () => {
  const seed = createResumeDocumentSeed();
  const ids = seed.sharedSections.map((section) => section.id);
  const next = updateSectionOrder(seed, "base", ["summary", "profile", ...ids.slice(2)]);
  assert.deepEqual(orderResumeSections(next.sharedSections, next.variants[0]).map((section) => section.id), ["summary", "profile", ...ids.slice(2)]);
});

test("resume-only sections can be added, ordered, and deleted", () => {
  const seed = createResumeDocumentSeed();
  const added = addCustomSection(seed, "base", { title: "오픈소스", kind: "items", afterSectionId: "summary" });
  assert.deepEqual(orderResumeSections(added.state.sharedSections, added.state.variants[0]).slice(0, 3).map((section) => section.id), ["profile", "summary", added.section.id]);
  const reordered = updateSectionOrder(added.state, "base", [added.section.id, ...seed.sharedSections.map((section) => section.id)]);
  assert.equal(orderResumeSections(reordered.sharedSections, reordered.variants[0])[0].title, "오픈소스");
  const removed = deleteCustomSection(reordered, "base", added.section.id);
  assert.equal(removed.variants[0].customSections.length, 0);
});

test("legacy delimiter-based saved data migrates to structured content", () => {
  const legacy = JSON.stringify({ version: 1, activeVariantId: "base", sharedSections: [{ id: "profile", title: "인적사항", kind: "identity", content: "홍길동 | 개발자 | hi@example.com\nhttps://example.com" }], variants: [{ id: "base", name: "기본", company: "", role: "", settings: {} }] });
  const migrated = parseResumeDocumentState(legacy)!;
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.sharedSections[0].content, { name: "홍길동", role: "개발자", email: "hi@example.com", links: ["https://example.com"] });
  assert.deepEqual(migrated.variants[0].customSections, []);
});
