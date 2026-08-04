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

test("typed evidence decisions control answer, abstention, and comparison", () => {
  const instructions = buildPressAgentInstructions();

  assert.match(instructions, /EVIDENCE_SUFFICIENT/);
  assert.match(instructions, /INSUFFICIENT_EVIDENCE/);
  assert.match(instructions, /SOURCE_CONFLICT/);
  assert.match(instructions, /cannotAnswer=true/i);
  assert.match(instructions, /call compare_sources/i);
  assert.match(instructions, /one stable claim ID/i);
  assert.match(instructions, /every atomic body sentence/i);
  assert.match(instructions, /exact quote text/i);
  assert.match(instructions, /PT-CAREER.*CAREER role/i);
  assert.match(instructions, /source ID alone is never proof/i);
});
