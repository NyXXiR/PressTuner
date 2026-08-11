import { PublicPressRagScenarioSchema, type PressRagCommandRequest, type PressRagStartRequest, type PublicPressRagScenario } from "@/domain/demo/pressRagScenarioContract";

export class PublicPressRagApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryAfterSeconds: number | null,
    readonly scenario: PublicPressRagScenario | null,
    readonly details: unknown,
  ) {
    super(code);
  }
}

async function scenarioJson(response: Response) {
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
    let scenario: PublicPressRagScenario | null = null;
    const parsed = PublicPressRagScenarioSchema.safeParse(body.scenario);
    if (parsed.success) scenario = parsed.data as PublicPressRagScenario;
    const retry = response.headers.get("Retry-After");
    throw new PublicPressRagApiError(
      typeof body.code === "string" ? body.code : `PRESS_RAG_HTTP_${response.status}`,
      response.status,
      retry ? Number(retry) : typeof body.retryAfterSeconds === "number" ? body.retryAfterSeconds : null,
      scenario,
      body,
    );
  }
  return PublicPressRagScenarioSchema.parse(value) as PublicPressRagScenario;
}

export function startPublicPressRagScenarioClient(
  input: PressRagStartRequest,
  fetchImpl: typeof fetch = fetch,
) {
  return fetchImpl("/api/demo/press-rag-scenario/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  }).then(scenarioJson);
}

type ClientCommand =
  | { type: "execute_node"; correctedMemo?: string; reviewInstruction?: string; selectedNoteIds?: string[]; rewriteInstruction?: string }
  | { type: "advance_edge" }
  | { type: "retry_from_block"; correctedMemo: string };

export function commandPublicPressRagScenarioClient(
  scenario: PublicPressRagScenario,
  command: ClientCommand,
  fetchImpl: typeof fetch = fetch,
) {
  const body: PressRagCommandRequest = {
    ...command,
    capability: scenario.capability,
    expectedRevision: scenario.attempt.revision,
  } as PressRagCommandRequest;
  return fetchImpl("/api/demo/press-rag-scenario/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).then(scenarioJson);
}
