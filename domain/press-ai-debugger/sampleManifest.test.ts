import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { PRESS_AI_SAMPLE_ASSETS, PRESS_AI_SAMPLE_SCENARIOS } from "./sampleManifest";

test("sample manifest covers the five required scenarios without duplicate identities", () => {
  assert.deepEqual(PRESS_AI_SAMPLE_SCENARIOS.map((scenario) => scenario.coverage), ["basic-multipage", "fact-vs-style", "old-new-conflict", "missing-evidence", "hostile-instructions"]);
  for (const values of [PRESS_AI_SAMPLE_SCENARIOS.map((item) => item.id), PRESS_AI_SAMPLE_ASSETS.map((item) => item.id), PRESS_AI_SAMPLE_ASSETS.map((item) => item.path), PRESS_AI_SAMPLE_ASSETS.map((item) => item.uploadFilename)]) assert.equal(new Set(values).size, values.length);
  assert.equal(PRESS_AI_SAMPLE_ASSETS.length, 7);
});

test("sample PDFs are safe bounded public assets with embedded evidence markers", async () => {
  for (const asset of PRESS_AI_SAMPLE_ASSETS) {
    assert.match(asset.path, /^\/samples\/press-ai-debugger\/[a-z0-9-]+\.pdf$/);
    const filename = path.join(process.cwd(), "public", asset.path);
    const bytes = await readFile(filename);
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert.ok((await stat(filename)).size < 250_000);
    const source = bytes.toString("latin1");
    for (const marker of asset.markers) assert.ok(source.includes(marker), `${asset.id} is missing ${marker}`);
    assert.doesNotMatch(source, /\/JavaScript|\/JS\b|\/EmbeddedFiles|\/AcroForm|\/URI\b|\/Launch\b/);
  }
});

test("sample PDF evidence markers are extractable", { skip: Boolean(process.env.NODE_TEST_CONTEXT) && process.env.PRESS_AI_PDF_EXTRACTION_TEST !== "1" }, async () => {
  const { extractText, getDocumentProxy } = await import("unpdf");
  for (const asset of PRESS_AI_SAMPLE_ASSETS) {
    const bytes = await readFile(path.join(process.cwd(), "public", asset.path));
    const pdf = await getDocumentProxy(new Uint8Array(bytes), { disableWorker: true } as never);
    const extracted = await extractText(pdf, { mergePages: true });
    for (const marker of asset.markers) assert.ok(extracted.text.includes(marker), `${asset.id} cannot extract ${marker}`);
    if (asset.id === "basic-multipage-facts-pdf") assert.equal(extracted.totalPages, 3);
    await pdf.destroy();
  }
});
