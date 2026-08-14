import { createHmac } from "node:crypto";

import type { CanonicalMetadata } from "./contracts";
import {
  aggregationMetadataRegistry,
  canonicalAggregationKeys,
  type AggregationMetadataKey,
  type AiProcessConsoleVendor,
} from "./vendorMetadataContract";

export { canonicalVendorMetadataKeys } from "./vendorMetadataContract";

export function projectMetadataForVendor(
  metadata: Pick<CanonicalMetadata, AggregationMetadataKey>,
  target: AiProcessConsoleVendor,
  hmacKey: string,
): Readonly<Record<string, string | number>> {
  if (!hmacKey) throw new Error("An HMAC key is required for AI Process Console vendor projection");
  const projection: Record<string, string | number> = {};
  for (const canonicalKey of canonicalAggregationKeys) {
    const value = metadata[canonicalKey];
    if (value === undefined) continue;
    const mapping = aggregationMetadataRegistry[canonicalKey][target];
    if (mapping.transform === "OMIT" || mapping.key === null) continue;
    projection[mapping.key] = mapping.transform === "HMAC_SHA256"
      ? `hmac-sha256:${createHmac("sha256", hmacKey).update(String(value)).digest("hex")}`
      : typeof value === "number" ? value : String(value);
  }
  return Object.freeze(projection);
}
