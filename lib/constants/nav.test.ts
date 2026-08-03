import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  getProfileMenuItems,
  getSidebarToggleLabel,
  getWorkspaceNavGroups,
} from "./nav";

test("workspace navigation only keeps product workflow destinations", () => {
  const commonLabels = new Set([
    "공지사항",
    "요금제",
    "가격 정책",
    "고객지원",
    "문의하기",
  ]);

  for (const mode of ["PRESS", "RESUME"] as const) {
    const labels = getWorkspaceNavGroups(mode).flatMap((group) =>
      group.items.map((item) => item.label),
    );

    assert.equal(
      labels.some((label) => commonLabels.has(label)),
      false,
      `${mode} workspace nav should not contain common pages`,
    );
  }
});

test("profile menu exposes common pages with product-aware routes", () => {
  assert.deepEqual(
    getProfileMenuItems("PRESS").map(({ label, href }) => ({ label, href })),
    [
      { label: "공지사항", href: "/press/notices" },
      { label: "요금제", href: "/press/pricing?tab=PRESS" },
      { label: "고객지원", href: "/press/contact" },
    ],
  );

  assert.deepEqual(
    getProfileMenuItems("RESUME").map(({ label, href }) => ({ label, href })),
    [
      { label: "공지사항", href: "/resume/notices" },
      { label: "요금제", href: "/resume/pricing?tab=CAREER" },
      { label: "고객지원", href: "/resume/contact" },
    ],
  );

  assert.deepEqual(
    getProfileMenuItems("STANDARD").map(({ label, href }) => ({ label, href })),
    [
      { label: "공지사항", href: "/notices" },
      { label: "요금제", href: "/pricing" },
      { label: "고객지원", href: "/contact" },
    ],
  );
});

test("sidebar toggle label makes the collapsed and expanded state explicit", () => {
  assert.equal(getSidebarToggleLabel(true), "좌측 작업 메뉴 접기");
  assert.equal(getSidebarToggleLabel(false), "좌측 작업 메뉴 펼치기");
});
