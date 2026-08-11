import assert from "node:assert/strict";
import test from "node:test";

import { startPublicPressRagScenario } from "./services/demo/pressRagScenarioService";
import { PublicPressRagApiError, commandPublicPressRagScenarioClient, startPublicPressRagScenarioClient } from "./publicPressRagScenarioClient";

const secret = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";

test("client posts only public commands and validates successful responses", async () => {
  const scenario = startPublicPressRagScenario({ memo: "memo", tone: "formal" }, { secret, now: 1000, id: () => "run" }).scenario;
  const started = await startPublicPressRagScenarioClient({ memo: "memo", tone: "formal" }, async (url, init) => {
    assert.equal(url, "/api/demo/press-rag-scenario/start");
    assert.equal(init?.cache, "no-store");
    return new Response(JSON.stringify(scenario), { status: 201 });
  });
  assert.equal(started.runId, "run");
  await commandPublicPressRagScenarioClient(scenario, { type: "advance_edge" }, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual({ type: body.type, expectedRevision: body.expectedRevision }, { type: "advance_edge", expectedRevision: 0 });
    return new Response(JSON.stringify(scenario));
  });
});

test("client exposes retry-after and rejects malformed success payloads", async () => {
  await assert.rejects(
    () => startPublicPressRagScenarioClient({ memo: "memo", tone: "formal" }, async () => new Response(JSON.stringify({ code: "PRESS_RAG_START_QUOTA_EXHAUSTED" }), { status: 429, headers: { "Retry-After": "42" } })),
    (error: unknown) => error instanceof PublicPressRagApiError && error.retryAfterSeconds === 42,
  );
  await assert.rejects(() => startPublicPressRagScenarioClient({ memo: "memo", tone: "formal" }, async () => new Response("{}")));
});
