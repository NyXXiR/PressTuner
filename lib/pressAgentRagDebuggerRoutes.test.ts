import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("debugger routes are authenticated, delegated, streaming, and never cache", async () => {
  const [collection, item, existing] = await Promise.all([
    source("app/api/press/agent/rag-debug-runs/route.ts"),
    source("app/api/press/agent/rag-debug-runs/[runId]/route.ts"),
    source("app/api/press/agent/runs/route.ts"),
  ]);
  assert.match(collection, /requireTeamContext\(\)/);
  assert.match(item, /requireTeamContext\(\)/);
  assert.match(collection, /consumePressAgentRagDebuggerQuota/);
  assert.match(collection, /executePressAgentRagDebuggerRun/);
  assert.match(collection, /await executePressAgentRagDebuggerRun/);
  assert.match(collection, /text\/event-stream/);
  assert.match(collection, /X-Accel-Buffering/);
  assert.match(collection, /maxDuration = 150/);
  assert.match(`${collection}\n${item}`, /Cache-Control[^\n]*no-store/);
  assert.doesNotMatch(`${collection}\n${item}`, /@\/lib\/prisma|startPressAgentRun|verifyAndIncrementQuota/);
  assert.match(existing, /NextResponse\.json\(\{ ok: true, run: runRecord \}, \{ status: 201 \}\)/);
});
