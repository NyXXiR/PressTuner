"use client";

import { useMemo, useState } from "react";

import type { DevRagFixtureState } from "@/domain/dev-rag-fixtures/contracts";
import type {
  FlowCaptureResult,
  FlowGrounding,
  FlowOrganizedIntake,
} from "@/domain/resume-writing/flowMachine";
import {
  createResumeWriteFlowApiClient,
  FlowApiError,
  type ResumeWriteFlowExchange,
} from "@/lib/resume/resumeWriteFlowApiClient";
import {
  cloneJsonSnapshot,
  diffJsonSnapshots,
  type JsonSnapshot,
  type SnapshotDiff,
} from "@/lib/press/pressPlaygroundTrace";

const SAMPLE_POSTING = `브리프플로 제품 성장 매니저 채용
주요 업무: 사용자 인터뷰와 퍼널 분석으로 온보딩 병목을 정의하고 실험을 설계합니다.
자격 요건: SQL 기반 데이터 분석, 제품 협업 경험, 정량 성과를 근거로 설명하는 역량.
자기소개서 문항: 데이터 기반으로 제품 성과를 개선한 경험을 구체적인 수치와 함께 작성해 주세요.`;
const FALLBACK_QUESTION =
  "데이터 기반으로 제품 성과를 개선한 경험을 구체적인 수치와 함께 작성해 주세요.";

type ResumePlaygroundState = {
  organized: FlowOrganizedIntake | null;
  appId: string | null;
  questionId: string | null;
  prompt: string | null;
  answer: string;
  answerRevision: number;
  grounding: FlowGrounding | null;
  verification: Record<string, unknown> | null;
  capture: FlowCaptureResult | null;
  captureResolved: boolean;
  applicationCompleted: boolean;
  lastError: string | null;
};

type History = {
  id: number;
  action: string;
  exchange: ResumeWriteFlowExchange;
  before: JsonSnapshot;
  after: JsonSnapshot;
  diff: SnapshotDiff[];
};

const initialState: ResumePlaygroundState = {
  organized: null,
  appId: null,
  questionId: null,
  prompt: null,
  answer: "",
  answerRevision: 0,
  grounding: null,
  verification: null,
  capture: null,
  captureResolved: false,
  applicationCompleted: false,
  lastError: null,
};

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function currentPassOrWarn(verification: Record<string, unknown> | null) {
  const nested =
    verification?.verification &&
    typeof verification.verification === "object"
      ? (verification.verification as Record<string, unknown>)
      : verification;
  const current =
    verification?.current && typeof verification.current === "object"
      ? (verification.current as Record<string, unknown>)
      : null;
  const isCurrent =
    verification?.freshness === "CURRENT" ||
    (Boolean(nested) &&
      Boolean(current) &&
      nested?.answerHash === current?.answerHash &&
      nested?.answerRevision === current?.answerRevision &&
      nested?.careerMemoryVersion === current?.careerMemoryVersion);
  return (
    isCurrent &&
    (nested?.result === "PASS" || nested?.result === "WARN")
  );
}

