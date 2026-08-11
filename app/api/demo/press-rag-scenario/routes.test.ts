import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NextRequest } from "next/server";

import { POST as startPost } from "./start/route";
import { POST as commandPost } from "./command/route";

const secret = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";
const url = "http://localhost/api/demo/press-rag-scenario";

function request(path: "start" | "command", body: unknown, cookie?: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${url}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => { process.env.PRESS_RAG_DEMO_SIGNING_SECRET = secret; });
test.afterEach(() => { delete process.env.PRESS_RAG_DEMO_SIGNING_SECRET; });

test("start issues a session cookie and command initializes without an AI call", async () => {
  const start = await startPost(request("start", { memo: "memo", tone: "formal" }));
  assert.equal(start.status, 201);
  assert.match(start.headers.get("Cache-Control") ?? "", /no-store/);
  const setCookie = start.headers.get("Set-Cookie");
  assert.match(setCookie ?? "", /pt_public_press_rag_demo=/);
  const cookie = setCookie?.split(";", 1)[0];
  const scenario = await start.json();
  const command = await commandPost(request("command", { type: "execute_node", capability: scenario.capability, expectedRevision: 0 }, cookie));
  assert.equal(command.status, 200);
  const next = await command.json();
  assert.equal(next.attempt.checkpoints[0].nodeId, "article-initialization");
  assert.equal(next.commandsRemaining, 19);
});

test("routes reject non-JSON, cross-site and oversized requests", async () => {
  const nonJson = await startPost(request("start", { memo: "memo", tone: "formal" }, undefined, { "Content-Type": "text/plain" }));
  assert.equal(nonJson.status, 400);
  const crossSite = await startPost(request("start", { memo: "memo", tone: "formal" }, undefined, { "Sec-Fetch-Site": "cross-site" }));
  assert.equal(crossSite.status, 400);
  const hostileOrigin = await startPost(request("start", { memo: "memo", tone: "formal" }, undefined, { Origin: "https://evil.example" }));
  assert.equal(hostileOrigin.status, 400);
  const oversized = await startPost(request("start", { memo: "memo", tone: "formal" }, undefined, { "Content-Length": "70000" }));
  assert.equal(oversized.status, 400);
});

test("same-origin validation follows the incoming host instead of a rewritten Next URL", async () => {
  const response = await startPost(request("start", { memo: "memo", tone: "formal" }, undefined, {
    Host: "127.0.0.1:3021",
    Origin: "http://127.0.0.1:3021",
  }));
  assert.equal(response.status, 201);
});

test("the seventh rolling start returns 429 with Retry-After", async () => {
  let cookie: string | undefined;
  for (let index = 0; index < 6; index += 1) {
    const response = await startPost(request("start", { memo: `memo ${index}`, tone: "formal" }, cookie));
    assert.equal(response.status, 201);
    cookie = response.headers.get("Set-Cookie")?.split(";", 1)[0];
  }
  const rejected = await startPost(request("start", { memo: "seventh", tone: "formal" }, cookie));
  assert.equal(rejected.status, 429);
  assert.ok(Number(rejected.headers.get("Retry-After")) > 0);
  assert.equal((await rejected.json()).remainingStarts, 0);
});

test("public routes stay isolated and the model adapter is server-suffixed and lazy", async () => {
  const [start, command, service, adapter] = await Promise.all([
    readFile("app/api/demo/press-rag-scenario/start/route.ts", "utf8"),
    readFile("app/api/demo/press-rag-scenario/command/route.ts", "utf8"),
    readFile("lib/services/demo/pressRagScenarioService.ts", "utf8"),
    readFile("lib/services/demo/pressRagScenarioOpenAi.server.ts", "utf8"),
  ]);
  for (const source of [start, command, service]) {
    assert.doesNotMatch(source, /@prisma|lib\/services\/press|requireTeamContext|ArticleService|billing|quota\/aiQuota/u);
  }
  assert.match(command, /pressRagScenarioOpenAi\.server/);
  assert.match(adapter, /function openAiClient/);
  assert.doesNotMatch(adapter, /^const client = new OpenAI/mu);
});
