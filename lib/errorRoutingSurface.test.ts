import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("page-level 404 and 500 errors use the shared branded error state", () => {
  const notFound = source("app/not-found.tsx");
  const error = source("app/error.tsx");

  assert.match(notFound, /AppErrorState/);
  assert.match(notFound, /export const metadata/);
  assert.match(notFound, /index:\s*false/);
  assert.match(notFound, /follow:\s*false/);
  assert.match(notFound, /statusCode=["']404["']/);
  assert.match(notFound, /페이지를 찾을 수 없습니다/);
  assert.match(notFound, /홈으로 돌아가거나 작업을 다시 시작/);

  assert.match(error, /AppErrorState/);
  assert.match(error, /statusCode=["']500["']/);
  assert.match(error, /reset=\{reset\}/);
  assert.match(error, /digest=\{error\.digest\}/);
  assert.match(error, /console\.error\(error\)/);
});

test("shared error state offers retry, home/write, back, and contact recovery", () => {
  const errorState = source("components/layout/AppErrorState.tsx");

  for (const expected of [
    "다시 시도",
    "홈으로 이동",
    "보도자료 작성",
    "이전 페이지",
    "문의하기",
  ]) {
    assert.ok(
      errorState.includes(expected),
      `AppErrorState is missing recovery action: ${expected}`,
    );
  }

  assert.match(errorState, /onClick=\{reset\}/);
  assert.match(errorState, /href=\{homeHref\}/);
  assert.match(errorState, /href=\{writeHref\}/);
  assert.match(errorState, /onClick=\{handleBack\}/);
  assert.match(errorState, /href=\{contactHref\}/);
  assert.match(errorState, /오류 참조값/);
});

test("proxy keeps dev API failures JSON and dev page failures HTML", () => {
  const proxy = source("proxy.ts");

  assert.match(
    proxy,
    /isDisabledDevToolApiPath[\s\S]*?NextResponse\.json\([\s\S]*?error:\s*["']NOT_FOUND["'][\s\S]*?status:\s*404/,
  );
  assert.match(
    proxy,
    /isDisabledDevToolPath[\s\S]*?NextResponse\.rewrite\(new URL\(["']\/_disabled["']/,
  );
});

test("global error is a self-contained root-layout fallback", () => {
  const globalError = source("app/global-error.tsx");

  assert.match(globalError, /^["']use client["'];/);
  assert.match(globalError, /<html lang=["']ko["']>/);
  assert.match(globalError, /<body/);
  assert.match(globalError, /style=\{/);
  assert.match(globalError, /brieFFlow/);
  assert.match(globalError, />500</);
  assert.match(globalError, /다시 시도/);
  assert.match(globalError, /href=["']\/["']/);
  assert.match(globalError, /href=["']\/contact["']/);
  assert.match(globalError, /문의하기/);
  assert.match(globalError, /error\.digest/);
  assert.match(globalError, /오류 참조값/);
  assert.match(globalError, /useEffect/);
  assert.match(globalError, /console\.error\(error\)/);
  assert.match(globalError, /onClick=\{reset\}/);

  assert.doesNotMatch(
    globalError,
    /AppErrorState|next\/link|next\/image|next\/navigation|useRouter|usePathname|providers?|globals\.css|layout/,
  );
});
