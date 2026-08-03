import "server-only";

import { existsSync, readFileSync } from "node:fs";

const DEFAULT_POSTHOG_TOKEN_FILE =
  "/home/nyxxir/.config/agent-secrets/posthog.token";
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

function readProjectApiKeyFromFile(filePath: string) {
  if (!existsSync(filePath)) {
    return null;
  }

  const value = readFileSync(filePath, "utf8").trim();
  return value.length > 0 ? value : null;
}

export function getPostHogClientConfig() {
  const apiKey =
    process.env.NEXT_PUBLIC_POSTHOG_KEY ??
    process.env.POSTHOG_PROJECT_API_KEY ??
    readProjectApiKeyFromFile(
      process.env.POSTHOG_PROJECT_API_KEY_FILE ?? DEFAULT_POSTHOG_TOKEN_FILE,
    );

  const apiHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ??
    process.env.POSTHOG_HOST ??
    DEFAULT_POSTHOG_HOST;

  return {
    apiKey,
    apiHost,
  };
}
