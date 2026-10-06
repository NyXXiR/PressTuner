import assert from "node:assert/strict";
import { Script } from "node:vm";
import test from "node:test";
import { reviewHtml } from "./evaluation-html";

test("blind review renders readable evidence and downloads only explicitly entered human labels", async () => {
  const packet = { version: "press-eval-human-review/v1" as const, datasetHash: "a".repeat(64), artifactHash: "b".repeat(64), reviewer: null,
    entries: [{ reviewId: "c".repeat(64), outputHash: "d".repeat(64), request: "요청", facts: [{ id: "launch", content: "출시 근거" }],
      requiredFactIds: ["launch"], requestedStyle: "존댓말", styleExamples: "참고", draft: "검토할 초안\n</script><script>alert(1)</script>",
      labels: [{ criterion: "FACTUAL_SUPPORT" as const, judgment: null, reason: "" }] }] };
  const html = reviewHtml(packet);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  assert.doesNotThrow(() => new Script(script));
  const body = html.slice(0, html.indexOf("<script>"));
  assert.match(body, /검토할 초안/);
  assert.match(body, /출시 근거/);
  assert.match(body, /<select/);
  assert.ok(!body.includes("<script>alert"));
  const fields: Record<string, { value?: string; checked?: boolean; textContent?: string; onclick?: () => void }> = {
    reviewer: { value: "" }, attest: { checked: false }, download: {}, status: {},
    "judgment-0-0": { value: "FAIL" }, "reason-0-0": { value: "Test-only reviewer finding" },
  };
  const downloads: Blob[] = [];
  new Script(script).runInNewContext({
    document: { getElementById: (id: string) => fields[id], createElement: () => ({ click() {} }) },
    Blob, URL: { createObjectURL: (blob: Blob) => { downloads.push(blob); return "blob:test"; }, revokeObjectURL() {} },
    setTimeout: (fn: () => void) => fn(),
  });
  fields.download.onclick!();
  assert.equal(downloads.length, 0);
  fields.reviewer.value = "unit-test-only"; fields.attest.checked = true;
  fields.download.onclick!();
  const downloaded = downloads.at(-1);
  assert.ok(downloaded);
  const saved = JSON.parse(await downloaded.text());
  assert.equal(saved.entries[0].labels[0].judgment, "FAIL");
  assert.equal(saved.entries[0].draft, packet.entries[0].draft);
  assert.equal(saved.artifactHash, packet.artifactHash);
});
