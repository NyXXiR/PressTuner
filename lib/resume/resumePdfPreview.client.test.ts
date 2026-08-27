import assert from "node:assert/strict";
import test from "node:test";

import type { ResumePdfSnapshot } from "@/domain/resume-documents/pdfSnapshot";
import { requestResumePdf } from "./resumePdfPreview.client";

const snapshot: ResumePdfSnapshot = {
  company: "브리프플로우",
  documentName: "홍길동/이력서",
  role: "제품 엔지니어",
  sections: [],
  relatedWorkItems: [],
};

function mockGlobals(response: Response | ((signal?: AbortSignal) => Promise<Response>)) {
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const created: Blob[] = [];
  const revoked: string[] = [];
  globalThis.fetch = (async (_input, init) => typeof response === "function"
    ? response(init?.signal ?? undefined)
    : response) as typeof fetch;
  URL.createObjectURL = ((blob: Blob) => {
    created.push(blob);
    return "blob:resume-pdf-1";
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => { revoked.push(url); }) as typeof URL.revokeObjectURL;
  return {
    created,
    revoked,
    restore() {
      globalThis.fetch = originalFetch;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    },
  };
}

test("one PDF Blob URL is shared by the returned resource and revoked once", async () => {
  const mock = mockGlobals(new Response(new Blob(["%PDF-1.7"], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=\"resume.pdf\"; filename*=UTF-8''%ED%99%8D%EA%B8%B8%EB%8F%99.pdf",
      "X-Resume-Pdf-Page-Count": "3",
    },
  }));
  try {
    const resource = await requestResumePdf(snapshot);
    assert.equal(resource.url, "blob:resume-pdf-1");
    assert.equal(resource.filename, "홍길동.pdf");
    assert.equal(resource.pageCount, 3);
    assert.equal(mock.created.length, 1);
    resource.dispose();
    resource.dispose();
    assert.deepEqual(mock.revoked, ["blob:resume-pdf-1"]);
  } finally {
    mock.restore();
  }
});

test("client rejects server errors, non-PDF responses, and malformed page counts before allocating URLs", async () => {
  const cases = [
    new Response(JSON.stringify({ error: { message: "로그인이 필요합니다." } }), { status: 401, headers: { "Content-Type": "application/json" } }),
    new Response("ok", { headers: { "Content-Type": "text/plain", "X-Resume-Pdf-Page-Count": "1" } }),
    new Response("%PDF-", { headers: { "Content-Type": "application/pdf", "X-Resume-Pdf-Page-Count": "1.5" } }),
  ];
  for (const response of cases) {
    const mock = mockGlobals(response);
    try {
      await assert.rejects(requestResumePdf(snapshot));
      assert.equal(mock.created.length, 0);
    } finally {
      mock.restore();
    }
  }
});

test("abort is propagated without retaining an object URL", async () => {
  const controller = new AbortController();
  const mock = mockGlobals(async (signal) => new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }));
  try {
    const pending = requestResumePdf(snapshot, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
    assert.deepEqual(mock.revoked, []);
  } finally {
    mock.restore();
  }
});

test("an abort racing after object URL creation revokes the late URL immediately", async () => {
  const controller = new AbortController();
  const mock = mockGlobals(new Response("%PDF-1.7", {
    headers: { "Content-Type": "application/pdf", "X-Resume-Pdf-Page-Count": "1" },
  }));
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = ((blob: Blob) => {
    const url = originalCreate(blob);
    controller.abort();
    return url;
  }) as typeof URL.createObjectURL;
  try {
    await assert.rejects(requestResumePdf(snapshot, { signal: controller.signal }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
    assert.deepEqual(mock.revoked, ["blob:resume-pdf-1"]);
  } finally {
    mock.restore();
  }
});
