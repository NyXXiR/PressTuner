import {
  createResumeWriteFlowState,
  type FlowBrick,
  type FlowCapture,
  type FlowCaptureResult,
  type FlowCaptureStatus,
  type FlowDeferredCaptureTask,
  type FlowOrganizedIntake,
  type FlowProductivity,
  type FlowQuestion,
  type FlowQuestionStatus,
  type FlowGrounding,
  type FlowVerification,
  type FlowServerQuestion,
  type FlowStage,
  type ResumeWriteFlowState,
} from "@/domain/resume-writing/flowMachine";
import type { ResumeWritingWorkspace } from "@/domain/resume-writing/workspace";
import type { ResumeExperienceCaptureItem } from "@/domain/resume-writing/completion";
export type ResumeStructuredBrief = {
  summary: string;
  deadline: string | null;
  employmentType: string | null;
  location: string | null;
  coreResponsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  keySignals: string[];
  writingGuidance: string[];
};

type PendingExperienceCapture = {
  id: string;
  questionId: string;
  summary: string;
  items: ResumeExperienceCaptureItem[];
};

export type ResumeWriteFlowExchange = {
  method: string;
  path: string;
  request: unknown;
  response: unknown;
  timestamp: string;
  status: number | null;
};

export type ResumeWriteFlowApiClientOptions = {
  fetch?: typeof fetch;
  now?: () => Date;
  randomUUID?: () => string;
  onExchange?: (exchange: ResumeWriteFlowExchange) => void;
};

type Runtime = {
  fetch: typeof fetch;
  randomUUID: () => string;
};

const SENSITIVE_KEY = /authorization|cookie|token|secret|password/i;

function sanitize(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        sanitize(child, childKey),
      ]),
    );
  }
  return value;
}

function observedRuntime(
  options: ResumeWriteFlowApiClientOptions = {},
): Runtime {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  return {
    randomUUID: options.randomUUID ?? (() => crypto.randomUUID()),
    fetch: async (input, init) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      let requestBody: unknown = null;
      if (typeof init?.body === "string") {
        try {
          requestBody = JSON.parse(init.body);
        } catch {
          requestBody = init.body;
        }
      }
      const emit = (exchange: ResumeWriteFlowExchange) => {
        try {
          options.onExchange?.(exchange);
        } catch {
          // Diagnostics must not change the production result.
        }
      };
      try {
        const response = await fetchImpl(input, init);
        const text = await response.clone().text();
        let responseBody: unknown = text;
        try {
          responseBody = text ? JSON.parse(text) : null;
        } catch {
          // Preserve inspectable non-JSON text.
        }
        emit({
          method,
          path,
          request: sanitize(requestBody),
          response: sanitize(responseBody),
          timestamp: now().toISOString(),
          status: response.status,
        });
        return response;
      } catch {
        emit({
          method,
          path,
          request: sanitize(requestBody),
          response: {
            error: "NETWORK_ERROR",
            message: "Network request failed",
          },
          timestamp: now().toISOString(),
          status: null,
        });
        throw new FlowApiError(
          "Network request failed",
          "NETWORK_ERROR",
          undefined,
        );
      }
    },
  };
}

const defaultRuntime: Runtime = {
  fetch: (...args) => fetch(...args),
  randomUUID: () => crypto.randomUUID(),
};

function parseAiAdviceText(raw: string | null | undefined): string {
  const text = raw?.trim() ?? "";
  if (!text.startsWith("{")) return text;
  try {
    const parsed = JSON.parse(text) as {
      guideline?: unknown;
      rationale?: unknown;
    };
    if (typeof parsed.guideline === "string" && parsed.guideline.trim()) {
      return parsed.guideline.trim();
    }
    if (typeof parsed.rationale === "string" && parsed.rationale.trim()) {
      return parsed.rationale.trim();
    }
  } catch {
    // Keep legacy plain-text advice.
  }
  return text;
}

