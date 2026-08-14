import { aggregationMetadataRegistry } from "@/domain/ai-process-console/v1/vendorMetadataContract";

const GA4_EVENT_NAME = "presstuner_ai_operation_business";
const PSEUDONYMOUS_OPERATION_PATTERN = /^hmac-sha256:[a-f0-9]{64}$/;

export type Ga4OperationCollectRequest = {
  measurementId: string;
  eventName: typeof GA4_EVENT_NAME;
  operationId: string;
  outcome: "conversion";
};

function isGa4CollectUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();
  return (
    (hostname === "google-analytics.com" ||
      hostname.endsWith(".google-analytics.com") ||
      hostname === "analytics.google.com" ||
      hostname.endsWith(".analytics.google.com")) &&
    url.pathname.endsWith("/g/collect")
  );
}

export function parseGa4OperationCollectRequest(
  rawUrl: string,
  postData: string | null,
): Ga4OperationCollectRequest | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!isGa4CollectUrl(url)) return null;

  const params = new URLSearchParams(url.searchParams);
  if (postData) {
    for (const [key, value] of new URLSearchParams(postData)) {
      params.set(key, value);
    }
  }

  const measurementId = params.get("tid") ?? "";
  const eventName = params.get("en");
  const operationKey = aggregationMetadataRegistry.operationId.posthog.key;
  if (!operationKey) return null;
  const operationId = params.get(`ep.${operationKey}`) ?? "";
  const outcome = params.get("ep.outcome");
  if (
    !/^G-[A-Z0-9]+$/.test(measurementId) ||
    eventName !== GA4_EVENT_NAME ||
    !PSEUDONYMOUS_OPERATION_PATTERN.test(operationId) ||
    outcome !== "conversion"
  ) {
    return null;
  }

  return { measurementId, eventName, operationId, outcome };
}
