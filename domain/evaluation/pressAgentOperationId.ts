const OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readPressAgentOperationId(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const operationId = (input as Record<string, unknown>).operationId;
  return typeof operationId === "string" && OPERATION_ID_PATTERN.test(operationId)
    ? operationId
    : null;
}
