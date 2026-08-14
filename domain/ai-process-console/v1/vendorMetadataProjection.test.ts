import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  canonicalVendorMetadataKeys,
  projectMetadataForVendor,
} from "./vendorMetadataProjection";

const hmacKey = "canonical-metadata-hmac-key";
const pseudonym = (value: string) =>
  `hmac-sha256:${createHmac("sha256", hmacKey).update(value).digest("hex")}`;

test("projects aggregation metadata with only AI Process Console-owned LangSmith keys and transforms", () => {
  const projection = projectMetadataForVendor({
    projectId: "presstuner",
    environment: "production",
    serviceName: "presstuner",
    caseId: "case-1",
    objectType: "press-agent-rag-query",
    objectRef: "ref:private/object-1",
    operationId: "operation-1",
    attemptId: "attempt-1",
    correlationId: "correlation-1",
    processId: "rag-query",
    processVersion: "1.0.0",
    processDefinitionHash: "a".repeat(64),
    executionMode: "LIVE",
    nodeId: "retrieval-execution",
  }, "langsmith", hmacKey);

  assert.deepEqual(projection, {
    project_id: "presstuner",
    environment: "production",
    service_name: "presstuner",
    case_id: pseudonym("case-1"),
    object_type: "press-agent-rag-query",
    operation_id: pseudonym("operation-1"),
    attempt_id: pseudonym("attempt-1"),
    correlation_id: pseudonym("correlation-1"),
    process_id: "rag-query",
    process_version: "1.0.0",
    process_hash: pseudonym("a".repeat(64)),
    execution_mode: "LIVE",
    node_id: "retrieval-execution",
  });
  assert.deepEqual(Object.keys(projection).sort(), [...canonicalVendorMetadataKeys.langsmith].sort());
  assert.equal(JSON.stringify(projection).includes("private/object-1"), false);
  assert.equal(JSON.stringify(projection).includes("workflow_id"), false);
  assert.equal(JSON.stringify(projection).includes("stage_id"), false);
});

test("requires a server-only HMAC key instead of falling back to raw identifiers", () => {
  assert.throws(
    () => projectMetadataForVendor({ operationId: "operation-1" }, "posthog", ""),
    /HMAC key/,
  );
});
