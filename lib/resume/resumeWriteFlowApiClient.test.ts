import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  createResumeWriteFlowApiClient,
  FlowApiError,
  type ResumeWriteFlowExchange,
} from "./resumeWriteFlowApiClient";

type Recorded = { path: string; init?: RequestInit };

function responseFor(path: string, method = "GET") {
  if (path.endsWith("/intake/compose")) {
    return { ok: true, data: { companyName: "A", jobTitle: "PM", questions: [] } };
  }
  if (path.includes("/bricks?")) return { ok: true, items: [] };
  if (path === "/api/resume/applications" && method === "POST") {
    return { ok: true, id: "app-1", strategyStatus: "READY" };
  }
  if (path === "/api/resume/applications/app-1" && method === "GET") {
    return {
      ok: true,
      data: {
        questions: [
          {
            id: "q1",
            questionText: "Why this role?",
            charLimit: 700,
            aiAdvice: "Use evidence",
            relatedBricks: [],
          },
        ],
      },
    };
  }
  if (path.endsWith("/generate")) return { ok: true, text: "draft", grounding: null };
  if (path.endsWith("/repolish")) return { ok: true, text: "revision", grounding: null };
  if (path.endsWith("/grounding")) return { ok: true, grounding: null };
  if (path.endsWith("/verification") && method === "GET") {
    return { ok: true, freshness: "CURRENT", verification: null };
  }
  if (path.endsWith("/verification") && method === "POST") {
    return { ok: true, verification: { id: "v1", result: "PASS" } };
  }
  if (path.includes("/complete")) {
    return { ok: true, result: { capture: { kind: "none" }, verification: null } };
  }
  if (path.includes("/retry")) return { ok: true, capture: { kind: "none" } };
  if (path.includes("/verification/override")) {
    return { ok: true, result: { capture: { kind: "none" }, verification: null } };
  }
  if (path.includes("/writing-workspaces/")) {
    return {
      ok: true,
      workspace: {
        activeQuestionId: null,
        pendingCaptures: [],
        deferredCaptures: [],
        memoryReadiness: null,
        productivity: null,
      },
    };
  }
  if (path.includes("/questions/") && method === "PATCH") {
    return { ok: true, answerRevision: 2 };
  }
  return { ok: true };
}

test("maps intake, workspace, writing, audit, completion, and capture requests", async () => {
  const requests: Recorded[] = [];
  const exchanges: ResumeWriteFlowExchange[] = [];
  const client = createResumeWriteFlowApiClient({
    randomUUID: () => "request-1",
    fetch: async (input, init) => {
      const path = String(input);
      requests.push({ path, init });
      return new Response(
        JSON.stringify(responseFor(path, init?.method ?? "GET")),
      );
    },
    onExchange: (exchange) => exchanges.push(exchange),
  });

  await client.organizeIntake({ rawText: "posting", postingUrl: "" });
  await client.loadUserBricks();
  await client.startWorkspace({
    company: "A",
    job: "PM",
    brief: {
      summary: "s",
      deadline: null,
      employmentType: null,
      location: null,
      coreResponsibilities: [],
      requirements: [],
      preferredQualifications: [],
      keySignals: [],
      writingGuidance: [],
    },
    questions: [{ prompt: "q", charLimit: 700 }],
  });
  await client.writeGroundedCareerAnswer({
    questionId: "q1",
    instruction: "",
    charLimit: 700,
  });
  await client.saveQuestionAnswer({
    questionId: "q1",
    answer: "draft",
    isCompleted: false,
  });
  await client.readGrounding("q1");
  await client.readVerification("q1");
  await client.runVerification("q1");
  await client.completeQuestion({
    appId: "app-1",
    questionId: "q1",
    answer: "draft",
    expectedAnswerRevision: 2,
  });
  await client.retryDeferredCapture({
    appId: "app-1",
    taskId: "task-1",
    reopenApplication: false,
  });
  await client.resolveCapture({
    appId: "app-1",
    captureId: "capture-1",
    action: "dismiss",
    selectedPreviewIds: [],
  });
  await client.completeApplication("app-1");

  assert.equal(
    requests.every((request) => request.path.startsWith("/api/resume/")),
    true,
  );
  assert.equal(exchanges.length, requests.length);
  assert.deepEqual(
    JSON.parse(String(requests[2].init?.body)).clientRequestId,
    "request-1",
  );
  assert.equal(
    requests.some((request) => request.path.endsWith("/verification")),
    true,
  );
});

test("compound workspace start observes both exchanges in order", async () => {
  const exchanges: ResumeWriteFlowExchange[] = [];
  const client = createResumeWriteFlowApiClient({
    randomUUID: () => "request-1",
    fetch: async (input, init) =>
      new Response(
        JSON.stringify(responseFor(String(input), init?.method ?? "GET")),
      ),
    onExchange: (exchange) => exchanges.push(exchange),
  });
  const workspace = await client.startWorkspace({
    company: "A",
    job: "PM",
    brief: {
      summary: "",
      deadline: null,
      employmentType: null,
      location: null,
      coreResponsibilities: [],
      requirements: [],
      preferredQualifications: [],
      keySignals: [],
      writingGuidance: [],
    },
    questions: [],
  });
  assert.deepEqual(
    exchanges.map((exchange) => exchange.path),
    ["/api/resume/applications", "/api/resume/applications/app-1"],
  );
  assert.deepEqual(workspace.questions, [
    {
      id: "q1",
      prompt: "Why this role?",
      charLimit: 700,
      aiAdvice: "Use evidence",
      linkedBrickIds: [],
    },
  ]);
});

test("observations redact sensitive data and observer errors are harmless", async () => {
  const exchanges: ResumeWriteFlowExchange[] = [];
  const client = createResumeWriteFlowApiClient({
    fetch: async () =>
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            companyName: "A",
            jobTitle: "PM",
            questions: [],
            token: "secret",
          },
        }),
      ),
    onExchange: (exchange) => {
      exchanges.push(exchange);
      throw new Error("observer");
    },
  });
  await client.organizeIntake({ rawText: "posting", postingUrl: "" });
  assert.equal((exchanges[0].response as any).data.token, "[REDACTED]");
});

test("non-2xx and network errors remain inspectable", async () => {
  const http = createResumeWriteFlowApiClient({
    fetch: async () =>
      new Response(JSON.stringify({ ok: false, code: "NOPE", message: "no" }), {
        status: 422,
      }),
  });
  await assert.rejects(
    http.readGrounding("q1"),
    (error: unknown) => error instanceof FlowApiError && error.status === 422,
  );
  const network = createResumeWriteFlowApiClient({
    fetch: async () => {
      throw new Error("secret network detail");
    },
  });
  await assert.rejects(
    network.readGrounding("q1"),
    (error: unknown) =>
      error instanceof FlowApiError && error.code === "NETWORK_ERROR",
  );
});

test("shared client stays browser-safe", () => {
  const source = fs.readFileSync(
    new URL("./resumeWriteFlowApiClient.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /@prisma|lib\/services|zustand|process\.env|node:/,
  );
});