function emptyBrief(): ResumeStructuredBrief {
  return {
    summary: "",
    deadline: null,
    employmentType: null,
    location: null,
    coreResponsibilities: [],
    requirements: [],
    preferredQualifications: [],
    keySignals: [],
    writingGuidance: [],
  };
}

function parseResumeBrief(raw: string | null | undefined): ResumeStructuredBrief {
  if (!raw) return emptyBrief();
  try {
    const value = JSON.parse(raw) as Partial<ResumeStructuredBrief> & {
      version?: unknown;
    };
    if (value.version === 1) {
      return {
        summary: typeof value.summary === "string" ? value.summary : "",
        deadline: typeof value.deadline === "string" ? value.deadline : null,
        employmentType:
          typeof value.employmentType === "string" ? value.employmentType : null,
        location: typeof value.location === "string" ? value.location : null,
        coreResponsibilities: Array.isArray(value.coreResponsibilities)
          ? value.coreResponsibilities.map(String)
          : [],
        requirements: Array.isArray(value.requirements)
          ? value.requirements.map(String)
          : [],
        preferredQualifications: Array.isArray(value.preferredQualifications)
          ? value.preferredQualifications.map(String)
          : [],
        keySignals: Array.isArray(value.keySignals)
          ? value.keySignals.map(String)
          : [],
        writingGuidance: Array.isArray(value.writingGuidance)
          ? value.writingGuidance.map(String)
          : [],
      };
    }
  } catch {
    // Legacy briefs may be plain text.
  }
  return { ...emptyBrief(), summary: raw };
}

async function readJson(res: Response, fallbackMessage: string) {
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new FlowApiError(
      json?.message ?? json?.error ?? fallbackMessage,
      json?.code,
      res.status,
      json?.details,
    );
  }
  return json;
}

export class FlowApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "FlowApiError";
  }
}

export async function organizeIntake(input: {
  readonly rawText: string;
  readonly postingUrl: string;
}, runtime: Runtime = defaultRuntime): Promise<FlowOrganizedIntake> {
  const res = await runtime.fetch("/api/resume/intake/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: input.rawText, url: input.postingUrl }),
  });
  const json = await readJson(res, "채용 정보 정리에 실패했습니다.");
  const data = json.data;
  return {
    company: data.companyName ?? "",
    job: data.jobTitle ?? "",
    brief: {
      summary: data.jdSummary ?? "",
      deadline: data.deadline ?? null,
      employmentType: data.employmentType ?? null,
      location: data.location ?? null,
      coreResponsibilities: data.coreResponsibilities ?? [],
      requirements: data.requirements ?? [],
      preferredQualifications: data.preferredQualifications ?? [],
      keySignals: data.keySignals ?? [],
      writingGuidance: data.writingGuidance ?? [],
    },
    questions: (data.questions ?? []).map(
      (question: { questionText: string; charLimit: number | null }) => ({
        prompt: question.questionText,
        charLimit: question.charLimit ?? 700,
      }),
    ),
  };
}

export async function loadUserBricks(
  runtime: Runtime = defaultRuntime,
): Promise<readonly FlowBrick[]> {
  const params = new URLSearchParams({ page: "1", pageSize: "100" });
  const res = await runtime.fetch(`/api/resume/bricks?${params.toString()}`);
  const json = await readJson(res, "경력 기억을 불러오지 못했습니다.");
  return (json.items ?? []).map(
    (brick: { id: string; title: string; content: string; tags?: string[] }) => ({
      id: brick.id,
      title: brick.title,
      content: brick.content ?? "",
      tags: brick.tags ?? [],
    }),
  );
}

