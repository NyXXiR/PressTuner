type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

const TRANSIENT_PRISMA_CODES = new Set(["P1001", "P1002", "P1017", "P2024"]);
const TRANSIENT_MESSAGE_PARTS = [
  "can't reach database server",
  "server has closed the connection",
  "connection terminated",
  "connection reset",
  "timed out fetching a new connection",
];

export function isTransientDatabaseConnectionError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (TRANSIENT_PRISMA_CODES.has(code)) return true;

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return TRANSIENT_MESSAGE_PARTS.some((part) => message.includes(part));
}

export async function withTransientDatabaseRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
) {
  const attempts = Math.max(1, options.attempts ?? 4);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 150);
  const sleep =
    options.sleep ??
    ((delayMs: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      }));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === attempts || !isTransientDatabaseConnectionError(error)) {
        throw error;
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw new Error("Database retry exhausted unexpectedly");
}
