import assert from "node:assert/strict";
import test from "node:test";

import { parseGa4OperationCollectRequest } from "./ga4OperationRequestProof";

test("recognizes the exact GA4 operation event from query parameters", () => {
  assert.deepEqual(
    parseGa4OperationCollectRequest(
      "https://www.google-analytics.com/g/collect?v=2&tid=G-Q3BK044558&en=presstuner_ai_operation_business&ep.operation_id=30b128c5-53cd-4acc-8f6d-6fe04cd8fb8f&ep.outcome=conversion",
      null,
    ),
    {
      measurementId: "G-Q3BK044558",
      eventName: "presstuner_ai_operation_business",
      operationId: "30b128c5-53cd-4acc-8f6d-6fe04cd8fb8f",
      outcome: "conversion",
    },
  );
});

test("merges GA4 POST form fields without accepting unrelated analytics requests", () => {
  assert.deepEqual(
    parseGa4OperationCollectRequest(
      "https://region1.google-analytics.com/g/collect?v=2&tid=G-Q3BK044558",
      "en=presstuner_ai_operation_business&ep.operation_id=30b128c5-53cd-4acc-8f6d-6fe04cd8fb8f&ep.outcome=conversion",
    ),
    {
      measurementId: "G-Q3BK044558",
      eventName: "presstuner_ai_operation_business",
      operationId: "30b128c5-53cd-4acc-8f6d-6fe04cd8fb8f",
      outcome: "conversion",
    },
  );
  assert.equal(
    parseGa4OperationCollectRequest(
      "https://www.google-analytics.com/g/collect?v=2&tid=G-Q3BK044558&en=page_view",
      null,
    ),
    null,
  );
  assert.equal(
    parseGa4OperationCollectRequest(
      "https://example.com/g/collect?en=presstuner_ai_operation_business",
      null,
    ),
    null,
  );
});