export async function startWorkspace(input: {
  readonly company: string;
  readonly job: string;
  readonly brief: ResumeStructuredBrief;
  readonly questions: readonly { prompt: string; charLimit: number }[];
}, runtime: Runtime = defaultRuntime): Promise<{
  readonly appId: string;
  readonly questions: readonly FlowServerQuestion[];
}> {
  const createRes = await runtime.fetch("/api/resume/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientRequestId: runtime.randomUUID(),
      brief: {
        companyName: input.company.trim(),
        jobTitle: input.job.trim(),
        ...input.brief,
        questions: input.questions
          .filter((question) => question.prompt.trim().length > 0)
          .map((question) => ({
            questionText: question.prompt.trim(),
            charLimit: question.charLimit,
          })),
      },
      commonWritingGuidance: input.brief.writingGuidance,
    }),
  });
  const created = await readJson(createRes, "지원서 생성에 실패했습니다.");
  const appId: string = created.id;

  if (created.strategyStatus === "FAILED") {
    throw new FlowApiError(
      created.strategyError?.message ?? "문항 분석에 실패했습니다.",
      created.strategyError?.code,
      502,
      { applicationId: appId, retryable: true },
    );
  }
  const strategy = await readJson(
    await runtime.fetch(`/api/resume/applications/${appId}`),
    "문항 전략을 불러오지 못했습니다.",
  );

  return {
    appId,
    questions: (
      strategy.data?.questions ??
      strategy.application?.questions ??
      strategy.items ??
      []
    ).map(
      (item: {
        id: string;
        questionText: string;
        charLimit: number | null;
        aiAdvice?: string | null;
        relatedBricks?: Array<{ brick?: { id: string }; id?: string }>;
      }) => ({
        id: item.id,
        prompt: item.questionText,
        charLimit: item.charLimit ?? 700,
        aiAdvice: parseAiAdviceText(item.aiAdvice),
        linkedBrickIds: (item.relatedBricks ?? []).map(
          (link) => link.brick?.id ?? link.id ?? "",
        ).filter(Boolean),
      }),
    ),
  };
}

export async function generateDraft(input: {
  readonly questionId: string;
  readonly instruction: string;
  readonly charLimit: number;
}, runtime: Runtime = defaultRuntime): Promise<{ text: string; grounding: FlowGrounding | null }> {
  const res = await runtime.fetch("/api/resume/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questionId: input.questionId,
      instruction: input.instruction || undefined,
      charLimit: input.charLimit,
    }),
  });
  const json = await readJson(res, "초안 생성에 실패했습니다.");
  return {
    text: json.text as string,
    grounding: (json.grounding ?? null) as FlowGrounding | null,
  };
}

export async function requestRevision(input: {
  readonly questionId: string;
  readonly originalText: string;
  readonly instruction: string;
  readonly charLimit: number;
}, runtime: Runtime = defaultRuntime): Promise<{ text: string; grounding: FlowGrounding | null }> {
  const res = await runtime.fetch("/api/resume/repolish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      questionId: input.questionId,
      originalText: input.originalText,
      userInstruction: input.instruction,
      charLimit: input.charLimit,
    }),
  });
  const json = await readJson(res, "수정안 생성에 실패했습니다.");
  return {
    text: json.text as string,
    grounding: (json.grounding ?? null) as FlowGrounding | null,
  };
}

