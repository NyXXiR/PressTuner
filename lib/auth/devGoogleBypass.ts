type EnvLike = { NODE_ENV?: string };

export const DEV_GOOGLE_BYPASS_EMAIL = "lgh0334@gmail.com";

export function isDevGoogleBypassEligible(env: EnvLike, host: string) {
  if (env.NODE_ENV === "production") return false;

  const normalizedHost = host.trim().toLowerCase();
  const hostname = normalizedHost.startsWith("[")
    ? normalizedHost.slice(1, normalizedHost.indexOf("]"))
    : normalizedHost.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function sanitizeDevLoginNextPath(nextPath: string | null) {
  if (!nextPath?.startsWith("/") || nextPath.startsWith("//")) return "/";
  return nextPath;
}
