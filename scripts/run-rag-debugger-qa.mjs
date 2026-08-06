import { chromium } from "playwright";

const argument = process.argv.find((value) => value.startsWith("--base-url="));
const baseUrl = argument?.slice("--base-url=".length) ?? (process.argv[process.argv.indexOf("--base-url") + 1] || "http://127.0.0.1:3003");
const viewports = [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }];
const check = (condition, message) => { if (!condition) throw new Error(message); };

async function installMock(page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    const base = { schemaVersion: "press-agent-workflow-event/v1", runId: "qa-debug-run", occurredAt: new Date().toISOString() };
    const event = (sequence, payload) => ({ ...base, eventId: `qa-event-${sequence}`, dedupeKey: `qa-key-${sequence}`, sequence, ...payload });
    const normal = [
      event(1, { type: "run.started", run: { status: "running" } }),
      event(2, { type: "stage.state", stage: { id: "request-intake", state: "succeeded", findingCode: null } }),
      event(3, { type: "edge.state", edge: { id: "request-retrieval", source: "request-intake", target: "retrieval-execution", state: "taken", findingCode: null } }),
      event(4, { type: "stage.state", stage: { id: "retrieval-execution", state: "running", findingCode: null } }),
      event(5, { type: "stage.state", stage: { id: "retrieval-execution", state: "warning", findingCode: "retrieval-tool-failed", metrics: { failedTools: 1 } } }),
      event(6, { type: "edge.state", edge: { id: "retrieval-evidence", source: "retrieval-execution", target: "evidence-decision", state: "taken-with-violation", findingCode: "retrieval-tool-failed" } }),
      event(7, { type: "stage.state", stage: { id: "verification", state: "warning", findingCode: "claim-verification-failed", metrics: { claims: 2, supportedClaims: 1 } } }),
      event(8, { type: "edge.state", edge: { id: "verification-fallback", source: "verification", target: "fallback", state: "taken-with-violation", findingCode: "claim-verification-failed" } }),
      event(9, { type: "stage.state", stage: { id: "fallback", state: "warning", findingCode: "fallback-extractive" } }),
      event(10, { type: "stage.state", stage: { id: "terminal-evaluation", state: "running", findingCode: null } }),
      event(11, { type: "stage.state", stage: { id: "terminal-evaluation", state: "warning", findingCode: "guardrail-warning", metrics: { failedTools: 1, citations: 1 } } }),
      event(12, { type: "run.finished", run: { status: "warning", findingCode: "guardrail-warning" } }),
    ];
    const cancellation = [
      event(20, { type: "stage.state", stage: { id: "response-behavior", state: "blocked", findingCode: "user-cancelled" } }),
      event(21, { type: "stage.state", stage: { id: "verification", state: "skipped", findingCode: "user-cancelled" } }),
      event(22, { type: "run.finished", run: { status: "cancelled", findingCode: "user-cancelled" } }),
    ];
    let lastEvents = normal;
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url, location.origin);
      if (url.pathname === "/api/me") return new Response(JSON.stringify({ ok: true, user: { id: "qa-user" }, team: { id: "qa-team" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.pathname === "/api/press/agent/rag-debug-runs" && (!init.method || init.method === "GET")) return new Response(JSON.stringify({ ok: true, runs: [{ id: "qa-debug-run", status: "COMPLETED", createdAt: new Date().toISOString(), completedAt: new Date().toISOString() }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.pathname === "/api/press/agent/rag-debug-runs" && init.method === "POST") {
        const prompt = JSON.parse(String(init.body || "{}")).prompt || "";
        const selected = prompt.includes("stall") ? [{ ...event(1, { type: "run.started", run: { status: "running" } }), occurredAt: new Date(Date.now() - 31_000).toISOString() }] : prompt.includes("cancel") ? normal.slice(0, 4) : normal;
        lastEvents = selected;
        const encoder = new TextEncoder();
        return new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(": keepalive\n\n")); selected.forEach((entry, index) => setTimeout(() => { controller.enqueue(encoder.encode(`event: workflow\ndata: ${JSON.stringify(entry)}\n\n`)); if (index === selected.length - 1 && !prompt.includes("cancel")) { controller.enqueue(encoder.encode("event: stream.complete\ndata: {}\n\n")); controller.close(); } }, 90 * (index + 1))); } }), { status: 201, headers: { "Content-Type": "text/event-stream" } });
      }
      if (url.pathname.endsWith("/cancel") && init.method === "POST") { lastEvents = [...lastEvents, ...cancellation]; return new Response(JSON.stringify({ ok: true, run: { id: "qa-debug-run" } }), { status: 200, headers: { "Content-Type": "application/json" } }); }
      if (url.pathname === "/api/press/agent/rag-debug-runs/qa-debug-run") { const after = Number(url.searchParams.get("afterSequence") || 0); return new Response(JSON.stringify({ ok: true, run: { id: "qa-debug-run", status: "COMPLETED", createdAt: new Date().toISOString() }, events: lastEvents.filter((entry) => entry.sequence > after) }), { status: 200, headers: { "Content-Type": "application/json" } }); }
      return originalFetch(input, init);
    };
  });
}

