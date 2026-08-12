import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function cssVariable(source: string, name: string) {
  const match = source.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  assert.ok(match, `${name} must be defined explicitly`);
  return match[1];
}

test("the production layout has no Google or generated font-module dependency", () => {
  const layout = read("app/layout.tsx");

  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.doesNotMatch(layout, /\bGeist(?:_Mono)?\b/);
  assert.doesNotMatch(layout, /<body[^>]*className=\{`[^`]*\.variable/);
  assert.match(layout, /<body\s+className=["']antialiased["']>/);
});

test("legacy Geist variables resolve to usable offline fallback stacks", () => {
  const css = read("app/globals.css");
  const sans = cssVariable(css, "--font-geist-sans");
  const mono = cssVariable(css, "--font-geist-mono");

  assert.match(css, /--font-sans:\s*var\(--font-geist-sans\);/);
  assert.match(css, /--font-mono:\s*var\(--font-geist-mono\);/);
  assert.match(css, /font-family:\s*var\(--font-geist-sans\);/);

  assert.match(sans, /(?:system-ui|ui-sans-serif|Segoe UI|Arial)/i);
  assert.match(sans, /sans-serif/i);
  assert.match(sans, /,/);

  assert.match(mono, /(?:ui-monospace|SFMono|Menlo|Monaco|Consolas)/i);
  assert.match(mono, /monospace/i);
  assert.match(mono, /,/);
});
