import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";

function option(name: string, fallback: string) { const inline = process.argv.find((value) => value.startsWith(`${name}=`)); const index = process.argv.indexOf(name); return inline?.slice(name.length + 1) ?? (index >= 0 ? process.argv[index + 1] : undefined) ?? fallback; }
function requireEnvironment(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
const pressUrl = option("--press-url", "http://127.0.0.1:3003"); const opsUrl = option("--ops-url", "http://127.0.0.1:3012");
const memo = `QA-${randomUUID()} 수치 42, 날짜 2026-08-10, 인용 “검증 인용문”, 제약: 외부 공개 금지.`;

async function main() {
  const storageState = requireEnvironment("PRESS_QA_STORAGE_STATE"); const opsDatabaseUrl = requireEnvironment("OPS_DATABASE_URL");
  const browser = await chromium.launch({ headless: true }); let attemptId = "";
  try {
    const context = await browser.newContext({ storageState }); const page = await context.newPage();
    await page.goto(`${pressUrl}/demo/rag-test`, { waitUntil: "networkidle" });
    await page.getByLabel("대략적인 메모").fill(memo);
    const consent = page.getByText("새 테스트 Article이 생성"); if (await consent.count()) await consent.click();
    const creation = page.waitForResponse((response) => response.url().endsWith("/api/press/agent/process-debug-attempts") && response.request().method() === "POST");
    await page.getByRole("button", { name: /새 시도 만들기/ }).click();
    const created = await (await creation).json() as { attempt?: { id?: string } }; attemptId = created.attempt?.id ?? ""; if (!attemptId) throw new Error("REAL_ATTEMPT_NOT_CREATED");
    await page.getByRole("button", { name: "이 노드만 실행" }).click();
    await page.getByRole("button", { name: "initialization-brief: PASS", exact: true }).click();
    await page.getByRole("button", { name: "다음 노드 활성화" }).click();
    await page.getByText("활성 노드: brief-normalization").waitFor();
    await page.getByRole("button", { name: "이 노드만 실행" }).click();
    await page.getByRole("button", { name: "brief-draft: PASS", exact: false }).waitFor();
    await page.getByText(/confirm-normalized-brief|정규화 브리프 확인/).waitFor();
    await page.goto(`${opsUrl}/ai-operations`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    await context.close();
  } finally { await browser.close(); }

  const ops = new PrismaClient({ datasources: { db: { url: opsDatabaseUrl } } });
  try {
    const rows = await ops.$queryRawUnsafe<Array<{ snapshot: unknown }>>(`SELECT snapshot FROM presstuner_debug_snapshots WHERE operation_id = $1 ORDER BY snapshot_revision DESC LIMIT 1`, attemptId);
    if (!rows[0]) throw new Error("OPS_SNAPSHOT_NOT_FOUND");
    const serialized = JSON.stringify(rows[0].snapshot); if (serialized.includes(memo)) throw new Error("PRIVACY_MEMO_LEAK");
    for (const name of ["PRESS_QA_TEAM_SENTINEL", "PRESS_QA_USER_SENTINEL"]) { const sentinel = process.env[name]; if (sentinel && serialized.includes(sentinel)) throw new Error(`PRIVACY_${name}_LEAK`); }
    const snapshot = rows[0].snapshot as { evaluations?: Array<{ id?: string; counts?: { byKind?: Record<string, unknown> } }> }; const evaluation = snapshot.evaluations?.find((item) => item.id === "critical-fact-preservation");
    if (!evaluation || !["NUMBER", "DATE", "QUOTE", "CONSTRAINT"].every((kind) => evaluation.counts?.byKind?.[kind])) throw new Error("CRITICAL_FACT_COUNTS_MISSING");
    console.log(JSON.stringify({ ok: true, attemptId, pressUrl, opsUrl, privacy: "passed" }, null, 2));
  } finally { await ops.$disconnect(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "PRESSTUNER_DEBUG_VERIFICATION_FAILED"); process.exitCode = 1; });
