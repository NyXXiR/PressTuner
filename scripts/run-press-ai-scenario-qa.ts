import { chromium, type BrowserContext, type Page } from "playwright";

import {
  PUBLIC_PRESS_RAG_EVIDENCE,
  PUBLIC_PRESS_RAG_LIMITS,
  type PublicPressRagAttempt,
} from "@/domain/demo/pressRagScenarioContract";
import {
  advancePublicPressRagEdge,
  createPublicPressRagAttempt,
  executePublicPressRagNode,
  retryPublicPressRagFromBlock,
} from "@/domain/demo/pressRagScenarioMachine";

const argument = (name: string, fallback: string) => {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  const index = process.argv.indexOf(name);
  return inline?.slice(name.length + 1) ?? (index >= 0 ? process.argv[index + 1] : undefined) ?? fallback;
};
const baseUrl = argument("--base-url", "http://127.0.0.1:3003").replace(/\/$/u, "");
const mode = argument("--mode", "mock");
if (mode !== "mock" && mode !== "live") throw new Error("--mode must be mock or live");

const citation = (index: number) => ({ sourceDocumentId: PUBLIC_PRESS_RAG_EVIDENCE.id, factId: PUBLIC_PRESS_RAG_EVIDENCE.facts[index].id, evidenceExcerpt: PUBLIC_PRESS_RAG_EVIDENCE.facts[index].excerpt });

async function installMock(context: BrowserContext) {
  let attempt: PublicPressRagAttempt | null = null;
  let ancestors: PublicPressRagAttempt[] = [];
  let id = 0;
  const scenario = () => ({ runId: "qa-run", attempt, attempts: [...ancestors, attempt], capability: `mock-${attempt?.revision ?? 0}`, evidence: PUBLIC_PRESS_RAG_EVIDENCE, quota: { remainingStarts: 5, retryAfterSeconds: 0 }, limits: PUBLIC_PRESS_RAG_LIMITS, commandsRemaining: 20 - (attempt?.revision ?? 0) });
  await context.route("**/api/demo/press-rag-scenario/**", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (route.request().url().endsWith("/start")) {
      attempt = createPublicPressRagAttempt({ runId: "qa-run", memo: String(body.memo), tone: "formal", now: Date.now() });
      ancestors = [];
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(scenario()) });
      return;
    }
    if (!attempt) throw new Error("mock command before start");
    const contextValue = { now: Date.now() + id, revision: attempt.revision + 1, id: () => `qa-${++id}` };
    if (body.type === "advance_edge") attempt = advancePublicPressRagEdge(attempt, contextValue);
    else if (body.type === "retry_from_block") {
      ancestors.push(attempt);
      attempt = retryPublicPressRagFromBlock({ attempt, correctedMemo: String(body.correctedMemo), context: contextValue });
    } else {
      const nodeId = attempt.activeNodeId;
      const input = nodeId === "article-initialization" ? { type: "PRESS_RELEASE" } : nodeId === "brief-normalization" ? { rawText: attempt.inputSnapshot.rawText } : { articleId: attempt.articleId };
      const output = nodeId === "article-initialization"
        ? { articleId: attempt.articleId, type: "PRESS_RELEASE" }
        : nodeId === "brief-normalization"
          ? { serviceName: "Bridge", announceType: "출시", oneLiner: "Bridge 출시", points: ["근거"], tone: "formal", rawText: attempt.inputSnapshot.rawText, claims: attempt.parentAttemptId ? [
              { claim: "MonoLab은 팀 협업 서비스 Bridge를 2026-09-18에 출시합니다.", citation: citation(0) },
              { claim: "Bridge 베타 설문은 참여자 120명 대상이며 만족도는 92%입니다.", citation: citation(1) },
              { claim: "실시간 공동 편집과 승인 워크플로를 제공합니다.", citation: citation(2) },
            ] : [
              { claim: "MonoLab은 팀 협업 서비스 Bridge를 2026-09-18에 출시합니다.", citation: citation(0) },
              { claim: "국내 협업툴 시장 점유율 1위입니다.", citation: null },
            ] }
          : nodeId === "draft-generation"
            ? { title: "MonoLab, Bridge 출시", plain: "MonoLab이 Bridge를 출시한다." }
            : nodeId === "draft-review"
              ? { notes: [{ id: `note-${attempt.checkpoints.filter((item) => item.nodeId === "draft-review").length + 1}`, message: "제목과 리드를 명확히 하세요." }] }
              : { title: "MonoLab, Bridge 9월 18일 출시", plain: "수정된 최종 본문" };
      attempt = executePublicPressRagNode({ attempt, input, output, context: contextValue });
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(scenario()) });
  });
}

async function noOverflow(page: Page, label: string) {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (size.scroll > size.client) throw new Error(`${label}: horizontal overflow ${size.scroll} > ${size.client}`);
  return { label, ...size };
}

async function clickAction(page: Page, name: RegExp) {
  const button = page.getByRole("button", { name }).last();
  await button.waitFor({ state: "visible" });
  await button.click();
  await page.waitForFunction(() => !document.body.textContent?.includes("서버에서 실행 중입니다…"));
  const alertMessages = (await page.getByRole("alert").allTextContents())
    .map((value) => value.trim())
    .filter(Boolean);
  if (alertMessages.length) throw new Error(`scenario error: ${alertMessages.join(" | ")}`);
}

async function runScenario(page: Page, label: string) {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/demo/rag-test/scenario`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1, name: /근거 차단과 재시도/ }).waitFor();
  const checks = [await noOverflow(page, `${label}:initial`)];
  await clickAction(page, /^시나리오 시작$/);
  await clickAction(page, /문서 초기화 실행/);
  await clickAction(page, /initialization-brief 전이 승인/);
  await clickAction(page, /메모 정규화 실행/);
  await page.getByRole("heading", { name: "근거 없는 주장을 수정하세요" }).waitFor();
  checks.push(await noOverflow(page, `${label}:blocked`));
  await clickAction(page, /수정한 메모로 차단 지점부터 재시도/);
  await clickAction(page, /메모 정규화 실행/);
  await clickAction(page, /brief-draft 전이 승인/);
  await clickAction(page, /초안 생성 실행/);
  await clickAction(page, /draft-review 전이 승인/);
  await clickAction(page, /초안 리뷰 실행/);
  await clickAction(page, /review-repeat 전이 승인/);
  await clickAction(page, /초안 리뷰 실행/);
  await clickAction(page, /review-rewrite 전이 승인/);
  await page.getByRole("checkbox").first().check();
  await clickAction(page, /선택 수정 실행/);
  await page.getByRole("heading", { name: "시나리오 완료" }).waitFor();
  checks.push(await noOverflow(page, `${label}:complete`));
  if (pageErrors.length) throw new Error(`${label}: ${pageErrors.join(" | ")}`);
  return checks;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const viewports = mode === "live"
      ? [{ name: "desktop-live", width: 1440, height: 1000 }]
      : [{ name: "desktop-mock", width: 1440, height: 1000 }, { name: "mobile-mock", width: 390, height: 844 }];
    const results = [];
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      if (mode === "mock") await installMock(context);
      const page = await context.newPage();
      results.push({ viewport: viewport.name, checks: await runScenario(page, viewport.name) });
      await context.close();
    }
    console.log(JSON.stringify({ ok: true, mode, baseUrl, logicalScenarios: results.length, results }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
