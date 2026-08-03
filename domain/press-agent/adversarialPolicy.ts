const INJECTION_MARKERS = [
  /ignore (?:all|previous|prior) (?:instructions|policies)/i,
  /reveal (?:the )?(?:secret|token|api key|system prompt)/i,
  /bypass (?:approval|tenant|policy)/i,
];

export function inspectAdversarialInput(value: string) {
  const matched = INJECTION_MARKERS.filter((pattern) => pattern.test(value)).map(
    (pattern) => pattern.source,
  );
  return { allowed: matched.length === 0, matched } as const;
}

export function assertAdversarialInput(value: string) {
  if (!inspectAdversarialInput(value).allowed) {
    throw new Error("PRESS_AGENT_PROMPT_INJECTION_BLOCKED");
  }
}
