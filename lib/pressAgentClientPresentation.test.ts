import assert from "node:assert/strict";
import test from "node:test";

import {
  agentRunMessage,
  agentStatusNotice,
} from "./pressAgentClientPresentation";

test("retry presentation shows recovered output and failed run details", () => {
  assert.deepEqual(
    agentRunMessage({
      status: "COMPLETED",
      output: { answer: "복구된 답변", summary: "요약" },
    }),
    { body: "복구된 답변", tone: "success" },
  );
  assert.deepEqual(
    agentRunMessage({
      status: "COMPLETED",
      output: { summary: "복구된 요약" },
    }),
    { body: "복구된 요약", tone: "success" },
  );
  assert.deepEqual(
    agentRunMessage({
      status: "FAILED",
      errorMessage: "체크포인트 복구 실패",
    }),
    { body: "체크포인트 복구 실패", tone: "error" },
  );
});

test("agent status notices distinguish visible errors from progress", () => {
  assert.deepEqual(agentStatusNotice("저장했습니다."), {
    message: "저장했습니다.",
    kind: "status",
  });
  assert.deepEqual(agentStatusNotice("저장에 실패했습니다.", true), {
    message: "저장에 실패했습니다.",
    kind: "error",
  });
});
