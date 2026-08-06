import { chromium, type Page } from "playwright";
import { getPressAiProcessDefinition } from "@/domain/press-ai-debugger/processRegistry";

const argument = process.argv.find((value) => value.startsWith("--base-url="));
const baseUrl = argument?.slice("--base-url=".length) ?? process.argv[process.argv.indexOf("--base-url") + 1] ?? "http://127.0.0.1:3003";
const viewports = [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }];
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };

async function authenticatedMocks(page: Page) {
  await page.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, user: { id: "qa-user" }, team: { id: "qa-team" } }) }));
  await page.route("**/api/knowledge/documents", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, documents: [{ id: "qa-ready", originalName: "QA facts.pdf", status: "READY", pageCount: 3, chunkCount: 8, activeGenerationId: "generation", hasPendingReplacement: false }], quota: { activeDocumentCount: 1, storedBytes: 100, uploadsInWindow: 1, limits: { documents: 25, storedBytes: 1000, uploads: 10, windowSeconds: 3600 }, retryAfterSeconds: 0 } }) }));
  await page.route("**/api/press/agent/process-debug-runs", (route) => { if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, runs: [] }) }); return route.continue(); });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
  const results = [];
  for (const viewport of viewports) {
    const loggedOut = await browser.newPage({ viewport });
    await loggedOut.route("**/api/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    await loggedOut.goto(`${baseUrl}/demo/rag-test`, { waitUntil: "networkidle" });
    await loggedOut.getByText("로그인과 팀 선택이 필요합니다.").waitFor();
    await loggedOut.close();

    const page = await browser.newPage({ viewport }); await authenticatedMocks(page); await page.goto(`${baseUrl}/demo/rag-test`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1, name: "Press AI 프로세스 디버거" }).waitFor();
    const rag = getPressAiProcessDefinition("rag-query"); check(await page.getByLabel(`${rag.label} 워크플로`).getByRole("button").count() === rag.nodes.length, `${viewport.name}: RAG registry node count mismatch`);
    await page.getByLabel(/보도자료 작성/).check();
    const creation = getPressAiProcessDefinition("press-creation"); check(await page.getByLabel(`${creation.label} 워크플로`).getByRole("button").count() === creation.nodes.length, `${viewport.name}: Press registry node count mismatch`);
    await page.getByText("실제 문서가 생성되고 일반 Press 할당량").waitFor();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })); check(dimensions.width <= dimensions.client, `${viewport.name}: horizontal overflow`);
    results.push({ viewport: viewport.name, ...dimensions }); await page.close();
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
