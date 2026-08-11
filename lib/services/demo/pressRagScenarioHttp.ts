import type { NextRequest } from "next/server";

const firstHeaderValue = (value: string | null) => value?.split(",", 1)[0]?.trim() || null;

export function isPublicPressRagSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const expectedHost =
      firstHeaderValue(request.headers.get("x-forwarded-host")) ||
      request.headers.get("host") ||
      request.nextUrl.host;
    const expectedProtocol =
      firstHeaderValue(request.headers.get("x-forwarded-proto")) ||
      request.nextUrl.protocol.replace(/:$/u, "");
    return originUrl.host === expectedHost && originUrl.protocol === `${expectedProtocol}:`;
  } catch {
    return false;
  }
}
