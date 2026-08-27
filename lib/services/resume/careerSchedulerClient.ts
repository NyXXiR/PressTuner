export function resolveCareerSchedulerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return {
    schedulerBaseUrl:
      env.CAREER_SCHEDULER_URL ??
      env.SCHEDULER_INTERNAL_URL ??
      env.SCHEDULER_URL,
    schedulerToken:
      env.CAREER_SCHEDULER_TOKEN ??
      env.SCHEDULER_INTERNAL_TOKEN ??
      env.MANUAL_API_KEY,
  };
}

async function enqueue(path: string, body: Record<string, unknown>) {
  const { schedulerBaseUrl, schedulerToken } =
    resolveCareerSchedulerConfig();
  if (!schedulerBaseUrl) {
    throw new Error("CAREER_SCHEDULER_URL_NOT_CONFIGURED");
  }
  const response = await fetch(new URL(path, schedulerBaseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(schedulerToken
        ? { authorization: `Bearer ${schedulerToken}` }
        : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`CAREER_SCHEDULER_ENQUEUE_FAILED:${response.status}`);
  }
}

export async function enqueueCareerSource(input: {
  sourceId: string;
  userId: string;
  teamId: string | null;
  processingVersion: number;
}) {
  await enqueue("/internal/career-memory/enqueue", {
    type: "index-career-source",
    ...input,
  });
}

export async function enqueueCareerExperience(input: {
  experienceId: string;
  userId: string;
  embeddingRevision: number;
}) {
  await enqueue("/internal/career-memory/enqueue", {
    type: "index-career-experience",
    ...input,
  });
}

export async function enqueueResumeDocumentImport(input: {
  importId: string;
  sourceId: string;
  userId: string;
  processingVersion: number;
}) {
  await enqueue("/internal/career-memory/enqueue", {
    type: "extract-resume-document",
    ...input,
  });
}
