import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(
  "lib/services/press-agent/pressAgentRuntime.ts",
  "utf8",
);
const panel = readFileSync("components/press/PressAssistantBar.tsx", "utf8");
const startRoute = readFileSync(
  "app/api/press/agent/runs/route.ts",
  "utf8",
);

test("Press Agent execution is server-owned and persists resumable SDK state", () => {
  assert.match(runtime, /new Agent<PressAgentContext/);
  assert.match(runtime, /needsApproval:\s*true/);
  assert.match(runtime, /result\.state\.toString\(\)/);
  assert.match(runtime, /RunState\.fromString/);
  assert.match(runtime, /prisma\.agentRun\.update/);
  assert.match(runtime, /withTrace/);
  assert.match(runtime, /const traceId = generateCanonicalTraceId\(\)/);
  assert.match(runtime, /traceLangSmithOperation\(\{[\s\S]*?traceId,/);
  assert.match(runtime, /estimatedCostMicros/);
  assert.match(runtime, /kind:\s*"MODEL"/);
  assert.match(runtime, /retryCount:\s*run\.retryCount/);
  assert.match(startRoute, /startPressAgentRun/);
});

test("the press assistant uses the Agent run and approval APIs", () => {
  assert.match(panel, /\/api\/press\/agent\/runs/);
  assert.match(panel, /approvals\/\$\{approvalId\}/);
  assert.doesNotMatch(panel, /fetch\("\/api\/press\/command\/plan"/);
  assert.match(panel, /\/retry/);
  assert.match(panel, /다시 시도/);
  assert.match(panel, /\/feedback/);
  assert.match(panel, /aria-pressed/);
  assert.match(panel, /role=\{agentStatus\.kind === "error" \? "alert" : "status"\}/);
  assert.doesNotMatch(panel, /<p className="sr-only" aria-live="polite">\{agentStatus\}<\/p>/);
  assert.match(panel, /#page=\$\{citation\.pageStart\}/);
  assert.match(panel, /target="_blank"/);
  assert.match(runtime, /canRetry/);
  assert.match(runtime, /feedback:/);
  assert.match(panel, /emitAiOperationOutcome/);
  assert.match(panel, /operationId\?: string \| null/);
  assert.match(runtime, /operationId: readPressAgentOperationId/);
});
