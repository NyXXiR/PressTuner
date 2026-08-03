type EnvLike = {
  NODE_ENV?: string;
  ENABLE_DEV_API_PLAYGROUND?: string;
};

export function isDevApiPlaygroundEnabled(env: EnvLike = process.env) {
  return (
    env.NODE_ENV !== "production" ||
    env.ENABLE_DEV_API_PLAYGROUND === "true"
  );
}

export function isDevApiPlaygroundAutoSessionEligible(
  env: EnvLike = process.env,
) {
  return env.NODE_ENV !== "production";
}

export function assertDevApiPlaygroundEnabled(env: EnvLike = process.env) {
  if (isDevApiPlaygroundEnabled(env)) return;
  const error = new Error("NOT_FOUND") as Error & { status?: number };
  error.status = 404;
  throw error;
}
