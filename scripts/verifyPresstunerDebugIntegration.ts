import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";

import {
  PRESSTUNER_DEBUG_RUN_SCHEMA_VERSION,
  PRESSTUNER_DOMAIN_REQUIREMENTS,
  PressTunerDebugRunSnapshotSchema,
} from "../domain/press-ai-debugger/presstunerDebugRunContract";

export const OPS_AI_OPERATIONS_ROUTE = "/ops/ai-operations" as const;

export type PressTunerDebugVerificationEvidence = {
  ok: true;
  schemaVersion: typeof PRESSTUNER_DEBUG_RUN_SCHEMA_VERSION;
  requirementCount: number;
  canonicalScope: true;
  route: typeof OPS_AI_OPERATIONS_ROUTE;
  privacy: "passed";
};

class PressTunerDebugVerificationError extends Error {
  constructor(readonly code: string) { super(code); }
}

function fail(code: string): never {
  throw new PressTunerDebugVerificationError(code);
}

function option(name: string, fallback: string) {
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  const index = process.argv.indexOf(name);
  return inline?.slice(name.length + 1) ?? (index >= 0 ? process.argv[index + 1] : undefined) ?? fallback;
}

function requireEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name}_REQUIRED`);
  return value;
}

export function verifyStoredSnapshot(snapshotInput: unknown, privateSentinels: readonly string[]): PressTunerDebugVerificationEvidence {
  const serialized = JSON.stringify(snapshotInput);
  for (const sentinel of privateSentinels.filter(Boolean)) {
    if (serialized.includes(sentinel)) fail("OPS_SNAPSHOT_PRIVACY_VIOLATION");
  }

  const parsed = PressTunerDebugRunSnapshotSchema.safeParse(JSON.parse(serialized));
  if (!parsed.success) fail("OPS_SNAPSHOT_CONTRACT_INVALID");
  if (parsed.data.schemaVersion !== PRESSTUNER_DEBUG_RUN_SCHEMA_VERSION) fail("OPS_SNAPSHOT_V3_REQUIRED");

  const requirements = parsed.data.domainObservations.requirements;
  if (requirements.length !== PRESSTUNER_DOMAIN_REQUIREMENTS.length) fail("OPS_SNAPSHOT_REQUIREMENT_ROSTER_INVALID");
  const critical = requirements.find((item) => item.requirementId === "critical-fact-preservation");
  if (!critical || critical.outcome.state !== "EVALUATED" || !critical.details
    || !["NUMBER", "DATE", "QUOTE", "CONSTRAINT"].every((kind) => critical.details?.counts.byKind[kind as keyof typeof critical.details.counts.byKind])) {
    fail("OPS_SNAPSHOT_CRITICAL_FACT_COUNTS_MISSING");
  }

  return {
    ok: true,
    schemaVersion: parsed.data.schemaVersion,
    requirementCount: requirements.length,
    canonicalScope: true,
    route: OPS_AI_OPERATIONS_ROUTE,
    privacy: "passed",
  };
}

async function main() {
  const pressUrl = option("--press-url", "http://127.0.0.1:3003");
  const opsUrl = option("--ops-url", "http://127.0.0.1:3012");
  const storageState = requireEnvironment("PRESS_QA_STORAGE_STATE");
  const opsDatabaseUrl = requireEnvironment("OPS_DATABASE_URL");
  const memo = `QA-${randomUUID()} 수치 42, 날짜 2026-08-10, 인용 “검증 인용문”, 제약: 외부 공개 금지.`;

  const browser = await chromium.launch({ headless: true });
  let attemptId = "";
  try {
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await page.goto(`${pressUrl}/demo/rag-test`, { waitUntil: "networkidle" });
    await page.getByLabel("대략적인 메모").fill(memo);
    const consent = page.getByText("새 테스트 Article이 생성");
    if (await consent.count()) await consent.click();
    const creation = page.waitForResponse((response) => response.url().endsWith("/api/press/agent/process-debug-attempts") && response.request().method() === "POST");
    await page.getByRole("button", { name: /새 시도 만들기/ }).click();
    const created = await (await creation).json() as { attempt?: { id?: string } };
    attemptId = created.attempt?.id ?? "";
    if (!attemptId) fail("REAL_ATTEMPT_NOT_CREATED");
    await page.getByRole("button", { name: "이 노드만 실행" }).click();
    await page.getByRole("button", { name: "initialization-brief: PASS", exact: true }).click();
    await page.getByRole("button", { name: "다음 노드 활성화" }).click();
    await page.getByText("활성 노드: brief-normalization").waitFor();
    await page.getByRole("button", { name: "이 노드만 실행" }).click();
    await page.getByRole("button", { name: "brief-draft: PASS", exact: false }).waitFor();
    await page.getByText(/confirm-normalized-brief|정규화 브리프 확인/).waitFor();
    await page.goto(`${opsUrl}${OPS_AI_OPERATIONS_ROUTE}`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
    await context.close();
  } finally {
    await browser.close();
  }

  const ops = new PrismaClient({ datasources: { db: { url: opsDatabaseUrl } } });
  try {
    const rows = await ops.$queryRawUnsafe<Array<{ snapshot: unknown }>>(
      "SELECT snapshot FROM presstuner_debug_snapshots WHERE operation_id = $1 ORDER BY snapshot_revision DESC LIMIT 1",
      attemptId,
    );
    if (!rows[0]) fail("OPS_SNAPSHOT_NOT_FOUND");
    const evidence = verifyStoredSnapshot(rows[0].snapshot, [
      memo,
      process.env.PRESS_QA_TEAM_SENTINEL ?? "",
      process.env.PRESS_QA_USER_SENTINEL ?? "",
      "PRIVATE_MEMO",
      "PRIVATE_BRIEF",
      "PRIVATE_ARTICLE",
      "PRIVATE_PROMPT",
      "PRIVATE_PROVIDER",
      "team-private",
      "user-private",
    ]);
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await ops.$disconnect();
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const code = error instanceof PressTunerDebugVerificationError ? error.code : "PRESSTUNER_DEBUG_VERIFICATION_FAILED";
    console.error(JSON.stringify({ status: "failed", code, ok: false }));
    process.exitCode = 1;
  });
}