export async function saveQuestionAnswer(input: {
  readonly questionId: string;
  readonly answer: string;
  readonly isCompleted: boolean;
}, runtime: Runtime = defaultRuntime): Promise<{ answerRevision: number }> {
  const res = await runtime.fetch(`/api/resume/questions/${input.questionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      answer: input.answer,
      isCompleted: input.isCompleted,
    }),
  });
  const json = await readJson(res, "문항 저장에 실패했습니다.");
  return { answerRevision: json.answerRevision as number };
}

export async function readGrounding(
  questionId: string,
  runtime: Runtime = defaultRuntime,
): Promise<FlowGrounding | null> {
  const json = await readJson(
    await runtime.fetch(
      `/api/resume/questions/${encodeURIComponent(questionId)}/grounding`,
      { cache: "no-store" },
    ),
    "근거 정보를 불러오지 못했습니다.",
  );
  return (json.grounding ?? null) as FlowGrounding | null;
}

export async function readVerification(
  questionId: string,
  runtime: Runtime = defaultRuntime,
): Promise<Record<string, unknown>> {
  return readJson(
    await runtime.fetch(
      `/api/resume/questions/${encodeURIComponent(questionId)}/verification`,
      { cache: "no-store" },
    ),
    "검증 정보를 불러오지 못했습니다.",
  );
}

export async function runVerification(
  questionId: string,
  runtime: Runtime = defaultRuntime,
): Promise<Record<string, unknown>> {
  return readJson(
    await runtime.fetch(
      `/api/resume/questions/${encodeURIComponent(questionId)}/verification`,
      { method: "POST" },
    ),
    "검증 실행에 실패했습니다.",
  );
}

export async function completeQuestion(input: {
  readonly appId: string;
  readonly questionId: string;
  readonly answer: string;
  readonly expectedAnswerRevision: number;
}, runtime: Runtime = defaultRuntime): Promise<{
  capture: FlowCaptureResult;
  verification: FlowVerification | null;
}> {
  const res = await runtime.fetch(
    `/api/resume/writing-workspaces/${input.appId}/questions/${input.questionId}/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer: input.answer,
        expectedAnswerRevision: input.expectedAnswerRevision,
      }),
    },
  );
  const json = await readJson(res, "문항 완료 처리에 실패했습니다.");
  return {
    capture: json.result.capture as FlowCaptureResult,
    verification: (json.result.verification ?? null) as FlowVerification | null,
  };
}

export async function retryDeferredCapture(input: {
  readonly appId: string;
  readonly taskId: string;
  readonly reopenApplication: boolean;
}, runtime: Runtime = defaultRuntime): Promise<FlowCaptureResult> {
  const res = await runtime.fetch(
    `/api/resume/writing-workspaces/${input.appId}/capture-tasks/${input.taskId}/retry`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reopenApplication: input.reopenApplication }),
    },
  );
  const json = await readJson(res, "경력 기억 추출 재시도에 실패했습니다.");
  return json.capture as FlowCaptureResult;
}

export async function overrideVerification(input: {
  questionId: string;
  verificationId: string;
  reason: string;
}, runtime: Runtime = defaultRuntime): Promise<{
  capture: FlowCaptureResult;
  verification: FlowVerification | null;
}> {
  const response = await runtime.fetch(
    `/api/resume/questions/${input.questionId}/verification/override`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verificationId: input.verificationId,
        reason: input.reason,
      }),
    },
  );
  const json = await readJson(response, "검증 예외 승인에 실패했습니다.");
  return {
    capture: json.result.capture as FlowCaptureResult,
    verification: (json.result.verification ?? null) as FlowVerification | null,
  };
}

export async function resolveCapture(input: {
  readonly appId: string;
  readonly captureId: string;
  readonly action: "apply" | "dismiss";
  readonly selectedPreviewIds: readonly string[];
}, runtime: Runtime = defaultRuntime): Promise<void> {
  const res = await runtime.fetch(
    `/api/resume/writing-workspaces/${input.appId}/captures/${input.captureId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        input.action === "apply"
          ? { action: "apply", selectedPreviewIds: input.selectedPreviewIds }
          : { action: "dismiss" },
      ),
    },
  );
  await readJson(res, "경험 반영에 실패했습니다.");
}

export async function completeApplication(
  appId: string,
  runtime: Runtime = defaultRuntime,
): Promise<void> {
  const res = await runtime.fetch(`/api/resume/applications/${appId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "DONE" }),
  });
  await readJson(res, "지원서 완료 처리에 실패했습니다.");
}

