import assert from "node:assert/strict";
import { resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";
import { chromium } from "playwright";

import ga4RequestProof from "../lib/analytics/ga4OperationRequestProof.ts";
import vendorMetadataContract from "../domain/ai-process-console/v1/vendorMetadataContract.ts";

const { parseGa4OperationCollectRequest } = ga4RequestProof;
const { aggregationMetadataRegistry } = vendorMetadataContract;
const operationMetadataKey = aggregationMetadataRegistry.operationId.posthog.key;
const projectMetadataKey = aggregationMetadataRegistry.projectId.posthog.key;
const environmentMetadataKey = aggregationMetadataRegistry.environment.posthog.key;
const serviceMetadataKey = aggregationMetadataRegistry.serviceName.posthog.key;
assert.ok(operationMetadataKey, "AI Process Console PostHog operation key is missing");
assert.ok(projectMetadataKey, "AI Process Console PostHog project key is missing");
assert.ok(environmentMetadataKey, "AI Process Console PostHog environment key is missing");
assert.ok(serviceMetadataKey, "AI Process Console PostHog service key is missing");

loadDotEnv({ path: resolve(process.cwd(), ".env"), override: true });
loadDotEnv({ path: resolve(process.cwd(), ".env.production"), override: false });

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = option(
  "--base-url",
  process.env.NEXT_PUBLIC_APP_URL ?? "https://briefflow.meerkathq.com",
).replace(/\/$/, "");
const qaSecret = process.env.AI_QA_AUTH_SECRET?.trim();
assert.ok(qaSecret, "AI_QA_AUTH_SECRET is required");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PSEUDONYMOUS_OPERATION_PATTERN = /^hmac-sha256:[a-f0-9]{64}$/;
const prompt =
  "내부 근거 문서에서 'QA-OPS-20260805' 항목을 찾아 한 문장으로 요약해줘. 자료가 없으면 추측하지 말고 근거 부족으로 답변을 중단해줘.";
const proofStartedAt = new Date(Date.now() - 60_000).toISOString();

async function json(response, expectedStatus, label) {
  const body = await response.json().catch(() => null);
  assert.equal(response.status(), expectedStatus, `${label} returned ${response.status()}`);
  assert.ok(body && typeof body === "object", `${label} returned no JSON object`);
  return body;
}

const issueResponse = await fetch(`${baseUrl}/api/auth/qa/issue`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${qaSecret}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ next: "/press/new" }),
});
const issueBody = await issueResponse.json().catch(() => null);
assert.equal(issueResponse.status, 201, `QA auth issue returned ${issueResponse.status}`);
assert.ok(issueBody?.loginUrl, "QA auth issue returned no login URL");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const analyticsRequestCounts = { posthog: 0, ga4: 0 };
  const analyticsResponses = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("posthog.com")) {
      analyticsRequestCounts.posthog += 1;
    }
    if (
      url.includes("google-analytics.com/g/collect") ||
      url.includes("analytics.google.com/g/collect")
    ) {
      analyticsRequestCounts.ga4 += 1;
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.hostname.includes("posthog.com")) {
      analyticsResponses.push({
        provider: "posthog",
        status: response.status(),
        path: url.pathname,
      });
    }
    if (
      url.hostname.includes("google-analytics.com") ||
      url.hostname.includes("analytics.google.com")
    ) {
      const request = response.request();
      analyticsResponses.push({
        provider: "ga4",
        status: response.status(),
        path: url.pathname,
        operationEvent: parseGa4OperationCollectRequest(
          request.url(),
          request.postData(),
        ),
      });
    }
  });

  const loginResponse = await page.goto(issueBody.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  assert.equal(loginResponse?.status(), 200, "QA login redemption failed");

  const initResult = await page.evaluate(async () => {
    const response = await fetch("/api/articles/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "PRESS_RELEASE" }),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  });
  assert.equal(initResult.status, 200, `article initialization returned ${initResult.status}`);
  const init = initResult.body;
  assert.ok(init && typeof init === "object", "article initialization returned no JSON object");
  const articleId = init.articleId ?? init.id;
  assert.ok(typeof articleId === "string" && articleId, "article initialization returned no ID");

  await page.goto(`${baseUrl}/press/${encodeURIComponent(articleId)}/edit`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  const composer = page.getByPlaceholder(
    "예: 원고를 먼저 분석하고, 광고성 표현은 줄여서 다시 다듬어줘",
  );
  await composer.waitFor({ state: "visible", timeout: 30_000 });

  await page.waitForFunction(
    () =>
      typeof window.posthog?.capture === "function" &&
      !window.posthog?.toString?.().includes("(stub)") &&
      typeof window.gtag === "function",
    undefined,
    { timeout: 30_000 },
  );
  await page.evaluate(({ canonicalOperationKey, canonicalProjectKey, canonicalEnvironmentKey, canonicalServiceKey }) => {
    const calls = { posthog: [], ga4: [] };
    Object.defineProperty(window, "__aiOperationAnalyticsProof", {
      configurable: true,
      value: calls,
    });

    const posthog = window.posthog;
    const capture = posthog?.capture?.bind(posthog);
    if (posthog && capture) {
      posthog.capture = (eventName, properties) => {
        if (eventName === "ai_operation_outcome") {
          calls.posthog.push({
            operationId: properties?.[canonicalOperationKey],
            outcome: properties?.outcome,
            projectId: properties?.[canonicalProjectKey],
            environment: properties?.[canonicalEnvironmentKey],
            serviceName: properties?.[canonicalServiceKey],
          });
        }
        capture(eventName, properties);
      };
    }

    const gtag = window.gtag?.bind(window);
    if (gtag) {
      window.gtag = (...args) => {
        if (args[0] === "event" && args[1] === "presstuner_ai_operation_business") {
          const properties = args[2];
          calls.ga4.push({
            operationId: properties?.[canonicalOperationKey],
            outcome: properties?.outcome,
          });
        }
        gtag(...args);
      };
    }
  }, {
    canonicalOperationKey: operationMetadataKey,
    canonicalProjectKey: projectMetadataKey,
    canonicalEnvironmentKey: environmentMetadataKey,
    canonicalServiceKey: serviceMetadataKey,
  });
  const analyticsBaseline = { ...analyticsRequestCounts };
  const analyticsResponseBaseline = analyticsResponses.length;

  await composer.fill(prompt);
  const [runResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/press/agent/runs",
      { timeout: 180_000 },
    ),
    composer.press("Enter"),
  ]);
  const runBody = await json(runResponse, 201, "Press Agent run");
  const run = runBody.run;
  assert.equal(runBody.ok, true, "Press Agent response was not successful");
  assert.ok(UUID_PATTERN.test(run?.operationId ?? ""), "Press Agent returned no service operation ID");
  assert.ok(PSEUDONYMOUS_OPERATION_PATTERN.test(run?.vendorOperationId ?? ""), "Press Agent returned no projected vendor operation ID");
  assert.equal(run?.vendorProjectId, "presstuner", "Press Agent returned the wrong projected project ID");
  assert.equal(run?.vendorEnvironment, "production", "Press Agent returned the wrong projected environment");
  assert.equal(run?.vendorServiceName, "presstuner", "Press Agent returned the wrong projected service name");
  assert.ok(
    run.status === "COMPLETED" || run.status === "FAILED",
    `Press Agent did not reach a terminal state: ${run.status ?? "unknown"}`,
  );

  await page.waitForFunction(
    ({ operationId }) => {
      const storage = window.sessionStorage;
      return ["accepted", "abandoned"].some((outcome) =>
        storage.getItem(`presstuner:ai-operation-outcome:${operationId}:${outcome}`),
      );
    },
    { operationId: run.vendorOperationId },
    { timeout: 15_000 },
  );
  await page.waitForTimeout(10_000);

  const providerRequests = {
    posthog: analyticsRequestCounts.posthog - analyticsBaseline.posthog,
    ga4: analyticsRequestCounts.ga4 - analyticsBaseline.ga4,
  };
  const postTerminalResponses = analyticsResponses.slice(analyticsResponseBaseline);
  const analyticsCalls = await page.evaluate(() => window.__aiOperationAnalyticsProof);
  const expectedOutcome = run.status === "COMPLETED" ? "accepted" : "abandoned";
  assert.ok(
    analyticsCalls.posthog.some(
      (call) =>
        call.operationId === run.vendorOperationId &&
        call.outcome === expectedOutcome &&
        call.projectId === run.vendorProjectId &&
        call.environment === run.vendorEnvironment &&
        call.serviceName === run.vendorServiceName,
    ),
    "the loaded PostHog SDK did not receive the exact operation outcome",
  );
  assert.ok(
    providerRequests.posthog > 0,
    "no PostHog provider request was observed after the terminal operation",
  );
  assert.ok(
    postTerminalResponses.some(
      (response) =>
        response.provider === "posthog" &&
        response.status >= 200 &&
        response.status < 300,
    ),
    "PostHog did not return a successful provider response",
  );
  if (run.status === "COMPLETED") {
    assert.ok(
      analyticsCalls.ga4.some(
        (call) =>
          call.operationId === run.vendorOperationId && call.outcome === "conversion",
      ),
      "the loaded GA4 SDK did not receive the exact completed operation outcome",
    );
    const exactGa4Responses = postTerminalResponses.filter(
      (response) =>
        response.provider === "ga4" &&
        response.operationEvent?.operationId === run.vendorOperationId &&
        response.operationEvent?.outcome === "conversion",
    );
    assert.ok(
      exactGa4Responses.length > 0,
      "no exact GA4 operation event request was observed after completion",
    );
    assert.ok(
      exactGa4Responses.some(
        (response) => response.status >= 200 && response.status < 300,
      ),
      "the exact GA4 operation event did not return a successful provider response",
    );
  }

  console.log(JSON.stringify({
    status: "verified_browser_emission",
    operationId: run.vendorOperationId,
    processId: "rag-query",
    processVersion: "1.0.0",
    terminalStatus: run.status,
    outcomeMarker: expectedOutcome,
    windowStart: proofStartedAt,
    windowEnd: new Date(Date.now() + 60_000).toISOString(),
    analytics: {
      posthog: {
        providerRequestCount: providerRequests.posthog,
        successfulResponse: true,
      },
      ga4: {
        providerRequestCount:
          run.status === "COMPLETED"
            ? postTerminalResponses.filter(
                (response) =>
                  response.provider === "ga4" &&
                  response.operationEvent?.operationId === run.vendorOperationId,
              ).length
            : "not_applicable",
        successfulResponse: run.status === "COMPLETED" ? true : "not_applicable",
      },
    },
  }, null, 2));
} finally {
  await browser.close();
}
