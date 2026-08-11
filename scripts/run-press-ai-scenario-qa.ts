import { chromium, type Page, type Request } from "playwright";

import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";

const baseUrlArgument = process.argv.find((value) =>
  value.startsWith("--base-url="),
);
const separatedBaseUrlIndex = process.argv.indexOf("--base-url");
const baseUrl = (
  baseUrlArgument?.slice("--base-url=".length) ??
  (separatedBaseUrlIndex >= 0
    ? process.argv[separatedBaseUrlIndex + 1]
    : undefined) ??
  "http://127.0.0.1:3003"
).replace(/\/$/, "");
const baseOrigin = new URL(baseUrl).origin;

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
] as const;

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function node(page: Page, nodeId: string) {
  return page.locator(`[data-node-id="${nodeId}"]`);
}

async function expectNodeState(
  page: Page,
  viewportName: string,
  nodeId: string,
  expectedState: string,
) {
  const actual = await node(page, nodeId).getAttribute("data-node-state");
  check(
    actual === expectedState,
    `${viewportName}: ${nodeId} expected ${expectedState}, received ${actual}`,
  );
}

async function expectNoOverflow(
  page: Page,
  viewportName: string,
  checkpoint: string,
) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(
    dimensions.scrollWidth <= dimensions.clientWidth,
    `${viewportName}: horizontal overflow at ${checkpoint} (${dimensions.scrollWidth} > ${dimensions.clientWidth})`,
  );
  return { checkpoint, ...dimensions };
}

function watchScenarioRequests(page: Page) {
  const violations: string[] = [];
  const readMethods = new Set(["GET", "HEAD", "OPTIONS"]);

  function inspect(request: Request) {
    const requestUrl = new URL(request.url());
    const isLocal = requestUrl.origin === baseOrigin;
    const isLocalApi = isLocal && requestUrl.pathname.startsWith("/api/");
    const isMutation = !readMethods.has(request.method());
    if (isLocalApi || isMutation) {
      violations.push(`${request.method()} ${request.url()}`);
    }
  }

  page.on("request", inspect);
  return {
    violations,
    stop: () => page.off("request", inspect),
  };
}

