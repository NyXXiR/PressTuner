import { v5 as uuidv5 } from "uuid";
import type { CanonicalMetadata } from "@/domain/ai-process-console/v1/contracts";
import { projectMetadataForVendor } from "@/domain/ai-process-console/v1/vendorMetadataProjection";
import { createLangSmithOperationTracer } from "@/lib/services/operations/langSmithOperationTracer";

const POSTHOG_INSERT_NAMESPACE = "59138c9b-d4fb-5cf5-9052-2bf67ab5ca51";
const POSTHOG_TIMEOUT_MS = 3_000;
const DISTINCT_ID = "presstuner:test-run-provider-publication";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface TestRunProviderPublicationPort {
  publish(input: {
    metadata: CanonicalMetadata;
    outcome: "SUCCEEDED" | "FAILED";
    startedAt: string;
    completedAt: string;
  }): Promise<void>;
}

type PublicationDependencies = {
  environment?: Readonly<Record<string, string | undefined>>;
  fetch?: Fetch;
  langsmith?: Pick<ReturnType<typeof createLangSmithOperationTracer>, "publishRootOutcome">;
  posthog?: { apiKey: string; apiHost: URL } | null;
};

export function createTestRunProviderPublication(dependencies: PublicationDependencies = {}): TestRunProviderPublicationPort {
  const environment = dependencies.environment ?? process.env;
  const langsmith = dependencies.langsmith ?? createLangSmithOperationTracer({ environment });
  const loadPostHog = dependencies.posthog === undefined
    ? async () => (await import("@/lib/server/posthog-config")).getPostHogServerCaptureConfig()
    : async () => dependencies.posthog;
  const fetch = dependencies.fetch ?? globalThis.fetch;

  const publishPostHog = async (input: Parameters<TestRunProviderPublicationPort["publish"]>[0]) => {
    const hmacKey = environment.AI_PROCESS_CONSOLE_VENDOR_METADATA_HMAC_KEY?.trim();
    const posthog = await loadPostHog();
    if (!posthog || !hmacKey || input.metadata.executionMode !== "TEST") return;
    const properties = projectMetadataForVendor(input.metadata, "posthog", hmacKey);
    const operationId = properties.operation_id;
    if (typeof operationId !== "string") return;
    const outcome = input.outcome === "SUCCEEDED" ? "accepted" : "abandoned";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POSTHOG_TIMEOUT_MS);
    try {
      await fetch(new URL("/capture/", posthog.apiHost), {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: posthog.apiKey,
          event: "ai_operation_outcome",
          properties: {
            distinct_id: DISTINCT_ID,
            $insert_id: uuidv5(`${operationId}:${outcome}`, POSTHOG_INSERT_NAMESPACE),
            ...properties,
            outcome,
          },
        }),
      });
    } catch {
      // Provider publication is independent and fail-open.
    } finally {
      clearTimeout(timeout);
    }
  };

  return Object.freeze({
    async publish(input: Parameters<TestRunProviderPublicationPort["publish"]>[0]) {
      await Promise.allSettled([
        langsmith.publishRootOutcome(input),
        publishPostHog(input),
      ]);
    },
  });
}
