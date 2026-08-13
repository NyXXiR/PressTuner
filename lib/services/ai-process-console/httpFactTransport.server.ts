import { canonicalJson } from "@/domain/ai-process-console/v1/canonicalJson";
import { EventV1Schema } from "@/domain/ai-process-console/v1/contracts";
import type { AiProcessFactTransport, FactDeliveryResult } from "./factTransport";
import { AI_PROCESS_SIGNATURE_HEADER, AI_PROCESS_TIMESTAMP_HEADER, signAiProcessRequest } from "./requestAuthentication";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function classifyResponse(response: Response): FactDeliveryResult {
  if (response.status >= 200 && response.status <= 299) return { status: "DELIVERED" };
  if (response.status === 409 && response.headers.get("X-Ai-Process-Result-Code") === "DUPLICATE_EVENT") return { status: "DELIVERED" };
  if (response.status === 401 || response.status === 403) return { status: "PERMANENT", code: "AUTHENTICATION_FAILED" };
  if ([400, 413, 415, 422].includes(response.status)) return { status: "PERMANENT", code: "CONTRACT_INVALID" };
  if (response.status === 409) return { status: "PERMANENT", code: "SEQUENCE_CONFLICT" };
  if (response.status === 408) return { status: "RETRYABLE", code: "TRANSPORT_TIMEOUT" };
  if (response.status === 425 || response.status === 429) return { status: "RETRYABLE", code: "CONSOLE_THROTTLED" };
  if (response.status >= 500) return { status: "RETRYABLE", code: "CONSOLE_UNAVAILABLE" };
  return { status: "PERMANENT", code: "HTTP_REJECTED" };
}

export function createHttpAiProcessFactTransport(args: {
  destinationUrl: URL;
  outboundHmacSecret: string;
  timeoutMs: number;
  fetch?: Fetch;
  clock?: () => Date;
}): AiProcessFactTransport {
  const fetchImplementation = args.fetch ?? fetch;
  return {
    async deliver(input) {
      const fact = EventV1Schema.parse(input);
      const body = canonicalJson(fact);
      const timestamp = Math.floor((args.clock?.() ?? new Date()).getTime() / 1000).toString();
      const authentication = signAiProcessRequest({ secret: args.outboundHmacSecret, timestamp, method: "POST", pathname: args.destinationUrl.pathname, body });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
      try {
        const response = await fetchImplementation(args.destinationUrl, {
          method: "POST",
          redirect: "manual",
          headers: {
            "Content-Type": "application/json",
            [AI_PROCESS_TIMESTAMP_HEADER]: authentication.timestamp,
            [AI_PROCESS_SIGNATURE_HEADER]: authentication.signature,
          },
          body,
          signal: controller.signal,
        });
        return classifyResponse(response);
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return { status: "RETRYABLE", code: "TRANSPORT_TIMEOUT" };
        return { status: "RETRYABLE", code: "TRANSPORT_FAILED" };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
