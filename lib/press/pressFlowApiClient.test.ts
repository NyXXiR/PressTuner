import assert from "node:assert/strict";
import test from "node:test";

import {
  createPressFlowApiClient,
  PressFlowApiError,
  type PressFlowExchange,
} from "./pressFlowApiClient";

type RecordedRequest = { input: RequestInfo | URL; init?: RequestInit };

function harness(response: unknown = { ok: true }) {
  const requests: RecordedRequest[] = [];
  const exchanges: PressFlowExchange[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ input, init });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = createPressFlowApiClient({
    fetch: fetchImpl,
    now: () => new Date("2026-07-28T01:02:03.000Z"),
    onExchange: (exchange) => exchanges.push(exchange),
  });
  return { client, requests, exchanges };
}

function bodyOf(request: RecordedRequest) {
  return JSON.parse(String(request.init?.body));
}

test("all operations preserve the existing article route contracts", async () => {
  const { client, requests, exchanges } = harness({
    ok: true,
    id: "article/one",
    articleId: "article/one",
  });

  await client.initializeArticle({ type: "PRESS_RELEASE" });
  await client.normalizeBrief("article/one", {
    rawText: "sample",
    tone: "formal",
    quotaMode: "simplified",
  });
  await client.generateArticle("article/one", {
    announceType: "신제품 출시",
    points: ["first"],
    tone: "formal",
  });
  await client.readGrounding("article/one");
  await client.decideGroundingCandidate(
    "article/one",
    "candidate/one",
    "ACCEPTED",
  );
  await client.readVerification("article/one", "team & one");
  await client.runVerification("article/one", { teamId: "team & one" });
  await client.updateStatus("article/one", {
    status: "FINAL",
    teamId: "team & one",
  });

  assert.deepEqual(
    requests.map(({ input, init }) => ({
      path: String(input),
      method: init?.method ?? "GET",
      headers: init?.headers,
      credentials: init?.credentials,
      cache: init?.cache,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })),
    [
      {
        path: "/api/articles/init",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: undefined,
        cache: undefined,
        body: { type: "PRESS_RELEASE" },
      },
      {
        path: "/api/articles/article%2Fone/brief/normalize",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: undefined,
        cache: undefined,
        body: { rawText: "sample", tone: "formal", quotaMode: "simplified" },
      },
      {
        path: "/api/articles/article%2Fone/generate",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: undefined,
        cache: undefined,
        body: {
          announceType: "신제품 출시",
          points: ["first"],
          tone: "formal",
        },
      },
      {
        path: "/api/articles/article%2Fone/grounding",
        method: "GET",
        headers: undefined,
        credentials: undefined,
        cache: "no-store",
        body: undefined,
      },
      {
        path:
          "/api/articles/article%2Fone/grounding/candidates/candidate%2Fone",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: undefined,
        cache: undefined,
        body: { decision: "ACCEPTED" },
      },
      {
        path: "/api/articles/article%2Fone/verification?teamId=team+%26+one",
        method: "GET",
        headers: undefined,
        credentials: undefined,
        cache: "no-store",
        body: undefined,
      },
      {
        path: "/api/articles/article%2Fone/verification",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: undefined,
        cache: undefined,
        body: { teamId: "team & one" },
      },
      {
        path: "/api/articles/article%2Fone/status",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: undefined,
        cache: undefined,
        body: { status: "FINAL", teamId: "team & one" },
      },
    ],
  );
  assert.equal(exchanges.length, 8);
  assert.deepEqual(exchanges[0], {
    method: "POST",
    path: "/api/articles/init",
    request: { type: "PRESS_RELEASE" },
    response: {
      ok: true,
      id: "article/one",
      articleId: "article/one",
    },
    timestamp: "2026-07-28T01:02:03.000Z",
    status: 200,
  });
  assert.deepEqual(bodyOf(requests[0]), { type: "PRESS_RELEASE" });
});

test("sanitizes credential-like keys recursively before observing", async () => {
  const { client, exchanges } = harness({
    ok: true,
    id: "a1",
    nested: { authorization: "Bearer x", cookieJar: "sid=x" },
  });
  await client.initializeArticle({
    type: "PRESS_RELEASE",
    metadata: {
      token: "token-value",
      safe: [{ password: "password-value", title: "kept" }],
    },
  });

  assert.deepEqual(exchanges[0].request, {
    type: "PRESS_RELEASE",
    metadata: {
      token: "[REDACTED]",
      safe: [{ password: "[REDACTED]", title: "kept" }],
    },
  });
  assert.deepEqual(exchanges[0].response, {
    ok: true,
    id: "a1",
    nested: {
      authorization: "[REDACTED]",
      cookieJar: "[REDACTED]",
    },
  });
});

test("traces non-2xx responses before throwing a typed error", async () => {
  const exchanges: PressFlowExchange[] = [];
  const client = createPressFlowApiClient({
    fetch: async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: "SIMPLIFIED_PRESS_QUOTA_LIMIT",
          message: "limit",
        }),
        { status: 403 },
      ),
    onExchange: (exchange) => exchanges.push(exchange),
  });

  await assert.rejects(
    client.normalizeBrief("a1", { rawText: "sample", tone: "formal" }),
    (error: unknown) => {
      assert.ok(error instanceof PressFlowApiError);
      assert.equal(error.status, 403);
      assert.equal(error.code, "SIMPLIFIED_PRESS_QUOTA_LIMIT");
      assert.equal(error.exchange, exchanges[0]);
      return true;
    },
  );
  assert.equal(exchanges.length, 1);
  assert.equal(exchanges[0].status, 403);
});

test("network failures have null status and a safe observed response", async () => {
  const exchanges: PressFlowExchange[] = [];
  const client = createPressFlowApiClient({
    fetch: async () => {
      throw new TypeError("fetch failed for https://secret.invalid/?token=x");
    },
    onExchange: (exchange) => exchanges.push(exchange),
  });

  await assert.rejects(client.readGrounding("a1"), (error: unknown) => {
    assert.ok(error instanceof PressFlowApiError);
    assert.equal(error.status, null);
    assert.equal(error.code, "NETWORK_ERROR");
    return true;
  });
  assert.deepEqual(exchanges[0].response, {
    error: "NETWORK_ERROR",
    message: "Network request failed",
  });
  assert.equal(exchanges[0].status, null);
});

test("initialization validates the required article id after tracing", async () => {
  const exchanges: PressFlowExchange[] = [];
  const client = createPressFlowApiClient({
    fetch: async () => new Response(JSON.stringify({ ok: true })),
    onExchange: (exchange) => exchanges.push(exchange),
  });

  await assert.rejects(
    client.initializeArticle({ type: "PRESS_RELEASE" }),
    (error: unknown) => {
      assert.ok(error instanceof PressFlowApiError);
      assert.equal(error.code, "ARTICLE_ID_MISSING");
      assert.equal(error.exchange, exchanges[0]);
      return true;
    },
  );
});
