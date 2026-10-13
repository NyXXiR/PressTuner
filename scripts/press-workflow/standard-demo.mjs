// Isolated product demo. Never writes to the configured non-test database.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolveTestDatabaseUrl } from "../run-tests.mjs";
import { DEV_GOOGLE_BYPASS_EMAIL } from "../../lib/auth/devGoogleBypass.ts";

const mode = process.argv[2];
if (!["seed", "serve", "sync-schema"].includes(mode)) throw new Error("Usage: node --import tsx scripts/press-workflow/standard-demo.mjs seed|serve|sync-schema");
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
const databaseUrl = resolveTestDatabaseUrl(process.env);
const articleId = "standard-evaluation-demo";
const teamId = "standard-evaluation-demo-team";

if (mode === "seed") {
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
  try {
    await db.$transaction(async tx => {
      const user = await tx.user.upsert({ where: { email: DEV_GOOGLE_BYPASS_EMAIL }, update: {},
        create: { loginId: "standard-evaluation-demo", label: "표준 평가 확인용 계정", email: DEV_GOOGLE_BYPASS_EMAIL } });
      await tx.team.upsert({ where: { id: teamId }, update: {}, create: {
        id: teamId, slug: teamId, name: "[검증용] 표준 평가", limitArticleMonthly: 3, limitResumeMonthly: 10,
        productSubscriptions: { create: [{ product: "PRESS", planId: "free_v1", plan: "FREE" }, { product: "CAREER", planId: "free_v1", plan: "FREE" }] },
      } });
      await tx.teamMember.upsert({ where: { teamId_userId: { teamId, userId: user.id } }, update: {}, create: { teamId, userId: user.id, role: "OWNER" } });
      const facts = [
        "미르소프트는 2026년 10월 12일 협업 도구 라이트노트를 출시했다.",
        "라이트노트는 회의 메모를 팀별로 정리하는 기능을 제공한다.",
        "라이트노트의 이용 요금은 월 9,900원이다.",
      ];
      await tx.article.upsert({ where: { id: articleId }, update: {}, create: {
        id: articleId, teamId, userId: user.id, type: "PRESS_RELEASE", status: "IN_PROGRESS",
        title: "[검증용] 미르소프트, 협업 도구 라이트노트 출시",
        bodyJson: { paragraphs: facts.map(text => ({ text, importance: 0 })), closing: "" },
        groundingState: { create: { groundingRevision: 1 } },
        facts: { create: facts.map((content, index) => ({ teamId, content, origin: "USER", sourceKey: `standard-demo:${index}` })) },
      } });
    }, { timeout: 60000 });
    console.log(JSON.stringify({ database: new URL(databaseUrl).pathname, articleId, seeded: true }));
  } finally { await db.$disconnect(); }
} else if (mode === "sync-schema") {
  console.log(`Synchronizing isolated ${new URL(databaseUrl).pathname}; data-loss acceptance is disabled.`);
  const child = spawn(process.execPath, [resolve("node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], {
    stdio: "inherit", windowsHide: true, env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  child.on("error", error => { console.error(error.name); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
} else {
  console.log(`Standard evaluation demo uses isolated ${new URL(databaseUrl).pathname}; http://localhost:3003/press/${articleId}/edit`);
  const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "-p", "3003"], {
    stdio: "inherit", windowsHide: true,
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "development", NEXT_DIST_DIR: ".next/standard-demo", PRESS_STANDARD_EVALUATION_ENABLED: "true" },
  });
  child.on("error", error => { console.error(error.name); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
}
