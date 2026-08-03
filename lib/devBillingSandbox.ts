type EnvLike = {
  NODE_ENV?: string;
  ENABLE_DEV_BILLING_SANDBOX?: string;
};

export function isDevBillingSandboxEnabled(env: EnvLike = process.env) {
  return (
    env.NODE_ENV !== "production" ||
    env.ENABLE_DEV_BILLING_SANDBOX === "true"
  );
}

export function assertDevBillingSandboxEnabled() {
  if (isDevBillingSandboxEnabled()) return;
  const error = new Error("NOT_FOUND") as Error & { status?: number };
  error.status = 404;
  throw error;
}
