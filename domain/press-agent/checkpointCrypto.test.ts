import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptPressAgentCheckpoint,
  encryptPressAgentCheckpoint,
} from "./checkpointCrypto";

const key = "11".repeat(32);
const scope = { runId: "run-1", teamId: "team-1", version: 1 };

test("checkpoint encryption round-trips without exposing plaintext", () => {
  const encrypted = encryptPressAgentCheckpoint("sensitive-sdk-state", key, scope);
  assert.doesNotMatch(encrypted, /sensitive-sdk-state/);
  assert.equal(decryptPressAgentCheckpoint(encrypted, key, scope), "sensitive-sdk-state");
});

test("checkpoint encryption is bound to team and run scope", () => {
  const encrypted = encryptPressAgentCheckpoint("state", key, scope);
  assert.throws(
    () => decryptPressAgentCheckpoint(encrypted, key, { ...scope, teamId: "team-2" }),
    /PRESS_AGENT_CHECKPOINT_DECRYPT_FAILED/,
  );
});

test("checkpoint encryption rejects invalid key material", () => {
  assert.throws(
    () => encryptPressAgentCheckpoint("state", "short", scope),
    /PRESS_AGENT_CHECKPOINT_KEY_INVALID/,
  );
});
