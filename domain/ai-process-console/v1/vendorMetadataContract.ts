import type { CanonicalMetadata } from "./contracts";

export type AiProcessConsoleVendor = "langsmith" | "posthog";
export type VendorTransform = "OMIT" | "PLAIN" | "HMAC_SHA256";
export type AggregationMetadataKey = Extract<keyof CanonicalMetadata,
  | "projectId"
  | "environment"
  | "serviceName"
  | "caseId"
  | "objectType"
  | "objectRef"
  | "operationId"
  | "attemptId"
  | "correlationId"
  | "processId"
  | "processVersion"
  | "processDefinitionHash"
  | "executionMode"
  | "nodeId"
>;

type VendorMapping = Readonly<{ key: string | null; transform: VendorTransform }>;
type AggregationRegistryEntry = Readonly<Record<AiProcessConsoleVendor, VendorMapping>>;

const vendor = (key: string | null, transform: VendorTransform): VendorMapping =>
  Object.freeze({ key, transform });

/** Project adapter snapshot of AI Process Console metadata-registry/v1. */
export const aggregationMetadataRegistry = Object.freeze({
  projectId: { langsmith: vendor("project_id", "PLAIN"), posthog: vendor("project_id", "PLAIN") },
  environment: { langsmith: vendor("environment", "PLAIN"), posthog: vendor("environment", "PLAIN") },
  serviceName: { langsmith: vendor("service_name", "PLAIN"), posthog: vendor("service_name", "PLAIN") },
  caseId: { langsmith: vendor("case_id", "HMAC_SHA256"), posthog: vendor("case_id", "HMAC_SHA256") },
  objectType: { langsmith: vendor("object_type", "PLAIN"), posthog: vendor("object_type", "PLAIN") },
  objectRef: { langsmith: vendor(null, "OMIT"), posthog: vendor(null, "OMIT") },
  operationId: { langsmith: vendor("operation_id", "HMAC_SHA256"), posthog: vendor("operation_id", "HMAC_SHA256") },
  attemptId: { langsmith: vendor("attempt_id", "HMAC_SHA256"), posthog: vendor("attempt_id", "HMAC_SHA256") },
  correlationId: { langsmith: vendor("correlation_id", "HMAC_SHA256"), posthog: vendor("correlation_id", "HMAC_SHA256") },
  processId: { langsmith: vendor("process_id", "PLAIN"), posthog: vendor("process_id", "PLAIN") },
  processVersion: { langsmith: vendor("process_version", "PLAIN"), posthog: vendor("process_version", "PLAIN") },
  processDefinitionHash: { langsmith: vendor("process_hash", "HMAC_SHA256"), posthog: vendor("process_hash", "HMAC_SHA256") },
  executionMode: { langsmith: vendor("execution_mode", "PLAIN"), posthog: vendor("execution_mode", "PLAIN") },
  nodeId: { langsmith: vendor("node_id", "PLAIN"), posthog: vendor("node_id", "PLAIN") },
} as const satisfies Record<AggregationMetadataKey, AggregationRegistryEntry>);

export const canonicalAggregationKeys = Object.freeze(Object.keys(aggregationMetadataRegistry) as AggregationMetadataKey[]);

export const canonicalVendorMetadataKeys = Object.freeze({
  langsmith: Object.freeze(canonicalAggregationKeys.flatMap((key) => {
    const mapping = aggregationMetadataRegistry[key].langsmith;
    return mapping.key === null || mapping.transform === "OMIT" ? [] : [mapping.key];
  })),
  posthog: Object.freeze(canonicalAggregationKeys.flatMap((key) => {
    const mapping = aggregationMetadataRegistry[key].posthog;
    return mapping.key === null || mapping.transform === "OMIT" ? [] : [mapping.key];
  })),
});
