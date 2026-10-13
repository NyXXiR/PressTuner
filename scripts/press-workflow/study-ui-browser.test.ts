import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium, expect } from "playwright/test";
import { fixtureRun } from "../../domain/press-workflow/evaluation/study-fixture";
import { hash } from "../../domain/press-workflow/evaluation/contracts";
import { references } from "../../domain/press-workflow/evaluation/study";
import { createQualityStudy, commandQualityStudy, readQualityStudy, type StudyPorts, type StudyRecord } from "../../lib/services/press-workflow/evaluation/studyService";

// Real React panel + real study service/domain, isolated in-memory repository.
// These automated choices NEVER enter the test/production DB or human evidence.
test("editor adapter saves one-click choices, restores uncertain writes, keeps blind review separate and gates adoption", { timeout: 120000 }, async () => {
  const rows = new Map<string, StudyRecord>(), actor = { teamId: "team", userId: "qa-reviewer", operator: true };
  const source = fixtureRun("ui-browser-source", .2);
  source.snapshot.input = { request: "협업 도구 출시 보도자료", output: "누리문서는 종이별을 출시했다.\n월 이용 요금은 73,000원이다.\n국내 점유율 1위 서비스이며 앞으로 다양한 기능을 추가할 계획이다.", contexts: ["누리문서는 2026년 10월 12일 종이별을 출시했다.", "종이별은 팀 회의 메모를 정리한다.", "이용 요금은 월 7,300원이다."] };
  source.results[0].reason = "원고의 73,000원은 근거의 7,300원과 다릅니다. SECRET_AUTOMATIC";
  for (const id of ["PROMOTIONAL_CLAIMS", "RAGAS"]) { source.profile.metrics.push({ ...source.profile.metrics[0], id }); source.results.push({ ...source.results[0], id }); }
  source.profileHash = hash(source.profile);
  let generateCalls = 0, evaluationCalls = 0, lostResponse = false;
  const requests: { method: string; path: string; action?: string }[] = [];
  const get = (id: string, team: string) => { const row = rows.get(id); if (!row || row.teamId !== team) throw new Error("STUDY_NOT_FOUND"); return structuredClone(row); };
  const ports: StudyPorts = {
    now: () => new Date().toISOString(), token: randomUUID, random: () => .3,
    repository: {
      create: async row => { const old = rows.get(row.id); if (old) { assert.equal(old.createHash, row.createHash); return structuredClone(old); } rows.set(row.id, structuredClone(row)); return row; },
      get: async (id, team) => get(id, team),
      list: async team => [...rows.values()].filter(r => r.teamId === team).map(r => ({ id: r.id, name: r.data.name, revision: r.revision })),
      mutate: async (id, team, change) => { const row = get(id, team); change(row); rows.set(id, structuredClone(row)); return row; },
    },
    loadRun: async () => structuredClone(source), runtime: async () => ({ available: true, reason: null, profile: source.profile }), generator: async () => ({ model: "synthetic-ui-test", implementationHash: "fixture" }),
    generate: async (_snapshot, e, variant) => { generateCalls++; const output = variant === "BASELINE" ? "누리문서의 종이별 이용 요금은 월 7,300원이다." : "누리문서가 팀 회의 메모를 정리하는 종이별을 출시했다. 월 이용 요금은 7,300원이다."; return { sampleId: source.id, variant, output, outputHash: hash(output), generation: { model: "synthetic-ui-test", evidence: "MEASURED", recipeHash: e.recipeHash, requestHash: hash(output), elapsedMs: 1, usage: null } }; },
    evaluate: async snapshot => { evaluationCalls++; return { ...structuredClone(source), snapshot, fingerprint: snapshot.fingerprint, results: source.results.map(m => ({ ...m, score: 1, thresholdPassed: true })) }; },
  };
  const view = { ...source, output: source.snapshot.input.output, contextCount: 3, freshness: "CURRENT" };
  const js = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PressQualityStudyPanel} from './components/press/PressQualityStudyPanel'; function Harness(){ const [run,setRun]=React.useState(${JSON.stringify(view)}); return <><button type="button" onClick={()=>setRun({...run,id:"refreshed-history"})}>QA: 평가 이력 갱신</button><PressQualityStudyPanel articleId="${source.articleId}" run={run} stale={false}/></>;} createRoot(document.getElementById('root')).render(<Harness/>);`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
  // Compile the actual product CSS outside tsx's Node 20/Windows import hook.
  const css = execFileSync(process.execPath, ["-e", "const p=require('postcss'),t=require('@tailwindcss/postcss'),f=require('node:fs');p([t()]).process(f.readFileSync(0,'utf8'),{from:require('node:path').resolve('app/globals.css')}).then(r=>process.stdout.write(r.css)).catch(e=>{console.error(e);process.exitCode=1})"], { input: await readFile("app/globals.css", "utf8"), encoding: "utf8", maxBuffer: 5 * 1024 * 1024, windowsHide: true });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost");
    const send = (body: unknown, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    try {
      if (url.pathname === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI QA · 합성 검토</title><link rel="stylesheet" href="/style.css"><body><main class="mx-auto max-w-5xl p-4"><p class="text-sm">합성 UI 검사 · 실제 사람 판정으로 저장되지 않음</p><div id="root"></div></main><script src="/ui.js"></script></body></html>'); return; }
      if (url.pathname === "/ui.js") { res.setHeader("Content-Type", "text/javascript"); res.end(js.outputFiles[0].text); return; }
      if (url.pathname === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); return; }
      if (url.pathname.startsWith("/fonts/")) { res.end(); return; }
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      requests.push({ method: req.method!, path: url.pathname + url.search, action: body?.action });
      if (url.pathname === "/api/press/quality-studies") { send(req.method === "GET" ? { studies: await ports.repository.list(actor.teamId) } : await createQualityStudy(body, actor, ports)); return; }
      const id = url.pathname.split("/").at(-1)!;
      const result = req.method === "GET" ? await readQualityStudy(id, actor, ports, url.searchParams.get("view") === "report") : await commandQualityStudy(id, body, actor, ports);
      if (lostResponse && body?.action === "SUBMIT_REVIEW") { lostResponse = false; send({ code: "TEST_LOST_RESPONSE_AFTER_SAVE" }, 503); return; }
      send(result);
    } catch (e) { send({ code: e instanceof Error ? e.message : "ERROR" }, 409); }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const screenshot = async (name: string) => { if (process.env.PRESS_QUALITY_SCREENSHOTS) { await mkdir(process.env.PRESS_QUALITY_SCREENSHOTS, { recursive: true }); await page.screenshot({ path: resolve(process.env.PRESS_QUALITY_SCREENSHOTS, `${name}.png`), fullPage: true }); } };
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByRole("button", { name: "이 평가에서 검토 시작" }).click();
    await expect(page.getByRole("button", { name: "수정 필요", exact: true })).toBeEnabled();
    await expect(page.getByLabel("검토할 원고 전체")).toContainText("73,000원");
    await expect(page.getByLabel("작성에 사용한 근거 전체")).toContainText("7,300원");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await screenshot("study-review-mobile");
    await page.getByRole("button", { name: "수정 필요", exact: true }).click();
    await expect(page.getByText("1 / 3개 저장", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "QA: 평가 이력 갱신", exact: true }).click();
    await expect(page.getByText("1 / 3개 저장", { exact: true })).toBeVisible();
    const row = [...rows.values()][0]; assert.equal(references(row.data).length, 0);
    await page.reload();
    await expect(page.getByText("1 / 3개 저장", { exact: true })).toBeVisible();
    lostResponse = true;
    await page.getByRole("button", { name: "나중에 판단", exact: true }).click();
    await expect(page.getByRole("button", { name: "같은 요청으로 결과 확인" })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "같은 요청으로 결과 확인" }).click();
    await expect(page.getByText("2 / 3개 저장", { exact: true })).toBeVisible();
    assert.equal([...rows.values()][0].data.reviews.length, 2);
    await page.getByRole("button", { name: "현재 내용 유지", exact: true }).click();
    await expect(page.getByRole("heading", { name: "이번 검토를 마쳤습니다" })).toBeVisible();
    assert.equal([...rows.values()][0].data.batches.length, 1);
    await page.getByText("평가기 검증에 참여하기 (선택)", { exact: true }).click();
    await page.getByRole("button", { name: "검증 질문 받기" }).click();
    await expect(page.getByRole("button", { name: "기준 충족", exact: true })).toBeDisabled();
    await expect(page.getByText(/SECRET_AUTOMATIC/)).toHaveCount(0);
    await page.getByLabel("기억나지 않아요", { exact: true }).check();
    await page.getByRole("button", { name: "판단 어려움", exact: true }).click();
    await expect(page.getByText("1 / 3개 저장", { exact: true })).toBeVisible();
    assert.equal(requests.some(r => r.path.includes("view=report")), false);
    assert.equal(generateCalls, 0); assert.equal(evaluationCalls, 0);
    await page.getByText("개선 후보 준비·비교 (관리자)", { exact: true }).click();
    await page.getByRole("button", { name: "개선 비교 준비", exact: true }).click();
    await expect(page.getByText("생성·평가 0 / 4단계 완료", { exact: true })).toBeVisible();
    assert.equal(generateCalls, 0);
    await page.getByRole("button", { name: "생성·평가 실행 또는 이어가기 (최대 4단계)" }).click();
    await expect(page.getByText("생성·평가 4 / 4단계 완료", { exact: true })).toBeVisible();
    assert.equal(generateCalls, 2); assert.equal(evaluationCalls, 2);
    await page.getByRole("button", { name: "초안 1의 A/B 비교 열기" }).click();
    await expect(page.getByLabel("두 초안 비교")).toBeVisible();
    await expect(page.getByLabel("선택형 원고 검토")).toHaveCount(0);
    await page.getByLabel("본 적 있어요", { exact: true }).check();
    await page.getByRole("button", { name: "차이 없음", exact: true }).click();
    await expect(page.getByText("저장된 선택: 차이 없음", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    // A wide viewport can still contain a narrow editor panel. Stack by actual
    // available width, not a viewport-only breakpoint.
    await page.locator("main").evaluate(el => { el.style.maxWidth = "390px"; });
    const narrowA = await page.getByLabel("초안 A 전체", { exact: true }).boundingBox();
    const narrowB = await page.getByLabel("초안 B 전체", { exact: true }).boundingBox();
    assert.ok(narrowA && narrowB && narrowB.y > narrowA.y && narrowA.width > 200);
    await page.locator("main").evaluate(el => { el.style.removeProperty("max-width"); });
    await screenshot("study-pair-desktop");
    await page.getByRole("button", { name: "결과와 개선 제안 보기" }).click();
    await expect(page.getByText("아직 개선안을 채택할 근거가 부족합니다", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "개선안 채택 기록", exact: true })).toBeDisabled();
    await expect(page.getByText("재발 여부를 판단할 근거가 부족합니다.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("두 초안 비교")).toHaveCount(0);
    await screenshot("study-report-desktop");
    assert.equal([...rows.values()][0].data.experiments[0].decision, null);
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error(JSON.stringify({ requests, browserErrors: errors, visibleText: await page.locator("body").innerText() }));
    throw error;
  } finally { await browser.close(); await new Promise<void>((r, reject) => server.close(e => e ? reject(e) : r())); }
});