export function ResumeDomainInspectionMode({
  fixture,
}: {
  fixture: DevRagFixtureState | null;
}) {
  const [state, setState] = useState(initialState);
  const [history, setHistory] = useState<History[]>([]);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const projection = useMemo(
    () => ({ fixture, input: SAMPLE_POSTING, ...state }),
    [fixture, state],
  );

  async function execute(
    action: string,
    operation: (
      api: ReturnType<typeof createResumeWriteFlowApiClient>,
    ) => Promise<Partial<ResumePlaygroundState>>,
  ) {
    if (busy) return;
    setBusy(true);
    const before = cloneJsonSnapshot(projection);
    const exchanges: ResumeWriteFlowExchange[] = [];
    const api = createResumeWriteFlowApiClient({
      onExchange: (exchange) => exchanges.push(exchange),
    });
    try {
      const patch = await operation(api);
      const next = { ...state, ...patch, lastError: null };
      const after = cloneJsonSnapshot({ fixture, input: SAMPLE_POSTING, ...next });
      setState(next);
      setStep((value) => value + 1);
      setHistory((entries) => [
        ...entries,
        ...exchanges.map((exchange, index) => ({
          id: entries.length + index + 1,
          action,
          exchange,
          before,
          after,
          diff: diffJsonSnapshots(before, after),
        })),
      ]);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unknown request failure";
      setState((current) => ({ ...current, lastError: message }));
      const exchange =
        cause instanceof FlowApiError
          ? exchanges.at(-1)
          : exchanges.at(-1);
      if (exchange) {
        const after = cloneJsonSnapshot({ ...projection, lastError: message });
        setHistory((entries) => [
          ...entries,
          {
            id: entries.length + 1,
            action,
            exchange,
            before,
            after,
            diff: diffJsonSnapshots(before, after),
          },
        ]);
      }
    } finally {
      setBusy(false);
    }
  }

  const actions = [
    {
      label: "1. Organize fixed intake (real AI/quota)",
      run: () =>
        execute("Organize intake", async (api) => ({
          organized: await api.organizeIntake({
            rawText: SAMPLE_POSTING,
            postingUrl: "",
          }),
        })),
    },
    {
      label: "2. Create application and first question",
      run: () =>
        execute("Start workspace", async (api) => {
          const organized = state.organized!;
          const first = organized.questions[0] ?? {
            prompt: FALLBACK_QUESTION,
            charLimit: 700,
          };
          const workspace = await api.startWorkspace({
            company: organized.company || "브리프플로",
            job: organized.job || "제품 성장 매니저",
            brief: organized.brief,
            questions: [first],
          });
          const question = workspace.questions[0];
          if (!question) throw new Error("Created workspace has no question");
          return {
            appId: workspace.appId,
            questionId: question.id,
            prompt: question.prompt,
          };
        }),
    },
    {
      label: "3. Generate grounded career answer (real AI/quota)",
      run: () =>
        execute("Generate grounded answer", async (api) => {
          const result = await api.writeGroundedCareerAnswer({
            questionId: state.questionId!,
            instruction:
              "QA fixture의 브리프플로 온보딩 경험과 정량 성과만 사용해 STAR 구조로 작성해 주세요.",
            charLimit: 700,
          });
          return { answer: result.text, grounding: result.grounding };
        }),
    },
    {
      label: "4. Save generated answer",
      run: () =>
        execute("Save answer", async (api) => ({
          answerRevision: (
            await api.saveQuestionAnswer({
              questionId: state.questionId!,
              answer: state.answer,
              isCompleted: false,
            })
          ).answerRevision,
        })),
    },
    {
      label: "5. Read grounding",
      run: () =>
        execute("Read grounding", async (api) => ({
          grounding: await api.readGrounding(state.questionId!),
        })),
    },
    {
      label: "6. Read current verification",
      run: () =>
        execute("Read verification", async (api) => ({
          verification: await api.readVerification(state.questionId!),
        })),
    },
    {
      label: "7. Run verification (real AI/quota)",
      run: () =>
        execute("Run verification", async (api) => ({
          verification: await api.runVerification(state.questionId!),
        })),
    },
    {
      label: "8. Re-read verification freshness",
      run: () =>
        execute("Re-read verification", async (api) => ({
          verification: await api.readVerification(state.questionId!),
        })),
    },
    {
      label: "9. Complete question (authoritative endpoint)",
      run: () => {
        if (
          !confirmed ||
          !currentPassOrWarn(state.verification) ||
          !window.confirm(
            "Question completion is a real mutation and may create a career-memory capture. Continue?",
          )
        ) {
          return Promise.resolve();
        }
        return execute("Complete question", async (api) => {
          const result = await api.completeQuestion({
            appId: state.appId!,
            questionId: state.questionId!,
            answer: state.answer,
            expectedAnswerRevision: state.answerRevision,
          });
          return {
            capture: result.capture,
            verification: result.verification as unknown as Record<
              string,
              unknown
            >,
            captureResolved: result.capture.kind === "none",
          };
        });
      },
    },
    {
      label: "10. Resolve/dismiss capture or retry deferred capture",
      run: () =>
        execute("Resolve capture", async (api) => {
          const capture = state.capture;
          if (!capture || capture.kind === "none") {
            return { captureResolved: true };
          }
          if (capture.kind === "pending_approval") {
            await api.resolveCapture({
              appId: state.appId!,
              captureId: capture.captureId,
              action: "dismiss",
              selectedPreviewIds: [],
            });
            return { captureResolved: true };
          }
          if (!capture.taskId) {
            throw new Error(
              `Capture is deferred (${capture.reason}) without a retry task. Inspect the deferred state.`,
            );
          }
          const retried = await api.retryDeferredCapture({
            appId: state.appId!,
            taskId: capture.taskId,
            reopenApplication: false,
          });
          return {
            capture: retried,
            captureResolved: retried.kind === "none",
          };
        }),
    },
    {
      label: "11. Complete application through guarded status API",
      run: () => {
        if (
          !state.captureResolved ||
          !window.confirm("Complete this real QA application?")
        ) {
          return Promise.resolve();
        }
        return execute("Complete application", async (api) => {
          const workspace = await api.loadExistingApplication(state.appId!);
          const ready =
            workspace.questions.length > 0 &&
            workspace.questions.every(
              (question) => question.status === "completed",
            ) &&
            workspace.captures.length === 0;
          if (!ready) {
            throw new Error(
              "Workspace is not ready: complete every question and resolve all capture work first.",
            );
          }
          await api.completeApplication(state.appId!);
          return { applicationCompleted: true };
        });
      },
    },
  ];

  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-primary">
          Development tool
        </p>
        <h1 className="mt-2 text-3xl font-extrabold">Resume API playground</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">
          This runs authenticated production services against persistent QA
          data. AI calls consume real quota. Question and application completion
          can create retained evidence and may be irreversible.
        </p>
      </header>

      <section className="grid gap-4 border border-border bg-card p-4 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-bold">Fixed Korean intake</h2>
          <pre className="mt-2 whitespace-pre-wrap text-xs leading-5">
            {SAMPLE_POSTING}
          </pre>
        </div>
        <details open>
          <summary className="cursor-pointer text-sm font-bold">
            Current state and IDs/revisions
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto text-xs">
            {json(projection)}
          </pre>
        </details>
      </section>

      {state.lastError ? (
        <p className="border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {state.lastError}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Sequential real operations</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              disabled={
                busy ||
                index !== step ||
                (index > 0 && !fixture?.mounted) ||
                (index === 8 &&
                  (!confirmed || !currentPassOrWarn(state.verification))) ||
                (index === 10 && !state.captureResolved)
              }
              onClick={() => void action.run()}
              className="border border-border bg-card px-4 py-3 text-left text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {action.label}
            </button>
          ))}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            I understand completion is real. Question completion is enabled
            only after a fresh CURRENT PASS/WARN response; the server remains
            authoritative.
          </span>
        </label>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Sanitized exchange history</h2>
          <button
            type="button"
            onClick={() => setHistory([])}
            className="border border-border px-3 py-2 text-xs font-bold"
          >
            Clear local history
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {history.map((entry) => (
            <details key={entry.id} className="border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-bold">
                {entry.id}. {entry.action} — {entry.exchange.method}{" "}
                {entry.exchange.path} — HTTP{" "}
                {entry.exchange.status ?? "network failure"}
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto text-xs">
                {json({
                  request: entry.exchange.request,
                  response: entry.exchange.response,
                  before: entry.before,
                  after: entry.after,
                  diff: entry.diff,
                })}
              </pre>
            </details>
          ))}
        </div>
      </section>
    </section>
  );
}
