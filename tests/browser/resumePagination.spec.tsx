import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { extractText } from "unpdf";
import { expect, test } from "playwright/test";

const execFileAsync = promisify(execFile);
const chromeSentinel = "EDITOR_CHROME_MUST_NOT_PRINT";
const dialogSentinel = "DIALOG_CHROME_MUST_NOT_PRINT";

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const { stdout: printable } = await execFileAsync(process.execPath, [
    "--import",
    "tsx",
    path.resolve("tests/fixtures/resumePaginationFixture.tsx"),
  ], { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
  const css = await readFile(path.resolve("public/styles/resume-print.css"), "utf8");
  const paged = await readFile(path.resolve("node_modules/pagedjs/dist/paged.js"), "utf8");
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles/resume-print.css"></head><body><button>${chromeSentinel}</button><div id="source">${printable}</div><div class="resume-pdf-dialog-root"><section class="resume-pdf-dialog-panel"><div class="resume-pdf-dialog-chrome">${dialogSentinel}<p id="ready-status"></p></div><div id="output" class="resume-pdf-output"></div></section></div><script src="/paged.js"></script><script>void (async()=>{const flow=await new Paged.Previewer().preview(document.querySelector('#source .resume-printable-document'),['/styles/resume-print.css'],document.querySelector('#output'));const pages=[...document.querySelectorAll('#output .pagedjs_page')];pages.forEach((page,index)=>{page.classList.add('resume-pdf-page');page.dataset.resumePageNumber=String(index+1);page.setAttribute('aria-label',String(index+1)+'페이지');});window.resumePreviewPages=pages;document.querySelector('#ready-status').textContent='정확히 '+pages.length+'페이지';document.body.classList.add('resume-pagination-ready');document.body.dataset.pageCount=String(flow.total);})();</script></body></html>`;
  server = createServer((request, response) => {
    if (request.url === "/styles/resume-print.css") { response.setHeader("content-type", "text/css"); response.end(css); return; }
    if (request.url === "/paged.js") { response.setHeader("content-type", "text/javascript"); response.end(paged); return; }
    response.setHeader("content-type", "text/html; charset=utf-8"); response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server did not bind");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("Paged.js preview preserves A4 geometry, safe boundaries, and PDF parity", async ({ page }) => {
  await page.goto(origin);
  await page.locator("body.resume-pagination-ready").waitFor();
  const pages = page.locator(".resume-pdf-page");
  const count = await pages.count();
  expect(count).toBeGreaterThan(1);
  await expect(page.locator("body.resume-pagination-ready")).toHaveAttribute("data-page-count", String(count));
  await expect(page.locator("#ready-status")).toHaveText(`정확히 ${count}페이지`);

  const geometry = await pages.evaluateAll((nodes) => nodes.map((node) => {
    const pageRect = node.getBoundingClientRect();
    const contentRect = node.querySelector(".pagedjs_page_content")!.getBoundingClientRect();
    return { pageWidth: pageRect.width, pageHeight: pageRect.height, contentWidth: contentRect.width, contentHeight: contentRect.height, left: contentRect.left - pageRect.left, top: contentRect.top - pageRect.top };
  }));
  const pxPerMm = 96 / 25.4;
  for (const box of geometry) {
    expect(Math.abs(box.pageWidth - 210 * pxPerMm)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.pageHeight - 297 * pxPerMm)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.contentWidth - 174 * pxPerMm)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.contentHeight - 265 * pxPerMm)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.left - 18 * pxPerMm)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.top - 16 * pxPerMm)).toBeLessThanOrEqual(1);
  }
  const clippedContent = await pages.evaluateAll((nodes) => nodes.flatMap((node) => {
    const contentRect = node.querySelector(".pagedjs_page_content")!.getBoundingClientRect();
    return Array.from(node.querySelectorAll<HTMLElement>("[data-resume-item-id], .resume-section-heading"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top < contentRect.top - 1 || rect.bottom > contentRect.bottom + 1;
      })
      .map((element) => element.dataset.resumeItemId ?? element.textContent?.trim() ?? "unknown");
  }));
  expect(clippedContent).toEqual([]);

  await expect(page.locator(".resume-pdf-output button, .resume-pdf-output input, .resume-pdf-output .resume-section-controls, .resume-pdf-output .resume-drag-handle")).toHaveCount(0);
  const itemOccurrences = await page.locator(".resume-pdf-page [data-resume-item-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-resume-item-id")));
  expect(itemOccurrences).toEqual(Array.from({ length: 12 }, (_, index) => `fixture-item-${index + 1}`));
  expect(new Set(itemOccurrences).size).toBe(itemOccurrences.length);
  const sectionPages = await pages.evaluateAll((nodes) => nodes.map((node, pageIndex) => ({
    pageIndex,
    longSectionHeading: Array.from(node.querySelectorAll("[data-resume-section-id='fixture-long-items'] .resume-section-heading"))
      .some((heading) => heading.textContent?.includes("긴 경력")),
    sections: Array.from(node.querySelectorAll("[data-resume-section-id]"), (section) => section.getAttribute("data-resume-section-id")),
    items: Array.from(node.querySelectorAll("[data-resume-item-id]"), (item) => item.getAttribute("data-resume-item-id")),
  })));
  const longSectionPages = sectionPages.filter((entry) => entry.sections.includes("fixture-long-items"));
  expect(longSectionPages.length).toBeGreaterThan(1);
  const headingPage = sectionPages.find((entry) => entry.longSectionHeading);
  expect(headingPage?.items).toContain("fixture-item-1");
  expect(sectionPages.filter((entry) => entry.sections.includes("fixture-short"))).toHaveLength(1);

  await page.evaluate(() => document.body.classList.add("resume-pdf-printing"));
  expect(await page.evaluate(() => {
    const previewPages = (window as typeof window & { resumePreviewPages: Element[] }).resumePreviewPages;
    return previewPages.every((node, index) => node === document.querySelectorAll(".resume-pdf-page")[index]);
  })).toBe(true);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const artifactDirectory = process.env.RESUME_PDF_ARTIFACT_DIR;
  if (artifactDirectory) {
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(path.join(artifactDirectory, "resume-pagination.pdf"), pdf);
    const pageLayout = await pages.evaluateAll((nodes) => nodes.map((node) => ({
      items: Array.from(node.querySelectorAll<HTMLElement>("[data-resume-item-id]"), (item) => ({
        id: item.dataset.resumeItemId,
        top: item.getBoundingClientRect().top - node.getBoundingClientRect().top,
      })),
      text: node.textContent?.trim(),
    })));
    await writeFile(path.join(artifactDirectory, "layout.json"), `${JSON.stringify(pageLayout, null, 2)}\n`);
    for (let index = 0; index < count; index += 1) {
      await pages.nth(index).screenshot({ path: path.join(artifactDirectory, `page-${index + 1}.png`) });
    }
  }
  const extracted = await extractText(new Uint8Array(pdf), { mergePages: false });
  expect(extracted.totalPages).toBe(count);
  const text = extracted.text.join("\n");
  expect(text).not.toContain(chromeSentinel);
  expect(text).not.toContain(dialogSentinel);
});
