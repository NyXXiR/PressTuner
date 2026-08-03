import { restorePressAgentCheckpoint } from "@/domain/press-agent/runPolicy";

export const PRESS_AGENT_V1_VERSION = "press-agent-v1";

export function restorePressAgentV1Checkpoint(
  serialized: string,
  expected: { runId: string; teamId: string },
) {
  return restorePressAgentCheckpoint(serialized, {
    ...expected,
    agentVersion: PRESS_AGENT_V1_VERSION,
  });
}
