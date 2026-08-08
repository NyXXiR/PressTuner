const ATTEMPT_PARAM = "attempt";
const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;

/** Attempt ids come from user-editable URLs; anything outside the id alphabet is dropped. */
export function readAttemptIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  ).get(ATTEMPT_PARAM);
  return value && ATTEMPT_ID_PATTERN.test(value) ? value : null;
}

export function withAttemptParam(
  search: string,
  attemptId: string | null,
): string {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  if (attemptId) params.set(ATTEMPT_PARAM, attemptId);
  else params.delete(ATTEMPT_PARAM);
  const value = params.toString();
  return value ? `?${value}` : "";
}
