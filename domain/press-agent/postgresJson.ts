export function sanitizePostgresJson(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, child) =>
      typeof child === "string" ? child.replace(/\u0000/g, "") : child,
    ),
  );
}