async function verifyScenario(page: Page, viewportName: string) {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const overflowChecks: Array<{
    checkpoint: string;
    scrollWidth: number;
    clientWidth: number;
  }> = [];

  await page.goto(`${baseUrl}/demo/rag-test/scenario`, {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("heading", {
      level: 1,
      name: "실패와 재시도까지 직접 실행하는 Press AI 시나리오",
    })
    .waitFor();

  // The shared app shell emits page-view telemetry while the route loads.
  // Start here so this guard covers requests caused by scenario interactions.
  const requestWatch = watchScenarioRequests(page);

  const workflow = page.getByRole("list", {
    name: "보도자료 작성 시나리오 순서",
  });
  const items = workflow.getByRole("listitem");
  check(
    (await items.count()) === pressCreationProcess.nodes.length,
    `${viewportName}: expected five canonical nodes`,
  );
  const renderedLabels = await items.locator("h2").allTextContents();
  check(
    JSON.stringify(renderedLabels) ===
      JSON.stringify(pressCreationProcess.nodes.map((item) => item.label)),
    `${viewportName}: canonical node order mismatch`,
  );
  overflowChecks.push(await expectNoOverflow(page, viewportName, "initial"));

  await page
    .getByRole("button", { name: "문서 초기화 실행", exact: true })
    .click();
  await expectNodeState(
    page,
    viewportName,
    "article-initialization",
    "completed",
  );

  await page
    .getByRole("button", { name: "메모 정규화 실행", exact: true })
    .click();
  await expectNodeState(
    page,
    viewportName,
    "brief-normalization",
    "completed",
  );

  await page
    .getByRole("button", { name: "초안 생성 실행", exact: true })
    .click();
  await expectNodeState(page, viewportName, "draft-generation", "failed");
  await page.getByText("출시일이 비어 있어 초안을 생성할 수 없습니다.").first().waitFor();
  overflowChecks.push(await expectNoOverflow(page, viewportName, "failure"));

  await page
    .getByRole("button", { name: "실패 내용 열기", exact: true })
    .click();
  const dateInput = page.getByLabel("출시일", { exact: true });
  await dateInput.waitFor();
  const retry = page.getByRole("button", {
    name: "수정한 메모로 다시 시도",
    exact: true,
  });
  check(
    await retry.isDisabled(),
    `${viewportName}: retry must be disabled before a valid date`,
  );

  await dateInput.fill("2026-09-18");
  check(
    !(await retry.isDisabled()),
    `${viewportName}: retry must enable after a valid date`,
  );
  overflowChecks.push(await expectNoOverflow(page, viewportName, "correction"));

  await retry.click();
  await expectNodeState(page, viewportName, "draft-generation", "completed");
  await expectNodeState(page, viewportName, "draft-review", "active");
  await page
    .getByText("수정한 메모로 초안 생성에 성공했습니다.", { exact: false })
    .waitFor();

  await page
    .getByRole("button", { name: "초안 리뷰 실행", exact: true })
    .click();
  await expectNodeState(page, viewportName, "draft-review", "active");
  await page.getByText("초안 리뷰를 1회 실행했습니다.", { exact: false }).waitFor();

  await page
    .getByRole("button", { name: "초안 리뷰 반복 실행", exact: true })
    .click();
  await expectNodeState(page, viewportName, "draft-review", "completed");
  await expectNodeState(page, viewportName, "selected-rewrite", "active");
  await node(page, "draft-review").getByText("2회 실행 · 반복 이력 보존").waitFor();
  await node(page, "draft-review")
    .getByRole("img", { name: "초안 리뷰 반복 self-loop" })
    .waitFor();
  overflowChecks.push(await expectNoOverflow(page, viewportName, "loop"));

  await page
    .getByRole("button", { name: "선택 수정 실행", exact: true })
    .click();
  await expectNodeState(page, viewportName, "selected-rewrite", "completed");
  await page.getByText("시나리오 완료 ·", { exact: false }).waitFor();
  overflowChecks.push(await expectNoOverflow(page, viewportName, "completion"));

  await page
    .getByRole("button", { name: "처음부터 다시 재생", exact: true })
    .click();
  await expectNodeState(
    page,
    viewportName,
    "article-initialization",
    "active",
  );
  for (const registryNode of pressCreationProcess.nodes.slice(1)) {
    await expectNodeState(page, viewportName, registryNode.id, "waiting");
  }
  check(
    (await page.locator("#scenario-launch-date").count()) === 0,
    `${viewportName}: reset must close and clear the repair form`,
  );
  await node(page, "draft-review")
    .getByText("리뷰 반복 경로 · 아직 실행 전")
    .waitFor();
  overflowChecks.push(await expectNoOverflow(page, viewportName, "reset"));

  requestWatch.stop();
  check(
    requestWatch.violations.length === 0,
    `${viewportName}: scenario emitted forbidden requests: ${requestWatch.violations.join(", ")}`,
  );
  check(
    pageErrors.length === 0,
    `${viewportName}: page errors: ${pageErrors.join(" | ")}`,
  );

  return overflowChecks;
}

async function verifyLandingLinks(page: Page, viewportName: string) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor();

  const pressCard = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "보도자료 AI" }) });
  const resumeCard = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "자기소개서 AI" }) });
  const startLinks = [
    page.getByRole("link", { name: "보도자료 작성", exact: true }),
    page.getByRole("link", { name: "자기소개서 작성", exact: true }),
    pressCard.getByRole("link", { name: "바로 작성 시작", exact: true }),
    resumeCard.getByRole("link", { name: "바로 작성 시작", exact: true }),
  ];
  const startTargets = await Promise.all(
    startLinks.map(async (link) => {
      check(
        (await link.count()) === 1,
        `${viewportName}: each landing start action must render exactly once`,
      );
      return link.getAttribute("href");
    }),
  );
  check(
    JSON.stringify(startTargets) ===
      JSON.stringify(["/press", "/resume", "/press", "/resume"]),
    `${viewportName}: landing start actions have incorrect targets: ${startTargets.join(", ")}`,
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const scenarioPage = await context.newPage();
      const overflowChecks = await verifyScenario(scenarioPage, viewport.name);
      await scenarioPage.close();

      const landingPage = await context.newPage();
      await verifyLandingLinks(landingPage, viewport.name);
      await landingPage.close();
      await context.close();

      results.push({ viewport: viewport.name, overflowChecks });
    }

    console.log(JSON.stringify({ ok: true, baseUrl, results }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
