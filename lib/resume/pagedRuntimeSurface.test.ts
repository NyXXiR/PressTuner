import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectFile = (relativePath: string) => path.resolve(process.cwd(), relativePath);

test("resume preview keeps Paged.js outside the Turbopack client module graph", async () => {
  const adapter = await readFile(projectFile("lib/resume/pagedPreviewer.client.ts"), "utf8");

  assert.doesNotMatch(adapter, /import\(["']pagedjs["']\)/u);
  assert.match(adapter, /\/vendor\/paged\.min\.js/u);
  assert.match(adapter, /document\.createElement\(["']script["']\)/u);
  assert.match(adapter, /window\.PagedModule/u);
  assert.match(adapter, /document\.body\.appendChild\(stage\)/u);
  assert.match(adapter, /preview\(source, \["\/styles\/resume-print\.css"\], stage\)/u);
  assert.match(adapter, /output\.replaceChildren\(\.\.\.Array\.from\(stage\.childNodes\)\)/u);
  assert.match(adapter, /removeListeners/u);
});

test("npm lifecycles prepare the self-contained same-origin Paged.js runtime", async () => {
  const [packageSource, prepareScript, gitignore] = await Promise.all([
    readFile(projectFile("package.json"), "utf8"),
    readFile(projectFile("scripts/prepare-pagedjs-runtime.mjs"), "utf8"),
    readFile(projectFile(".gitignore"), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource) as { scripts: Record<string, string> };

  assert.match(packageJson.scripts["prepare:pagedjs-runtime"], /prepare-pagedjs-runtime\.mjs/u);
  for (const lifecycle of ["predev", "prebuild", "prestart"] as const) {
    assert.match(packageJson.scripts[lifecycle], /prepare:pagedjs-runtime/u, `${lifecycle} must prepare the browser runtime`);
  }
  assert.match(prepareScript, /require\.resolve\(["']pagedjs["']\)[\s\S]*\.\.\/dist\/paged\.min\.js/u);
  assert.match(prepareScript, /public[\/]vendor[\/]paged\.min\.js/u);
  assert.match(gitignore, /^\/public\/vendor\/paged\.min\.js$/mu);
});

test("browser pagination regression serves the generated application runtime", async () => {
  const browserSpec = await readFile(projectFile("tests/browser/resumePagination.spec.tsx"), "utf8");

  assert.match(browserSpec, /public[\/]vendor[\/]paged\.min\.js/u);
  assert.doesNotMatch(browserSpec, /node_modules[\/]pagedjs[\/]dist[\/]paged\.js/u);
});
