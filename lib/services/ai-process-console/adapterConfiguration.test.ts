import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_PROCESS_CONSOLE_FACT_DESTINATION,
  loadAiProcessConsoleAdapterConfiguration,
  resolveAiProcessConsoleFactDestination,
  summarizeAiProcessConsoleAdapterConfiguration,
} from "./adapterConfiguration.server";

const strong = (character: string) => character.repeat(32);
const enabled = {
  AI_PROCESS_CONSOLE_ADAPTER_ENABLED: "true",
  AI_PROCESS_CONSOLE_DESTINATION_URL: "https://console.example.test/api/internal/v1/facts",
  AI_PROCESS_CONSOLE_INBOUND_HMAC_SECRET: strong("i"),
  AI_PROCESS_CONSOLE_OUTBOUND_HMAC_SECRET: strong("o"),
};

test("adapter is opt-in and disabled is a safe rollback state", () => {
  assert.deepEqual(loadAiProcessConsoleAdapterConfiguration({}, "production"), { status: "DISABLED", code: "DISABLED" });
  assert.deepEqual(loadAiProcessConsoleAdapterConfiguration({ AI_PROCESS_CONSOLE_ADAPTER_ENABLED: "false" }, "production"), { status: "DISABLED", code: "DISABLED" });
});

test("only the compiled outbound destination resolves", () => {
  assert.equal(resolveAiProcessConsoleFactDestination(undefined, enabled, "production").code, "DESTINATION_ID_REQUIRED");
  assert.equal(resolveAiProcessConsoleFactDestination("presstuner.ai-process-console.test-run.v1", enabled, "production").code, "DESTINATION_UNKNOWN");
  assert.equal(resolveAiProcessConsoleFactDestination("unknown", enabled, "production").code, "DESTINATION_UNKNOWN");
  assert.equal(resolveAiProcessConsoleFactDestination(AI_PROCESS_CONSOLE_FACT_DESTINATION, enabled, "production").status, "VALID");
});

test("destination URLs fail closed except exact non-production loopback HTTP", () => {
  for (const destinationUrl of [
    "http://console.example.test/facts",
    "https://user:pass@console.example.test/facts",
    "https://console.example.test/facts?token=nope",
    "https://console.example.test/facts#fragment",
  ]) {
    assert.equal(loadAiProcessConsoleAdapterConfiguration({ ...enabled, AI_PROCESS_CONSOLE_DESTINATION_URL: destinationUrl }, "production").status, "INVALID");
  }
  assert.equal(loadAiProcessConsoleAdapterConfiguration({ ...enabled, AI_PROCESS_CONSOLE_DESTINATION_URL: "http://localhost:4000/facts" }, "development").status, "VALID");
  assert.equal(loadAiProcessConsoleAdapterConfiguration({ ...enabled, AI_PROCESS_CONSOLE_DESTINATION_URL: "http://127.0.0.1:4000/facts" }, "test").status, "VALID");
  assert.equal(loadAiProcessConsoleAdapterConfiguration({ ...enabled, AI_PROCESS_CONSOLE_DESTINATION_URL: "http://[::1]:4000/facts" }, "development").status, "VALID");
  assert.equal(loadAiProcessConsoleAdapterConfiguration({ ...enabled, AI_PROCESS_CONSOLE_DESTINATION_URL: "http://localhost.evil.test/facts" }, "development").status, "INVALID");
  assert.equal(loadAiProcessConsoleAdapterConfiguration({ ...enabled, AI_PROCESS_CONSOLE_DESTINATION_URL: "http://192.168.1.2/facts" }, "test").status, "INVALID");
  assert.equal(loadAiProcessConsoleAdapterConfiguration({ ...enabled, AI_PROCESS_CONSOLE_DESTINATION_URL: "http://localhost/facts" }, "production").status, "INVALID");
});

test("directional credentials are strong and distinct", () => {
  assert.equal(loadAiProcessConsoleAdapterConfiguration({ ...enabled, AI_PROCESS_CONSOLE_INBOUND_HMAC_SECRET: "short" }).code, "INBOUND_SECRET_INVALID");
  assert.equal(loadAiProcessConsoleAdapterConfiguration({ ...enabled, AI_PROCESS_CONSOLE_OUTBOUND_HMAC_SECRET: "short" }).code, "OUTBOUND_SECRET_INVALID");
  assert.equal(loadAiProcessConsoleAdapterConfiguration({ ...enabled, AI_PROCESS_CONSOLE_OUTBOUND_HMAC_SECRET: enabled.AI_PROCESS_CONSOLE_INBOUND_HMAC_SECRET }).code, "DIRECTIONAL_SECRETS_MUST_DIFFER");
});

test("numeric settings use defaults and reject values outside their hard bounds", () => {
  const valid = loadAiProcessConsoleAdapterConfiguration(enabled, "production");
  assert.equal(valid.status, "VALID");
  if (valid.status === "VALID") assert.deepEqual({
    timeoutMs: valid.settings.httpTimeoutMs,
    skew: valid.settings.authMaxSkewSeconds,
    flush: valid.settings.flushBatchSize,
    days: valid.settings.deliveredRetentionDays,
    retain: valid.settings.retentionBatchSize,
    degraded: valid.settings.pendingDegradedAfterSeconds,
  }, { timeoutMs: 3000, skew: 300, flush: 50, days: 30, retain: 250, degraded: 900 });

  const cases = [
    ["AI_PROCESS_CONSOLE_HTTP_TIMEOUT_MS", "99", "HTTP_TIMEOUT_INVALID"],
    ["AI_PROCESS_CONSOLE_AUTH_MAX_SKEW_SECONDS", "901", "AUTH_MAX_SKEW_INVALID"],
    ["AI_PROCESS_CONSOLE_FLUSH_BATCH_SIZE", "0", "FLUSH_BATCH_INVALID"],
    ["AI_PROCESS_CONSOLE_DELIVERED_RETENTION_DAYS", "6", "RETENTION_DAYS_INVALID"],
    ["AI_PROCESS_CONSOLE_RETENTION_BATCH_SIZE", "1001", "RETENTION_BATCH_INVALID"],
    ["AI_PROCESS_CONSOLE_PENDING_DEGRADED_AFTER_SECONDS", "59", "PENDING_DEGRADED_AFTER_INVALID"],
  ] as const;
  for (const [name, value, code] of cases) {
    assert.equal(loadAiProcessConsoleAdapterConfiguration({ ...enabled, [name]: value }).code, code);
  }
});

test("public configuration summaries contain neither URL nor credentials", () => {
  const loaded = loadAiProcessConsoleAdapterConfiguration(enabled, "production");
  const serialized = JSON.stringify({ loaded, summary: summarizeAiProcessConsoleAdapterConfiguration(loaded) });
  assert.equal(serialized.includes("console.example.test"), false);
  assert.equal(serialized.includes(strong("i")), false);
  assert.equal(serialized.includes(strong("o")), false);
});
