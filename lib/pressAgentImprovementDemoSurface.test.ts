import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public improvement demo is deterministic and exposes no mutation boundary", () => {
  const page = readFileSync("app/demo/agent-improvement/page.tsx", "utf8");
  const component = readFileSync("components/demo/PressAgentImprovementDemo.tsx", "utf8");
  assert.match(page, /executor: "deterministic"/);
  assert.doesNotMatch(page + component, /fetch\(|POST\(|PUT\(|DELETE\(|upload|persist/i);
  assert.match(component, /deployment remains unauthorized/i);
  assert.match(component, /Inspect regression gates/);
  assert.match(component, /human review/);
  assert.match(page, /NODE_ENV === "production"/);
  assert.match(page, /startsWith\("https:\/\/"\)/);
  assert.match(component, /public Ops Console URL is not configured/);
});
