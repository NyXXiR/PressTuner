import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium, expect } from "playwright/test";
import { fixtureRun } from "../../domain/press-workflow/evaluation/study-fixture";
import { standardDraftText } from "../../domain/press-workflow/evaluation/standard";

// Actual author UI + editor store + orchestration, with synthetic HTTP responses.
// No provider, database, human reference label or study write is involved.
test("author checks once, reviews changed passages, saves/undoes selections and cannot overwrite manual edits", { timeout: 120000 }, async () => {
  const base = { title: "종이별 출시", plain: "누리문서가 종이별을 출시했다.\n\n이용 요금은 월 73,000원이다.\n\n국내 점유율 1위 서비스다." };
  const candidate = { title: "누리문서, 종이별 출시", plain: "누리문서가 종이별을 출시했다.\n\n이용 요금은 월 7,300원이다.\n\n팀 회의 메모를 정리하는 서비스다." };
  let saved = { ...base }, failSave = false;
  const source = fixtureRun("author-ui", .2, "author-article");
  const view = { ...source, output: standardDraftText(base.title, base.plain), contextCount: 1, freshness: "CURRENT" as const };
  const requests: { path: string; method: string; body: Record<string, unknown> | null }[] = [];
  const notes = [{ id: "price", type: "RISK", quote: "이용 요금은 월 73,000원이다.", note: "자료에 적힌 이용 요금으로 고쳐요.", sourceFactIds: ["fact-price"] }];
  const js = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {usePressEditStore as store} from './stores/usePressEditStore';
    import {PressStandardEvaluationPanel} from './components/press/PressStandardEvaluationPanel';
    import {DraftRevisionChoices} from './components/press/quality-edit/DraftRevisionChoices';
    import {requestQualityRevision} from './components/press/quality-edit/revision';
    const initial = ${JSON.stringify(base)};
    store.getState().init({articleId:'author-article',teamId:null,initialTitle:initial.title,initialPlain:initial.plain});
    function Harness() { const s=store(); const [busy,setBusy]=React.useState(false);
      return <><label>본문<textarea aria-label="본문" value={s.plain} onChange={e=>s.setPlain(e.target.value)}/></label>
      <PressStandardEvaluationPanel articleId={s.articleId} title={s.title} plain={s.plain} refreshKey={s.saveState} disabled={busy||s.saveState==='saving'||!!s.pendingResult} revisionBusy={busy} saveDraft={()=>s.saveDraft({force:true})} onRequestRevision={async run=>{setBusy(true);try{await requestQualityRevision(s.articleId,run,{current:()=>store.getState(),save:()=>s.saveDraft({force:true}),review:userInstruction=>s.runReview({quotaMode:'simplified',userInstruction}),select:ids=>s.setSelectedNoteIds(ids),rewrite:instruction=>s.runRePolish(instruction,{quotaMode:'simplified'})});}finally{setBusy(false)}}}/>
      {s.pendingResult&&<DraftRevisionChoices articleId={s.articleId} base={s.pendingResult.base} candidate={s.pendingResult} current={s} notes={s.pendingResult.notes} saveState={s.saveState} disabled={busy} onCommit={(expected,next)=>s.applyDraftChange(s.articleId,expected,next)} onRetrySave={()=>s.saveDraft({force:true})} onClose={()=>s.setPendingResult(null)}/>}</>;
    } createRoot(document.getElementById('root')).render(<Harness/>);`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const css = execFileSync(process.execPath, ["-e", "const p=require('postcss'),t=require('@tailwindcss/postcss'),f=require('node:fs');p([t()]).process(f.readFileSync(0,'utf8'),{from:require('node:path').resolve('app/globals.css')}).then(r=>process.stdout.write(r.css)).catch(e=>{console.error(e);process.exitCode=1})"], { input: await readFile("app/globals.css", "utf8"), encoding: "utf8", maxBuffer: 5 * 1024 * 1024, windowsHide: true });
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    const send = (value: unknown, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (path === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><title>원고 수정 UI · 합성 검사</title><link rel="stylesheet" href="/style.css"><body><main class="mx-auto max-w-4xl space-y-5 p-4"><p class="text-sm">합성 UI 검사 · 실제 원고와 사람 판정에 영향 없음</p><div id="root" class="space-y-5"></div></main><script src="/ui.js"></script></body></html>'); return; }
    if (path === "/ui.js") { res.setHeader("Content-Type", "text/javascript"); res.end(js.outputFiles[0].text); return; }
    if (path === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); return; }
    if (path.startsWith("/fonts/")) { res.end(); return; }
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.from(c));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    requests.push({ path, method: req.method!, body });
    if (path.endsWith("/quality-evaluation")) {
      if (req.method === "POST") { send({ result: view }); return; }
      send({ fingerprint: source.fingerprint, contextCount: 1, inputReason: null, runtimes: { STANDARD: { available: true, reason: null, profile: source.profile }, GEVAL: { available: true, reason: null, profile: source.profile } }, history: [view] }); return;
    }
    if (path.endsWith("/save")) { if (failSave) { failSave = false; send({}, 500); } else { saved = body; send({ ok: true }); } return; }
    if (path.endsWith("/polish")) { send({ ...base, notes, spans: [] }); return; }
    if (path.endsWith("/re-polish")) { send({ ...base, revisedTitle: candidate.title, revisedPlain: candidate.plain }); return; }
    if (path.endsWith("/usage")) { send({}); return; }
    if (path.endsWith("/grounding")) { send({ facts: [{ id: "fact-price", active: true, content: "이용 요금은 월 7,300원이다." }] }); return; }
    send({}, 404);
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const shot = async (name: string) => { if (process.env.PRESS_QUALITY_SCREENSHOTS) { await mkdir(process.env.PRESS_QUALITY_SCREENSHOTS, { recursive: true }); await page.screenshot({ path: resolve(process.env.PRESS_QUALITY_SCREENSHOTS, `${name}.png`), fullPage: true }); } };
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    await expect(page.getByRole("heading", { name: "1가지 내용을 살펴보세요" })).toBeVisible();
    await expect(page.getByRole("button", { name: "표준 평가 실행" })).not.toBeVisible();
    assert.equal(requests.some(r => r.path.includes("quality-studies")), false);
    assert.equal(requests.some(r => r.method === "POST"), false);
    await shot("quality-author-mobile");
    await page.getByRole("button", { name: "현재 원고 다시 확인" }).click();
    await expect(page.getByRole("button", { name: "고칠 부분의 수정안 받기" })).toBeEnabled();
    assert.equal(requests.filter(r => r.path.endsWith("quality-evaluation") && r.method === "POST").length, 1);
    assert.equal(requests.find(r => r.path.endsWith("quality-evaluation") && r.method === "POST")!.body!.kind, "GEVAL");
    await page.getByRole("button", { name: "고칠 부분의 수정안 받기" }).click();
    await expect(page.getByRole("heading", { name: "바뀐 부분만 골라 반영하세요" })).toBeVisible();
    assert.equal(requests.filter(r => r.path.endsWith("/polish")).length, 1);
    assert.equal(requests.filter(r => r.path.endsWith("/re-polish")).length, 1);
    assert.deepEqual(saved, base);
    const countWrites = () => requests.filter(r => r.path.endsWith("/save")).length;
    const initialWrites = countWrites();
    await page.getByRole("button", { name: "현재 문장 유지" }).click();
    await expect(page.getByText("첨삭이 참조한 자료", { exact: true })).toBeVisible();
    assert.equal(countWrites(), initialWrites);
    await shot("quality-change-mobile");
    await page.getByRole("button", { name: "이 수정 반영" }).click();
    await expect(page.getByLabel("본문", { exact: true })).toHaveValue(base.plain.replace("73,000", "7,300"));
    await expect(page.getByText("선택한 부분을 원고에 반영하고 저장했어요.")).toBeVisible();
    assert.equal(saved.plain, base.plain.replace("73,000", "7,300"));
    await page.getByRole("button", { name: "방금 반영 되돌리기" }).click();
    await expect(page.getByLabel("본문", { exact: true })).toHaveValue(base.plain);
    failSave = true;
    await page.getByRole("button", { name: "이 수정 반영" }).click();
    await expect(page.getByRole("button", { name: "다시 저장", exact: true })).toBeVisible();
    assert.equal(saved.plain, base.plain);
    await page.getByRole("button", { name: "다시 저장", exact: true }).click();
    await expect(page.getByText("원고를 저장했어요.", { exact: true })).toBeVisible();
    assert.equal(saved.plain, base.plain.replace("73,000", "7,300"));
    const beforeDefer = countWrites();
    await page.getByRole("button", { name: "나중에 확인", exact: true }).click();
    await expect(page.getByRole("heading", { name: "이번 선택을 마쳤어요" })).toBeVisible();
    assert.equal(countWrites(), beforeDefer);
    await page.getByRole("button", { name: /미룬 변경 .* 다시 보기/ }).click();
    await page.getByRole("button", { name: "현재 문장 유지" }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await shot("quality-decisions-desktop");
    await page.getByLabel("본문", { exact: true }).fill(saved.plain + " 직접 입력.");
    await expect(page.getByText(/원고가 변경되어 이 수정안을 반영할 수 없어요/)).toBeVisible();
    await expect(page.getByRole("button", { name: "방금 반영 되돌리기" })).toBeDisabled();
    assert.equal(requests.some(r => r.path.includes("quality-studies") || r.path.endsWith("/status")), false);
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } catch (error) { console.error(JSON.stringify({ requests, errors, visible: await page.locator("body").innerText() })); throw error; }
  finally { await browser.close(); await new Promise<void>((r, reject) => server.close(e => e ? reject(e) : r())); }
});
