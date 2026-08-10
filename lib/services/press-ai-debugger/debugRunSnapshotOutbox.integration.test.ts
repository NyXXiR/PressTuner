import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import test from "node:test";

test("checkpoint mutations enqueue snapshots transactionally and flush only after commit", () => {
  const checkpoint = readFileSync("lib/services/press-ai-debugger/checkpointDebuggerService.ts", "utf8"); const retry = readFileSync("lib/services/press-ai-debugger/retryService.ts", "utf8"); const outbox = readFileSync("lib/services/press-ai-debugger/debugRunSnapshotOutbox.ts", "utf8");
  assert.match(checkpoint, /await enqueueDebugRunSnapshot\(tx, args\.input\.commandId\)/);
  assert.match(checkpoint, /await enqueueDebugRunSnapshot\(tx, attempt\.id\)/);
  assert.match(checkpoint, /await enqueueDebugRunSnapshot\(tx, args\.attemptId\)/);
  assert.match(retry, /enqueueDebugRunSnapshot\(tx, parent\.id\)[\s\S]*enqueueDebugRunSnapshot\(tx, created\.id\)/);
  assert.match(outbox, /attemptId_contentHash/); assert.match(outbox, /snapshotRevision: \(latest\?\.snapshotRevision \?\? 0\) \+ 1/); assert.match(outbox, /catch \{ \/\* fail-open/);
});
