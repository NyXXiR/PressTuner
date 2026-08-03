"use client";

import { useMemo, useState } from "react";

import {
  createPressFlowApiClient,
  PressFlowApiError,
  type PressFlowExchange,
} from "@/lib/press/pressFlowApiClient";
import {
  cloneJsonSnapshot,
  diffJsonSnapshots,
  type JsonSnapshot,
  type SnapshotDiff,
} from "@/lib/press/pressPlaygroundTrace";
import {
  PRESS_DEV_RAG_FIXTURE_CONTENT,
  type DevRagFixtureState,
} from "@/domain/dev-rag-fixtures/contracts";

const SAMPLE_RAW_TEXT = PRESS_DEV_RAG_FIXTURE_CONTENT;
const SAMPLE_TONE = "formal" as const;

type PlaygroundState = {
  articleId: string | null;
  currentStatus: string | null;
  normalizedBrief: Record<string, unknown> | null;
  generatedDraft: Record<string, unknown> | null;
  grounding: Record<string, unknown> | null;
  verification: Record<string, unknown> | null;
  lastError: string | null;
};

type HistoryEntry = {
  id: number;
  action: string;
  exchange: PressFlowExchange;
  before: JsonSnapshot;
  after: JsonSnapshot;
  diff: SnapshotDiff[];
};

const initialState: PlaygroundState = {
  articleId: null,
  currentStatus: null,
  normalizedBrief: null,
  generatedDraft: null,
  grounding: null,
  verification: null,
  lastError: null,
};

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function verificationAllowsFinal(verification: Record<string, unknown> | null) {
  const freshness = verification?.freshness;
  const result = (
    verification?.verification as { result?: unknown } | undefined
  )?.result;
  return (
    freshness === "CURRENT" &&
    (result === "PASS" || result === "WARN")
  );
}

