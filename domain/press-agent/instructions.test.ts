import assert from "node:assert/strict";
import test from "node:test";

import { buildPressAgentInstructions } from "./instructions";

test("final citations include only direct supporting evidence", () => {
  const instructions = buildPressAgentInstructions();

  assert.match(instructions, /final sourceIds/i);
  assert.match(instructions, /only sources that directly support/i);
  assert.match(instructions, /retrieval candidates/i);
  assert.match(instructions, /fact-finding and comparison requests/i);
  assert.match(instructions, /only when the user asks for a press release or draft/i);
});
