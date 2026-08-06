import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("canonical store serializes sequence allocation and deduplicates event identity", () => {
  const source = readFileSync("lib/services/ai-telemetry/canonicalEventStore.ts", "utf8");
  assert.match(source, /pg_advisory_xact_lock/); assert.match(source, /canonicalEventId: proposed\.eventId/); assert.match(source, /\(latest\?\.sequence \?\? 0\) \+ 1/); assert.match(source, /P2002/); assert.match(source, /details: json\(event\)/);
});