export async function fetchProductivity(
  appId: string,
  runtime: Runtime = defaultRuntime,
): Promise<FlowProductivity | null> {
  try {
    const res = await runtime.fetch(`/api/resume/writing-workspaces/${appId}`);
    const json = await readJson(res, "작업대 정보를 불러오지 못했습니다.");
    return (json.workspace?.productivity ?? null) as FlowProductivity | null;
  } catch {
    return null;
  }
}

type ApplicationApiQuestion = {
  readonly id: string;
  readonly questionText: string;
  readonly charLimit: number;
  readonly answer: string | null;
  readonly isCompleted: boolean;
  readonly relatedBricks: readonly { readonly brick: { readonly id: string } }[];
};

function toFlowQuestionStatus(
  answer: string | null,
  isCompleted: boolean,
): FlowQuestionStatus {
  if (isCompleted) return "completed";
  if (answer?.trim()) return "drafted";
  return "ready";
}

function toFlowCapture(capture: PendingExperienceCapture): FlowCapture {
  return {
    captureId: capture.id,
    questionId: capture.questionId,
    summary: capture.summary,
    items: capture.items,
    selectedPreviewIds: capture.items.map((item) => item.previewId),
    status: "pending" as FlowCaptureStatus,
    error: null,
  };
}

function toFlowStage(
  applicationStatus: string | undefined,
  completedCount: number,
  totalCount: number,
): FlowStage {
  if (applicationStatus === "WRITING") return "writing";
  if (applicationStatus === "DONE" || applicationStatus === "SUBMITTED") return "done";
  if (totalCount > 0 && completedCount === totalCount) return "done";
  return "writing";
}

export async function loadExistingApplication(
  appId: string,
  runtime: Runtime = defaultRuntime,
): Promise<ResumeWriteFlowState> {
  const [appRes, workspaceRes] = await Promise.all([
    runtime.fetch(`/api/resume/applications/${appId}`),
    runtime.fetch(`/api/resume/writing-workspaces/${appId}`),
  ]);
  const appJson = await readJson(appRes, "지원서를 불러오지 못했습니다.");
  const workspaceJson = await readJson(
    workspaceRes,
    "작업대 정보를 불러오지 못했습니다.",
  );
  const app = appJson.data as {
    readonly id: string;
    readonly companyName: string;
    readonly jobTitle: string;
    readonly jdText: string | null;
    readonly status: string;
    readonly questions: readonly ApplicationApiQuestion[];
  };
  const workspace = workspaceJson.workspace as ResumeWritingWorkspace & {
    readonly pendingCaptures: readonly PendingExperienceCapture[];
    readonly deferredCaptures: readonly Omit<
      FlowDeferredCaptureTask,
      "retryStatus" | "error"
    >[];
    readonly memoryReadiness: ResumeWriteFlowState["memoryReadiness"];
  };
  const auditStates = new Map(
    await Promise.all(
      app.questions.map(async (question) => {
        const [groundingResponse, verificationResponse] = await Promise.all([
          runtime.fetch(`/api/resume/questions/${question.id}/grounding`),
          runtime.fetch(`/api/resume/questions/${question.id}/verification`),
        ]);
        const [groundingJson, verificationJson] = await Promise.all([
          groundingResponse.json().catch(() => null),
          verificationResponse.json().catch(() => null),
        ]);
        const groundingRecord = groundingJson?.grounding;
        const verificationRecord = verificationJson?.verification;
        return [
          question.id,
          {
            grounding: groundingRecord
              ? {
                  id: groundingRecord.id,
                  experienceIds: (groundingRecord.experiences ?? []).map(
                    (item: { experienceId: string }) => item.experienceId,
                  ),
                  factIds: (groundingRecord.facts ?? []).map(
                    (item: { factId: string }) => item.factId,
                  ),
                  experiences: groundingRecord.experiences ?? [],
                  facts: groundingRecord.facts ?? [],
                }
              : null,
            verification: verificationRecord
              ? {
                  id: verificationRecord.id,
                  result: verificationRecord.result,
                  findings: verificationRecord.findings ?? [],
                }
              : null,
          },
        ] as const;
      }),
    ),
  );

  const questions: FlowQuestion[] = app.questions.map((question) => {
    const answer = question.answer ?? "";
    const status = toFlowQuestionStatus(answer, question.isCompleted);
    return {
      id: question.id,
      prompt: question.questionText,
      charLimit: question.charLimit,
      answer,
      status,
      aiAdvice: "",
      draftStatus: status === "ready" ? "idle" : "ready",
      draftError: null,
      linkedBrickIds: question.relatedBricks.map((link) => link.brick.id),
      messages: [],
      pendingPrompt: null,
      pendingSuggestion: null,
      suggestionStatus: "idle",
      suggestionError: null,
      saving: false,
      saveError: null,
      revisionCount: 0,
      deferredCapture: (workspace.deferredCaptures ?? []).some(
        (task) => task.questionId === question.id,
      ),
      grounding: auditStates.get(question.id)?.grounding ?? null,
      verification: auditStates.get(question.id)?.verification ?? null,
    };
  });

  const completedCount = questions.filter((q) => q.status === "completed").length;
  const stage = toFlowStage(app.status, completedCount, questions.length);
  const activeQuestionId =
    stage === "done"
      ? null
      : workspace.activeQuestionId ??
        questions.find((q) => q.status !== "completed")?.id ??
        null;

  return {
    ...createResumeWriteFlowState(),
    stage,
    appId,
    company: app.companyName ?? "",
    job: app.jobTitle ?? "",
    brief: parseResumeBrief(app.jdText),
    questions,
    activeQuestionId,
    captures: (workspace.pendingCaptures ?? []).map(toFlowCapture),
    deferredCaptures: (workspace.deferredCaptures ?? []).map((task) => ({
      ...task,
      retryStatus: "idle",
      error: null,
    })),
    memoryReadiness: workspace.memoryReadiness,
    productivity: workspace.productivity,
  };
}

