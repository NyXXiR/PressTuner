type EnvLike = {
  NODE_ENV?: string;
  ENABLE_DEV_API_PLAYGROUND?: string;
};

import { buildGeneratedPlain, evaluatePressDraftQuality, type PressAiQualityCheck } from "@/domain/press-ai-debugger/processExecutor";

export type PressApiQualityCheck = PressAiQualityCheck;

export function isDevPressApiPlaygroundEnabled(
  env: EnvLike = process.env,
) {
  return (
    env.NODE_ENV !== "production" ||
    env.ENABLE_DEV_API_PLAYGROUND === "true"
  );
}

export function assertDevPressApiPlaygroundEnabled() {
  if (isDevPressApiPlaygroundEnabled()) return;
  const error = new Error("NOT_FOUND") as Error & { status?: number };
  error.status = 404;
  throw error;
}

export { buildGeneratedPlain, evaluatePressDraftQuality };
