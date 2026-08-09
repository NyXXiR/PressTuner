const EXPLICIT_LOOPBACK_HTTP_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

/**
 * Credential-bearing producer endpoints must use TLS. Plain HTTP is allowed only
 * for explicit loopback hosts so local protocol and E2E tests remain possible.
 */
export function isSecureCredentialEndpoint(url: URL): boolean {
  return url.protocol === "https:"
    || (url.protocol === "http:" && EXPLICIT_LOOPBACK_HTTP_HOSTNAMES.has(url.hostname));
}
