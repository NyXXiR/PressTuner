import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rag-test exposes an authenticated thin route for inserting OPS sample process data", async () => {
  const [route, surface, client] = await Promise.all([
    readFile("app/api/press/agent/ops-test-process/route.ts", "utf8"),
    readFile("components/demo/PressAiProcessDebugger.tsx", "utf8"),
    readFile("lib/pressAiProcessDebuggerClient.ts", "utf8"),
  ]);
  assert.match(route, /requireTeamContext/);
  assert.match(route, /requireAdmin/);
  assert.match(route, /createOpsConsoleTestProcessData/);
  assert.match(route, /no-store/);
  assert.doesNotMatch(route, /prisma\./);
  assert.match(surface, /PressAiOpsTestDataControl/);
  assert.match(client, /\/api\/press\/agent\/ops-test-process/);
  assert.doesNotMatch(surface + client, /OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY/);
});
