/** Hard cap for one run's canonical event export. One extra event is read only to detect overflow. */
export const MAX_CANONICAL_EXPORT_EVENTS = 10_000;
export const CANONICAL_EVENT_LIMIT_EXCEEDED = "CANONICAL_EVENT_LIMIT_EXCEEDED" as const;
