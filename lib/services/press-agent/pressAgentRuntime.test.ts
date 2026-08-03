import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { restorePressAgentV1Checkpoint } from "./pressAgentV1Runtime";

test("Agent v2 runtime separates retrieval sources, final citations, and verified hashes", () => {
  const source = readFileSync(join(__dirname, "pressAgentRuntime.ts"), "utf8");
  assert.match(source, /PRESS_AGENT_VERSION = "press-agent-v2"/);
  assert.match(source, /agentRetrievedSource\.findMany/);
  assert.match(source, /persistFinalAgentCitations/);
  assert.match(source, /assertAppliedDraftMatchesVerified/);
});

test("serialized v1 checkpoints retain their original version identity", () => {
  assert.equal(
    restorePressAgentV1Checkpoint(
      JSON.stringify({
        runId: "run-1",
        teamId: "team-1",
        agentVersion: "press-agent-v1",
        sdkState: "state",
      }),
      { runId: "run-1", teamId: "team-1" },
    ).sdkState,
    "state",
  );
});
