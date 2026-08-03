export type DevToolRoutePolicy = {
  isProduction: boolean;
  apiPlaygroundEnabled: boolean;
  billingSandboxEnabled: boolean;
};

function isInNamespace(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isDisabledDevToolPath(
  pathname: string,
  policy: DevToolRoutePolicy,
) {
  if (!isInNamespace(pathname, "/dev")) return false;
  if (!policy.isProduction) return false;

  if (
    policy.apiPlaygroundEnabled &&
    (isInNamespace(pathname, "/dev/api-playground") ||
      isInNamespace(pathname, "/dev/api/press-new"))
  ) {
    return false;
  }

  if (
    policy.billingSandboxEnabled &&
    isInNamespace(pathname, "/dev/billing-sandbox")
  ) {
    return false;
  }

  return true;
}

export function isDisabledDevToolApiPath(
  pathname: string,
  policy: DevToolRoutePolicy,
) {
  if (!isInNamespace(pathname, "/api/dev")) return false;
  if (!policy.isProduction) return false;

  if (
    policy.apiPlaygroundEnabled &&
    isInNamespace(pathname, "/api/dev/api-playground")
  ) {
    return false;
  }

  if (
    policy.billingSandboxEnabled &&
    isInNamespace(pathname, "/api/dev/billing-sandbox")
  ) {
    return false;
  }

  return true;
}
