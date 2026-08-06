import { chromium } from "playwright";

const argument = process.argv.find((value) => value.startsWith("--base-url="));
const baseUrl = argument?.slice("--base-url=".length)
  ?? (process.argv[process.argv.indexOf("--base-url") + 1] || "http://127.0.0.1:3003");
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function runViewport(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const mutations = [];
  await page.goto(`${baseUrl}/demo/rag-test`, { waitUntil: "networkidle" });
  page.on("request", (request) => {
    const url = new URL(request.url());
    const origin = new URL(baseUrl).origin;
    if (url.origin === origin && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
      mutations.push(`${request.method()} ${url.pathname}`);
    }
  });

  const executionIdentity = page.getByRole("region", { name: "선택 실행 신원" });
  await executionIdentity.waitFor();
  await executionIdentity.getByText(/반복 1\//).waitFor();
  await page.getByText("개별 반복의 실행 시각이 아니라 아티팩트 전체 수집 기간입니다.").waitFor();
  await page.getByRole("alert").first().waitFor();

  const stageNav = page.getByRole("navigation", { name: "워크플로 7단계" });
  const stageButtons = stageNav.getByRole("button");
  check(await stageButtons.count() === 7, `${viewport.name}: expected seven stages`);
  await stageButtons.first().focus();
  await page.keyboard.press("End");
  check(await stageButtons.nth(6).evaluate((node) => node === document.activeElement), `${viewport.name}: End did not focus last stage`);
  await page.keyboard.press("Home");
  check(await stageButtons.first().evaluate((node) => node === document.activeElement), `${viewport.name}: Home did not focus first stage`);
  await page.keyboard.press("ArrowLeft");
  check(await stageButtons.nth(6).evaluate((node) => node === document.activeElement), `${viewport.name}: arrow navigation did not wrap`);
  await stageButtons.nth(1).click();
  await page.getByRole("button", { name: "변경값으로 로컬 판정 계산" }).click();
  await page.getByText("로컬 판정을 계산했습니다.").waitFor();
  await page.getByRole("heading", { name: /기록\/테스트 비교/ }).waitFor();
  await page.getByText("변경 없음 (기록과 정확히 동일)").waitFor();

  await page.locator("details").filter({ hasText: "선택 단계 전이와 가드레일 상세" }).locator("summary").click();
  await page.getByText(/기록 진행/).first().waitFor();
  await page.getByRole("button", { name: "테스트 초기화" }).click();
  check(await page.getByText("로컬 판정을 계산했습니다.").count() === 0, `${viewport.name}: reset did not clear report`);

  await stageNav.getByRole("button").first().click();
  await page.getByLabel("프롬프트").fill("contact qa@example.com");
  check(await page.getByRole("button", { name: "변경값으로 로컬 판정 계산" }).isDisabled(), `${viewport.name}: sensitive input did not block calculation`);

  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  check(dimensions.width <= dimensions.client, `${viewport.name}: horizontal overflow ${dimensions.width} > ${dimensions.client}`);
  check(mutations.length === 0, `${viewport.name}: same-origin mutations: ${mutations.join(", ")}`);
  await page.close();
  return { viewport: viewport.name, mutations: mutations.length, scrollWidth: dimensions.width, clientWidth: dimensions.client };
}

const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const viewport of viewports) results.push(await runViewport(browser, viewport));
  console.log(JSON.stringify({ ok: true, baseUrl, results }, null, 2));
} finally {
  await browser.close();
}