export function PressDomainInspectionMode({
  initialTeam,
  fixture,
}: {
  initialTeam: { id: string; name: string };
  fixture: DevRagFixtureState | null;
}) {
  const [state, setState] = useState<PlaygroundState>(initialState);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [nextStep, setNextStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const finalizable = verificationAllowsFinal(state.verification);

  const projection = useMemo(
    () => ({
      team: initialTeam,
      input: { rawText: SAMPLE_RAW_TEXT, tone: SAMPLE_TONE },
      article: {
        id: state.articleId,
        status: state.currentStatus,
      },
      brief: state.normalizedBrief,
      draft: state.generatedDraft,
      grounding: state.grounding,
      verification: state.verification,
      fixture,
      lastError: state.lastError,
    }),
    [fixture, initialTeam, state],
  );

  async function execute(
    action: string,
    operation: (
      api: ReturnType<typeof createPressFlowApiClient>,
    ) => Promise<Partial<PlaygroundState>>,
  ) {
    if (busy) return;
    setBusy(true);
    const before = cloneJsonSnapshot(projection);
    let exchange: PressFlowExchange | null = null;
    const api = createPressFlowApiClient({
      onExchange: (observed) => {
        exchange = observed;
      },
    });

    try {
      const patch = await operation(api);
      const nextState = { ...state, ...patch, lastError: null };
      const after = cloneJsonSnapshot({
        ...projection,
        article: {
          id: nextState.articleId,
          status: nextState.currentStatus,
        },
        brief: nextState.normalizedBrief,
        draft: nextState.generatedDraft,
        grounding: nextState.grounding,
        verification: nextState.verification,
        lastError: null,
      });
      setState(nextState);
      setNextStep((step) => step + 1);
      if (exchange) {
        setHistory((entries) => [
          ...entries,
          {
            id: entries.length + 1,
            action,
            exchange: exchange as PressFlowExchange,
            before,
            after,
            diff: diffJsonSnapshots(before, after),
          },
        ]);
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unknown request failure";
      const nextState = { ...state, lastError: message };
      const after = cloneJsonSnapshot({ ...projection, lastError: message });
      setState(nextState);
      const failedExchange =
        exchange ??
        (cause instanceof PressFlowApiError ? cause.exchange : null);
      if (failedExchange) {
        setHistory((entries) => [
          ...entries,
          {
            id: entries.length + 1,
            action,
            exchange: failedExchange,
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
      label: "1. Initialize real draft",
      run: () =>
        execute("Initialize real draft", async (api) => {
          const response = await api.initializeArticle({
            type: "PRESS_RELEASE",
            teamId: initialTeam.id,
          });
          return {
            articleId: response.articleId,
            currentStatus: "DRAFT",
          };
        }),
    },
    {
      label: "2. Normalize sample brief (real AI/quota)",
      run: () =>
        execute("Normalize sample brief", async (api) => ({
          normalizedBrief: await api.normalizeBrief(state.articleId!, {
            rawText: SAMPLE_RAW_TEXT,
            tone: SAMPLE_TONE,
          }),
        })),
    },
    {
      label: "3. Read grounding, candidates, and accepted facts",
      run: () =>
        execute("Read grounding before generation", async (api) => ({
          grounding: await api.readGrounding(state.articleId!),
        })),
    },
    {
      label: "4. Accept the server fixture candidate",
      run: () =>
        execute("Accept fixture grounding candidate", async (api) => {
          const candidates = Array.isArray(state.grounding?.evidenceCandidates)
            ? state.grounding.evidenceCandidates
            : [];
          const candidate = candidates.find((item) => {
            if (!item || typeof item !== "object") return false;
            const document = (item as { document?: unknown }).document;
            return (
              document &&
              typeof document === "object" &&
              (document as { originalName?: unknown }).originalName ===
                fixture?.summary
            );
          }) as { id?: unknown } | undefined;
          if (typeof candidate?.id !== "string") {
            throw new Error(
              "Fixture candidate was not discovered. Mount the Press fixture and re-read grounding.",
            );
          }
          await api.decideGroundingCandidate(
            state.articleId!,
            candidate.id,
            "ACCEPTED",
          );
          return {
            grounding: await api.readGrounding(state.articleId!),
          };
        }),
    },
    {
      label: "5. Generate article (real AI/quota)",
      run: () =>
        execute("Generate article", async (api) => {
          const brief = state.normalizedBrief ?? {};
          return {
            generatedDraft: await api.generateArticle(state.articleId!, {
              serviceName:
                typeof brief.serviceName === "string"
                  ? brief.serviceName
                  : undefined,
              announceType:
                typeof brief.announceType === "string"
                  ? brief.announceType
                  : "기타",
              oneLiner:
                typeof brief.oneLiner === "string"
                  ? brief.oneLiner
                  : undefined,
              points: Array.isArray(brief.points)
                ? brief.points.filter(
                    (point): point is string => typeof point === "string",
                  )
                : [],
              quoteWho:
                typeof brief.quoteWho === "string" ? brief.quoteWho : undefined,
              quoteMessage:
                typeof brief.quoteMessage === "string"
                  ? brief.quoteMessage
                  : undefined,
              eventAt:
                typeof brief.eventAt === "string" ? brief.eventAt : undefined,
              publishAt:
                typeof brief.publishAt === "string"
                  ? brief.publishAt
                  : undefined,
              rawText: SAMPLE_RAW_TEXT,
              tone: SAMPLE_TONE,
            }),
          };
        }),
    },
    {
      label: "6. Re-read grounding",
      run: () =>
        execute("Read grounding after generation", async (api) => ({
          grounding: await api.readGrounding(state.articleId!),
        })),
    },
    {
      label: "7. Read current verification",
      run: () =>
        execute("Read verification", async (api) => ({
          verification: await api.readVerification(
            state.articleId!,
            initialTeam.id,
          ),
        })),
    },
    {
      label: "8. Run verification (real AI/quota)",
      run: () =>
        execute("Run verification", async (api) => ({
          verification: await api.runVerification(state.articleId!, {
            teamId: initialTeam.id,
          }),
        })),
    },
    {
      label: "9. Re-read verification freshness",
      run: () =>
        execute("Re-read verification freshness", async (api) => ({
          verification: await api.readVerification(
            state.articleId!,
            initialTeam.id,
          ),
        })),
    },
    {
      label: "10. Mark IN_PROGRESS (real status mutation)",
      run: () =>
        execute("Mark IN_PROGRESS", async (api) => {
          await api.updateStatus(state.articleId!, {
            status: "IN_PROGRESS",
            teamId: initialTeam.id,
          });
          return { currentStatus: "IN_PROGRESS" };
        }),
    },
    {
      label: "11. Finalize through PATCH status (real terminal mutation)",
      run: () => {
        if (
          !confirmation ||
          !finalizable ||
          !window.confirm(
            "FINAL is a real terminal transition. Finalize this QA article?",
          )
        ) {
          return Promise.resolve();
        }
        return execute("Finalize through PATCH status", async (api) => {
          await api.updateStatus(state.articleId!, {
            status: "FINAL",
            teamId: initialTeam.id,
          });
          return { currentStatus: "FINAL" };
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
        <h1 className="mt-2 text-3xl font-extrabold">Press API playground</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">
          These are real authenticated operations for {initialTeam.name}.
          Initialization, normalization, generation, verification, and status
          changes mutate real QA-team data. Generation and verification consume
          real quota and configured AI usage. AI output and latency are not
          deterministic.
        </p>
      </header>

      <section className="grid gap-4 border border-border bg-card p-4 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-bold">Deterministic input</h2>
          <pre className="mt-2 whitespace-pre-wrap text-xs leading-5">
            {SAMPLE_RAW_TEXT}
          </pre>
          <p className="mt-2 text-xs">Tone: {SAMPLE_TONE}</p>
        </div>
        <details open>
          <summary className="cursor-pointer text-sm font-bold">
            Current state
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
                index !== nextStep ||
                (index === 10 && (!confirmation || !finalizable)) ||
                (index > 0 && !fixture?.mounted)
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
            checked={confirmation}
            onChange={(event) => setConfirmation(event.target.checked)}
          />
          <span>
            I understand FINAL is real and irreversible in this playground.
            FINAL is enabled only after the latest read reports CURRENT PASS or
            WARN; the server remains authoritative.
          </span>
        </label>
      </section>

      <section>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">In-memory exchange history</h2>
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
              <p className="mt-2 text-xs text-muted-foreground">
                {entry.exchange.timestamp}
              </p>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <TraceBlock label="Sanitized request" value={entry.exchange.request} />
                <TraceBlock label="Parsed response" value={entry.exchange.response} />
                <TraceBlock label="Before snapshot" value={entry.before} />
                <TraceBlock label="After snapshot" value={entry.after} />
              </div>
              <TraceBlock label="Stable field diff" value={entry.diff} />
            </details>
          ))}
          {!history.length ? (
            <p className="text-sm text-muted-foreground">
              No local traces yet. Clearing this list sends no request.
            </p>
          ) : null}
        </div>
      </section>
    </section>
  );
}

function TraceBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="mt-3 min-w-0">
      <h3 className="text-xs font-bold">{label}</h3>
      <pre className="mt-1 max-h-80 overflow-auto border border-border bg-background p-3 text-xs">
        {json(value)}
      </pre>
    </div>
  );
}
