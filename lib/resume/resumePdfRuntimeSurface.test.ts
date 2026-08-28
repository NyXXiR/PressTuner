import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectFile = (relativePath: string) => path.resolve(process.cwd(), relativePath);
const source = (relativePath: string) => readFile(projectFile(relativePath), "utf8");

test("authenticated Node route stays thin and returns the exact PDF byte metadata", async () => {
  const route = await source("app/api/resume/documents/pdf/route.ts");
  assert.match(route, /runtime = "nodejs"/u);
  assert.match(route, /requireTeamContext\(\)/u);
  assert.match(route, /resumePdfRequestSchema\.safeParse/u);
  assert.match(route, /generateResumePdf\(parsed\.data\.snapshot\)/u);
  for (const header of ["Content-Type", "Content-Disposition", "Content-Length", "X-Resume-Pdf-Page-Count", "Cache-Control", "X-Content-Type-Options"]) {
    assert.match(route, new RegExp(header));
  }
  assert.doesNotMatch(route, /prisma|quota/iu);
});

test("browser graph requests one Blob resource and never imports the server renderer or fonts", async () => {
  const [builder, dialog, client] = await Promise.all([
    source("components/resume/ResumeDocumentBuilder.tsx"),
    source("components/resume/ResumePdfPreviewDialog.tsx"),
    source("lib/resume/resumePdfPreview.client.ts"),
  ]);
  const browserGraph = `${builder}\n${dialog}\n${client}`;
  assert.doesNotMatch(browserGraph, /@react-pdf\/renderer|NanumGothic/u);
  assert.match(client, /fetch\("\/api\/resume\/documents\/pdf"/u);
  assert.match(client, /response\.blob\(\)/u);
  assert.equal((client.match(/URL\.createObjectURL/g) ?? []).length, 1);
  assert.match(client, /URL\.revokeObjectURL/u);
  assert.match(dialog, /<iframe src=\{resource\.url\}/u);
  assert.match(dialog, /<a download=\{resource\.filename\} href=\{resource\.url\}/u);
});

test("browser builder passes its typed PDF snapshot directly without runtime schema parsing", async () => {
  const builder = await source("components/resume/ResumeDocumentBuilder.tsx");

  assert.doesNotMatch(builder, /resumePdfSnapshotSchema/u);
  assert.match(builder, /const snapshot: ResumePdfSnapshot = \{/u);
  assert.match(builder, /setPdfSnapshot\(snapshot\)/u);
});

test("PDF pagination keeps keyword chips atomic and only protects a short item opening", async () => {
  const document = await source("components/resume/ResumePdfDocument.tsx");
  assert.match(document, /<Text key=\{`\$\{item\}-\$\{index\}`\} style=\{styles\.tag\} wrap=\{false\}>/u);
  assert.match(document, /minPresenceAhead=\{TAG_GROUP_OPENING_PRESENCE_POINTS\}/u);
  assert.match(document, /ITEM_UNBREAKABLE_BODY_UNITS/u);
  assert.doesNotMatch(document, /item\.body\.length <= 700/u);
});

test("resume surface has no browser pagination or native-print infrastructure", async () => {
  const files = [
    "components/resume/ResumeDocumentBuilder.tsx",
    "components/resume/ResumeEditorDocument.tsx",
    "components/resume/ResumePdfPreviewDialog.tsx",
    "lib/resume/resumePdfPreview.client.ts",
    "app/layout.tsx",
    "package.json",
  ];
  const combined = (await Promise.all(files.map(source))).join("\n");
  const forbidden = [
    ["paged", "js"].join(""),
    ["Paged", "Module"].join(""),
    ["resume", "Print", "Lifecycle"].join(""),
    ["before", "print"].join(""),
    ["after", "print"].join(""),
    ["window", ".", "print"].join(""),
    ["resume-pdf-", "pagination-stage"].join(""),
  ];
  for (const token of forbidden) assert.ok(!combined.includes(token), `obsolete resume runtime token remains: ${token}`);

  for (const removed of [
    "public/vendor/paged.min.js",
    "public/styles/resume-print.css",
    ["scripts/prepare-", "paged", "js-runtime.mjs"].join(""),
    "lib/resume/pagedPreviewer.client.ts",
    ["components/resume/resume", "Print", "Lifecycle.ts"].join(""),
  ]) await assert.rejects(access(projectFile(removed)));
});
