import assert from "node:assert/strict";
import test from "node:test";

import { careerDetailLabel, careerDetailSubtitle, normalizeTagGroups, serializeTagGroups } from "./contentPresentation";
import type { ItemContent } from "./model";

const detail = (patch: Partial<ItemContent> = {}): ItemContent => ({ id: "detail", itemKind: "career-detail", meta: "", title: "결제 개선", subtitle: "샘플테크 · 백엔드", relatedWorkTitle: "샘플테크", body: "", ...patch });

test("career detail labels prefer a free-form label and retain preset compatibility", () => {
  assert.equal(careerDetailLabel(detail({ detailLabel: "핵심 성과" })), "핵심 성과");
  assert.equal(careerDetailLabel(detail({ detailLabel: " ", detailType: "troubleshooting" })), "문제 해결");
});

test("grouped career details omit the employer already shown by the group heading", () => {
  assert.equal(careerDetailSubtitle(detail(), true), "백엔드");
  assert.equal(careerDetailSubtitle(detail({ subtitle: "샘플테크" }), true), "");
  assert.equal(careerDetailSubtitle(detail({ subtitle: "백엔드" }), false), "샘플테크 · 백엔드");
});

test("legacy flat tags become one editable group and grouped tags retain a flat compatibility list", () => {
  assert.deepEqual(normalizeTagGroups({ items: ["React", "Node.js"] }), [{ id: "keywords", title: "기타", items: ["React", "Node.js"] }]);
  assert.deepEqual(serializeTagGroups([
    { id: "front", title: "프론트엔드", items: ["React"] },
    { id: "infra", title: "인프라", items: ["AWS"] },
  ]), {
    items: ["React", "AWS"],
    groups: [
      { id: "front", title: "프론트엔드", items: ["React"] },
      { id: "infra", title: "인프라", items: ["AWS"] },
    ],
  });
});
