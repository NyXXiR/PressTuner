// proxy.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isDevApiPlaygroundAutoSessionEligible } from "@/lib/devApiPlayground";
import {
  isDisabledDevToolApiPath,
  isDisabledDevToolPath,
  type DevToolRoutePolicy,
} from "@/lib/devToolRoutePolicy";
import { SESSION_COOKIE_NAME } from "@/lib/session"; // ✅ 여기로 변경

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const LEGACY_ROUTES_ENABLED =
  !IS_PRODUCTION ||
  process.env.NEXT_PUBLIC_ENABLE_LEGACY_ROUTES === "true";
const DEV_BILLING_SANDBOX_ENABLED =
  !IS_PRODUCTION ||
  process.env.ENABLE_DEV_BILLING_SANDBOX === "true";
const DEV_API_PLAYGROUND_ENABLED =
  !IS_PRODUCTION ||
  process.env.ENABLE_DEV_API_PLAYGROUND === "true";
const DEV_TOOL_ROUTE_POLICY: DevToolRoutePolicy = {
  isProduction: IS_PRODUCTION,
  apiPlaygroundEnabled: DEV_API_PLAYGROUND_ENABLED,
  billingSandboxEnabled: DEV_BILLING_SANDBOX_ENABLED,
};

function isProductionHiddenLegacyPath(pathname: string) {
  if (pathname === "/admin/ai-quota") return false;
  if (DEV_BILLING_SANDBOX_ENABLED && pathname === "/admin") return false;
  if (DEV_API_PLAYGROUND_ENABLED && pathname === "/admin") return false;
  return (
    pathname === "/my/billing" ||
    pathname.startsWith("/team") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/legacy")
  );
}

function isProductionHiddenLegacyApiPath(pathname: string) {
  if (pathname === "/api/admin/ai-quota") return false;
  return (
    pathname === "/api/users" ||
    pathname.startsWith("/api/users/") ||
    pathname.startsWith("/api/team") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/style-guides") ||
    pathname.startsWith("/api/guides") ||
    pathname.startsWith("/api/reviews") ||
    pathname === "/api/my/articles/pending" ||
    pathname.startsWith("/api/my/articles/pending/") ||
    /^\/api\/my\/articles\/[^/]+\/team$/.test(pathname) ||
    /^\/api\/articles\/[^/]+\/reviewers$/.test(pathname) ||
    /^\/api\/articles\/[^/]+\/approval$/.test(pathname)
  );
}

export function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const pathname = url.pathname;

  const hasSession = !!req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!LEGACY_ROUTES_ENABLED && isProductionHiddenLegacyApiPath(pathname)) {
    return NextResponse.json(
      {
        ok: false,
        error: "LEGACY_API_DISABLED",
        message: "Not found",
      },
      { status: 404 },
    );
  }

  if (isDisabledDevToolApiPath(pathname, DEV_TOOL_ROUTE_POLICY)) {
    return NextResponse.json(
      {
        ok: false,
        error: "NOT_FOUND",
        message: "Not found",
      },
      { status: 404 },
    );
  }

  if (!LEGACY_ROUTES_ENABLED && isProductionHiddenLegacyPath(pathname)) {
    return NextResponse.rewrite(new URL("/_disabled", req.url));
  }

  if (isDisabledDevToolPath(pathname, DEV_TOOL_ROUTE_POLICY)) {
    return NextResponse.rewrite(new URL("/_disabled", req.url));
  }

  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/my/dashboard", req.url));
  }

  const publicPaths = ["/press", "/demo"];

  const publicPrefixes = [
    "/press/notices",
    "/press/pricing",
    "/press/contact",
    "/resume/notices",
    "/resume/pricing",
    "/resume/contact",
    "/resume/about",
  ];

  const isPublic =
    publicPaths.includes(pathname) ||
    publicPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

  if (isPublic) return NextResponse.next();

  if (
    pathname === "/dev/api-playground" &&
    !hasSession &&
    DEV_API_PLAYGROUND_ENABLED &&
    isDevApiPlaygroundAutoSessionEligible()
  ) {
    return NextResponse.redirect(new URL("/api/auth/qa/auto", req.url));
  }

  const isProtected =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/billing") ||
    pathname.startsWith("/dev") ||
    pathname.startsWith("/legacy") ||
    pathname.startsWith("/my") ||
    pathname.startsWith("/press") ||
    pathname.startsWith("/team") ||
    (pathname.startsWith("/resume") && pathname !== "/resume");

  if (!isProtected) return NextResponse.next();

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/demo/:path*",
    "/admin/:path*",
    "/billing/:path*",
    "/dev/:path*",
    "/legacy/:path*",
    "/my/:path*",
    "/press/:path*",
    "/team/:path*",
    "/resume/:path*",
    "/api/:path*",
  ],
};