export function createResumeWriteFlowApiClient(
  options: ResumeWriteFlowApiClientOptions = {},
) {
  const runtime = observedRuntime(options);
  return {
    organizeIntake: (input: Parameters<typeof organizeIntake>[0]) =>
      organizeIntake(input, runtime),
    loadUserBricks: () => loadUserBricks(runtime),
    startWorkspace: (input: Parameters<typeof startWorkspace>[0]) =>
      startWorkspace(input, runtime),
    generateDraft: (input: Parameters<typeof generateDraft>[0]) =>
      generateDraft(input, runtime),
    writeGroundedCareerAnswer: (input: Parameters<typeof generateDraft>[0]) =>
      generateDraft(input, runtime),
    requestRevision: (input: Parameters<typeof requestRevision>[0]) =>
      requestRevision(input, runtime),
    saveQuestionAnswer: (input: Parameters<typeof saveQuestionAnswer>[0]) =>
      saveQuestionAnswer(input, runtime),
    readGrounding: (questionId: string) => readGrounding(questionId, runtime),
    readVerification: (questionId: string) =>
      readVerification(questionId, runtime),
    runVerification: (questionId: string) =>
      runVerification(questionId, runtime),
    completeQuestion: (input: Parameters<typeof completeQuestion>[0]) =>
      completeQuestion(input, runtime),
    retryDeferredCapture: (
      input: Parameters<typeof retryDeferredCapture>[0],
    ) => retryDeferredCapture(input, runtime),
    overrideVerification: (
      input: Parameters<typeof overrideVerification>[0],
    ) => overrideVerification(input, runtime),
    resolveCapture: (input: Parameters<typeof resolveCapture>[0]) =>
      resolveCapture(input, runtime),
    completeApplication: (appId: string) =>
      completeApplication(appId, runtime),
    fetchProductivity: (appId: string) => fetchProductivity(appId, runtime),
    loadExistingApplication: (appId: string) =>
      loadExistingApplication(appId, runtime),
  };
}