async function verifyLoggedOut(browser, viewport) {
  const page = await browser.newPage({ viewport });
  await page.route("**/api/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, code: "UNAUTHORIZED" }) }));
  await page.goto(`${baseUrl}/demo/rag-test`, { waitUntil: "networkidle" });
  await page.getByText("로그인과 팀 선택이 필요합니다.").waitFor();
  check(await page.getByRole("button", { name: "AI 테스트 실행" }).isDisabled(), `${viewport.name}: logged-out start should be disabled`);
  await page.close();
}

async function verifyAuthenticated(browser, viewport) {
  const page = await browser.newPage({ viewport });
  await installMock(page);
  await page.goto(`${baseUrl}/demo/rag-test`, { waitUntil: "networkidle" });
  const nodes = page.getByLabel("실시간 워크플로 7단계").getByRole("button");
  check(await nodes.count() === 7, `${viewport.name}: expected seven live nodes`);
  check((await nodes.nth(1).innerText()).includes("대기"), `${viewport.name}: retrieval advanced before its event`);
  await page.getByLabel("테스트 프롬프트").fill("normal deterministic run");
  await page.getByRole("button", { name: "AI 테스트 실행" }).click();
  await page.getByText("일부 주장이 최종 근거 검증을 통과하지 못했습니다.").waitFor();
  await nodes.nth(4).click();
  await page.getByText(/안전 대체.*경고와 함께 통과/).first().waitFor();
  await page.getByText(/경고/).first().waitFor();
  await page.getByRole("button", { name: "결과 보기" }).first().click();
  await page.getByText(/마지막 이벤트/).waitFor();
  await page.getByLabel("테스트 프롬프트").fill("stall deterministic run");
  await page.getByRole("button", { name: "AI 테스트 실행" }).click();
  await page.getByText(/30초 이상 새 이벤트가 없어 지연 상태입니다/).waitFor();
  await page.getByLabel("테스트 프롬프트").fill("cancel deterministic run");
  await page.getByRole("button", { name: "AI 테스트 실행" }).click();
  await page.getByRole("button", { name: "실행 취소" }).waitFor();
  await page.getByRole("button", { name: "실행 취소" }).click();
  await page.getByText("취소됨").first().waitFor();
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  check(dimensions.width <= dimensions.client, `${viewport.name}: horizontal overflow ${dimensions.width} > ${dimensions.client}`);
  await page.close();
  return dimensions;
}

const browser = await chromium.launch({ headless: true });
try {
  const results = [];
  for (const viewport of viewports) {
    await verifyLoggedOut(browser, viewport);
    results.push({ viewport: viewport.name, ...(await verifyAuthenticated(browser, viewport)) });
  }
  console.log(JSON.stringify({ ok: true, baseUrl, results }, null, 2));
} finally { await browser.close(); }
