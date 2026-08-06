"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Braces,
  Check,
  ChevronRight,
  Circle,
  Copy,
  ExternalLink,
  LoaderCircle,
  Play,
  RotateCcw,
  X,
} from "lucide-react";

import {
  buildGeneratedPlain,
  evaluatePressDraftQuality,
  type PressApiQualityCheck,
} from "@/lib/devPressApiPlayground";
import { derivePressPlaygroundHandoff } from "@/domain/press-ai-debugger/processExecutor";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";

type StepId =
  | "init"
  | "normalize"
  | "generate"
  | "polish"
  | "repolish"
  | "save"
  | "verify"
  | "finalize"
  | "article"
  | "usage";

type StepDefinition = {
  id: StepId;
  label: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  cost?: number;
  needsArticle?: boolean;
  hasBody?: boolean;
};

type StepResult = {
  ok: boolean;
  status: number | null;
  elapsedMs: number;
  response: unknown;
  error?: string;
  checks: PressApiQualityCheck[];
};

type Bodies = Record<StepId, string>;

const PRESS_MEMO = [
  "프레스튜너는 기업 홍보팀을 위한 AI 보도자료 편집 서비스 ‘브리핑플로우 프레스 3.0’을 2026년 10월 6일 출시한다.",
  "2026년 8월 국내 스타트업 홍보팀 20곳을 대상으로 비공개 테스트를 진행했다.",
  "보도자료 한 건의 평균 초안 작성 시간은 150분에서 50분으로 줄었다.",
  "이 수치는 참여 팀이 직접 기록한 작업 시간의 단순 평균이며 외부 기관의 검증을 거치지 않았고 대조군을 두지 않았다.",
  "프레스튜너는 서울에 기반을 둔 B2B 소프트웨어 기업이다.",
  "김민서 대표는 ‘문장 작성 시간을 줄이고 사실 판단에 집중하도록 설계했다’고 말했다.",
].join("\n");

const STEP_DEFINITIONS: StepDefinition[] = [
  ...pressCreationProcess.nodes.map((node) => ({
    id: node.client!.stepId,
    label: node.label,
    method: node.client!.method,
    path: node.client!.path,
    cost: node.quotaUnits,
    needsArticle: node.client!.needsArticle,
    hasBody: node.client!.hasBody,
  })),
  {
    id: "save",
    label: "재작성 원고 저장",
    method: "POST",
    path: "/api/articles/{articleId}/save",
    needsArticle: true,
    hasBody: true,
  },
  {
    id: "verify",
    label: "최신 원고 검증",
    method: "POST",
    path: "/api/articles/{articleId}/verification",
    needsArticle: true,
    hasBody: true,
  },
  {
    id: "finalize",
    label: "최종 완료",
    method: "PATCH",
    path: "/api/articles/{articleId}/status",
    needsArticle: true,
    hasBody: true,
  },
  {
    id: "article",
    label: "완성 원고 조회",
    method: "GET",
    path: "/api/articles/{articleId}",
    needsArticle: true,
  },
  {
    id: "usage",
    label: "FREE 사용량 조회",
    method: "GET",
    path: "/api/articles/usage",
  },
];

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function initialBodies(): Bodies {
  return {
    init: pretty({ type: "PRESS_RELEASE" }),
    normalize: pretty({
      rawText: PRESS_MEMO,
      tone: "formal",
      quotaMode: "simplified",
    }),
    generate: pretty({
      announceType: "서비스 출시",
      serviceName: "",
      oneLiner: "",
      points: [],
      quoteWho: "",
      quoteMessage: "",
      tone: "formal",
      rawText: PRESS_MEMO,
      quotaMode: "simplified",
    }),
    polish: pretty({
      title: "",
      plain: "",
      userInstruction:
        "수치의 측정 기준과 제한사항 누락, 근거보다 강해진 표현, 기사체를 점검해줘.",
      quotaMode: "simplified",
    }),
    repolish: pretty({
      selectedNoteIds: [],
      userInstruction:
        "확정 사실과 모든 조건을 유지하며 선택한 제안만 반영해줘.",
      quotaMode: "simplified",
    }),
    save: pretty({
      title: "",
      plain: "",
      harnessAction: {
        type: "apply_pending_rewrite",
        appliedAt: new Date().toISOString(),
      },
    }),
    verify: "{}",
    finalize: pretty({ status: "FINAL" }),
    article: "",
    usage: "",
  };
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object"
    ? (value as Record<string, any>)
    : {};
}

function methodTone(method: StepDefinition["method"]) {
  if (method === "GET") return "bg-sky-50 text-sky-700";
  if (method === "PATCH") return "bg-violet-50 text-violet-700";
  return "bg-emerald-50 text-emerald-700";
}

function normalizeChecks(json: Record<string, any>): PressApiQualityCheck[] {
  const pointText = Array.isArray(json.points) ? json.points.join(" ") : "";
  const fields = [
    ["service-name", "서비스명 추출", json.serviceName],
    ["one-liner", "한 줄 요약 추출", json.oneLiner],
    ["quote-who", "인용자 추출", json.quoteWho],
    ["quote-message", "인용문 추출", json.quoteMessage],
  ] as const;
  return [
    ...fields.map(([id, label, value]) => ({
      id,
      label,
      pass: typeof value === "string" && value.trim().length > 0,
      detail:
        typeof value === "string" && value.trim()
          ? value
          : "응답 값이 비어 있음",
    })),
    {
      id: "measurement-caveats",
      label: "측정 조건·제한사항 보존",
      pass:
        pointText.includes("단순 평균") &&
        pointText.includes("대조군") &&
        /외부.*검증|검증.*않/.test(pointText),
      detail: pointText || "points가 비어 있음",
    },
  ];
}

function polishChecks(
  json: Record<string, any>,
  basePlain: string,
): PressApiQualityCheck[] {
  const notes = Array.isArray(json.notes) ? json.notes : [];
  const seen = new Set<string>();
  return [
    {
      id: "actionable-notes",
      label: "실행 가능한 첨삭 제안 존재",
      pass: notes.length > 0,
      detail: `${notes.length}개`,
    },
    ...notes.map((note: Record<string, any>, index: number) => {
      const quote = String(note.quote || note.original || "");
      const replacement = String(note.replacement || note.suggestion || "");
      const key = `${quote}::${String(note.note || note.reason || "")}::${replacement}`;
      const pass =
        Boolean(note.id) &&
        (!quote || basePlain.includes(quote)) &&
        (!replacement || replacement !== quote) &&
        !seen.has(key);
      seen.add(key);
      return {
        id: `note-${note.id || index}`,
        label: `첨삭 제안 ${index + 1} 유효성`,
        pass,
        detail: pass ? "본문 기반의 고유 제안" : "무효·중복 또는 본문 밖 인용",
      };
    }),
  ];
}

export default function PressApiPlaygroundClient({
  teamName,
  userLabel,
}: {
  teamName: string;
  userLabel: string;
}) {
  const firstBodies = useMemo(() => initialBodies(), []);
  const [bodies, setBodies] = useState<Bodies>(firstBodies);
  const bodiesRef = useRef(firstBodies);
  const [articleId, setArticleId] = useState("");
  const articleIdRef = useRef("");
  const [results, setResults] = useState<Partial<Record<StepId, StepResult>>>(
    {},
  );
  const [selectedStepId, setSelectedStepId] = useState<StepId>("init");
  const [activeStepId, setActiveStepId] = useState<StepId | null>(null);
  const [runMode, setRunMode] = useState<"single" | "all" | null>(null);

  const selectedStep =
    STEP_DEFINITIONS.find((step) => step.id === selectedStepId) ?? STEP_DEFINITIONS[0];
  const selectedResult = results[selectedStepId];

  function updateBody(stepId: StepId, value: string) {
    bodiesRef.current = { ...bodiesRef.current, [stepId]: value };
    setBodies(bodiesRef.current);
  }

  function updateArticleId(value: string) {
    articleIdRef.current = value;
    setArticleId(value);
  }

  function resetScreen() {
    const next = initialBodies();
    bodiesRef.current = next;
    articleIdRef.current = "";
    setBodies(next);
    setArticleId("");
    setResults({});
    setSelectedStepId("init");
  }

  function stepUrl(step: StepDefinition) {
    return step.path.replace("{articleId}", articleIdRef.current);
  }

  function applyProcessHandoff(stepId: StepId, responseValue: unknown) {
    const node = pressCreationProcess.nodes.find((entry) => entry.client?.stepId === stepId);
    if (!node) return;
    const priorInput = asRecord(JSON.parse(bodiesRef.current[stepId] || "{}"));
    const handoff = derivePressPlaygroundHandoff(node.id, responseValue, priorInput);
    if ("articleId" in handoff && handoff.articleId) updateArticleId(handoff.articleId);
    if ("nextStepId" in handoff && handoff.nextStepId && handoff.body) updateBody(handoff.nextStepId, pretty(handoff.body));
  }

  function qualityChecks(stepId: StepId, responseValue: unknown) {
    const json = asRecord(responseValue);
    if (stepId === "normalize") return normalizeChecks(json);
    if (stepId === "generate") {
      return evaluatePressDraftQuality(buildGeneratedPlain(json));
    }
    if (stepId === "polish") {
      const polishRequest = asRecord(
        JSON.parse(bodiesRef.current.polish || "{}"),
      );
      return polishChecks(json, String(polishRequest.plain || ""));
    }
    if (stepId === "repolish") {
      return evaluatePressDraftQuality(
        String(json.revisedPlain || json.plain || ""),
      );
    }
    if (stepId === "verify") {
      const verification = asRecord(json.verification);
      const findings = Array.isArray(verification.findings)
        ? verification.findings
        : [];
      return [
        {
          id: "verification-result",
          label: "검증 결과 계약",
          pass: ["PASS", "WARN", "BLOCK"].includes(verification.result),
          detail: String(verification.result || "결과 없음"),
        },
        {
          id: "korean-findings",
          label: "검증 설명 한국어 표시",
          pass: findings.every((finding: Record<string, any>) =>
            /[가-힣]/.test(
              `${String(finding.explanation || "")} ${String(finding.message || "")}`,
            ),
          ),
          detail: `${findings.length}개 finding`,
        },
      ];
    }
    if (stepId === "article") {
      const article = asRecord(json.article);
      const bodyJson = asRecord(article.bodyJson);
      const paragraphs = Array.isArray(bodyJson.paragraphs)
        ? bodyJson.paragraphs.map((item: Record<string, any>) =>
            String(item.text || ""),
          )
        : [];
      const pressExtra = asRecord(article.pressExtra);
      return [
        {
          id: "article-final",
          label: "FINAL 상태",
          pass: article.status === "FINAL",
          detail: String(article.status || "상태 없음"),
        },
        {
          id: "canonical-body",
          label: "본문 직렬화 중복 없음",
          pass:
            pressExtra.lead == null &&
            pressExtra.fact == null &&
            new Set(paragraphs).size === paragraphs.length,
          detail: `${paragraphs.length}개 문단 / ${new Set(paragraphs).size}개 고유`,
        },
      ];
    }
    if (stepId === "usage") {
      const plan = asRecord(json.plan);
      return [
        {
          id: "free-unlimited",
          label: "FREE Press 무제한",
          pass:
            plan.effectivePlanType !== "FREE" || plan.unlimited === true,
          detail: `${String(plan.effectivePlanType || "UNKNOWN")} / unlimited=${String(plan.unlimited)}`,
        },
      ];
    }
    return [];
  }

  async function executeStep(step: StepDefinition) {
    setSelectedStepId(step.id);
    setActiveStepId(step.id);
    const startedAt = performance.now();
    try {
      if (step.needsArticle && !articleIdRef.current.trim()) {
        throw new Error("articleId가 없습니다. 문서 초기화를 먼저 실행하세요.");
      }
      let body: unknown;
      if (step.hasBody) {
        try {
          body = JSON.parse(bodiesRef.current[step.id] || "{}");
        } catch {
          throw new Error("요청 JSON 문법이 올바르지 않습니다.");
        }
      }
      const response = await fetch(stepUrl(step), {
        method: step.method,
        credentials: "same-origin",
        headers: step.hasBody
          ? { "Content-Type": "application/json" }
          : undefined,
        body: step.hasBody ? JSON.stringify(body) : undefined,
      });
      const responseText = await response.text();
      let responseValue: unknown = responseText;
      try {
        responseValue = responseText ? JSON.parse(responseText) : null;
      } catch {
        // Keep a non-JSON response visible in the console.
      }
      const result: StepResult = {
        ok: response.ok,
        status: response.status,
        elapsedMs: Math.round(performance.now() - startedAt),
        response: responseValue,
        checks: response.ok ? qualityChecks(step.id, responseValue) : [],
        ...(!response.ok
          ? {
              error:
                String(
                  asRecord(responseValue).message ||
                    asRecord(responseValue).error ||
                    `HTTP ${response.status}`,
                ),
            }
          : {}),
      };
      setResults((current) => ({ ...current, [step.id]: result }));
      if (!response.ok) throw new Error(result.error);
      applyProcessHandoff(step.id, responseValue);
      return responseValue;
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "요청 실행에 실패했습니다.";
      setResults((current) => {
        if (current[step.id]) return current;
        return {
          ...current,
          [step.id]: {
            ok: false,
            status: null,
            elapsedMs: Math.round(performance.now() - startedAt),
            response: null,
            error: message,
            checks: [],
          },
        };
      });
      throw caught;
    } finally {
      setActiveStepId(null);
    }
  }

  async function runSingle(step: StepDefinition) {
    if (runMode) return;
    setRunMode("single");
    try {
      await executeStep(step);
    } catch {
      // The selected result panel contains the actionable error.
    } finally {
      setRunMode(null);
    }
  }

  async function runAll() {
    if (runMode) return;
    setRunMode("all");
    setResults({});
    updateArticleId("");
    try {
      for (const step of STEP_DEFINITIONS) {
        await executeStep(step);
      }
    } catch {
      // Stop at the first HTTP or local contract failure.
    } finally {
      setRunMode(null);
    }
  }

  const completedCount = Object.keys(results).length;
  const passedCount = Object.values(results).filter((result) => result?.ok).length;
  const quality = Object.values(results).flatMap(
    (result) => result?.checks ?? [],
  );
  const qualityPassed = quality.filter((check) => check.pass).length;

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-7 lg:px-6">
      <section className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Development-only API Playground</div>
            <p className="mt-1 leading-6">
              현재 로그인 세션과 팀을 사용해 실제 문서와 AI 사용량을
              생성합니다. 운영 환경에서는 기본적으로 404 처리됩니다.
            </p>
          </div>
        </div>
      </section>

      <header className="mt-6 flex flex-col gap-4 border-b border-border pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Braces className="h-4 w-4" />
            PressTuner developer tool
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            `/press/new` API Playground
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {userLabel} · {teamName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/press/new"
            target="_blank"
            className="inline-flex h-10 items-center gap-2 border border-border px-3 text-sm font-semibold hover:bg-muted"
          >
            실제 화면
            <ExternalLink className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={resetScreen}
            disabled={Boolean(runMode)}
            className="inline-flex h-10 items-center gap-2 border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            화면 초기화
          </button>
          <button
            type="button"
            onClick={() => void runAll()}
            disabled={Boolean(runMode)}
            className="inline-flex h-10 items-center gap-2 bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50"
          >
            {runMode === "all" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            전체 실행
          </button>
        </div>
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border border-border bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">API 단계</div>
          <div className="mt-1 text-lg font-bold">
            {completedCount}/{STEP_DEFINITIONS.length}
          </div>
        </div>
        <div className="border border-border bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">HTTP 성공</div>
          <div className="mt-1 text-lg font-bold text-emerald-700">
            {passedCount}/{completedCount || 0}
          </div>
        </div>
        <div className="border border-border bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">품질 검사</div>
          <div className="mt-1 text-lg font-bold">
            {qualityPassed}/{quality.length}
          </div>
        </div>
        <label className="border border-border bg-card px-4 py-3">
          <span className="text-xs text-muted-foreground">articleId</span>
          <input
            value={articleId}
            onChange={(event) => updateArticleId(event.target.value)}
            placeholder="초기화 후 자동 입력"
            disabled={Boolean(runMode)}
            className="mt-1 h-7 w-full bg-transparent font-mono text-sm font-semibold outline-none placeholder:font-sans placeholder:font-normal"
          />
        </label>
      </section>

      <div className="mt-5 grid min-h-[680px] gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <aside className="border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            실행 순서
          </div>
          <div className="divide-y divide-border">
            {STEP_DEFINITIONS.map((step, index) => {
              const result = results[step.id];
              const active = activeStepId === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setSelectedStepId(step.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                    selectedStepId === step.id ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-bold">
                    {active ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : result?.ok ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : result ? (
                      <X className="h-4 w-4 text-red-600" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${methodTone(step.method)}`}
                      >
                        {step.method}
                      </span>
                      <span className="truncate text-sm font-semibold">
                        {step.label}
                      </span>
                    </span>
                    <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                      {step.path}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] text-muted-foreground">
                    {typeof step.cost === "number" ? `${step.cost} units` : ""}
                    {result ? (
                      <span className="mt-0.5 block">
                        {result.status ?? "LOCAL"} · {result.elapsedMs}ms
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-1 font-mono text-xs font-bold ${methodTone(selectedStep.method)}`}
                >
                  {selectedStep.method}
                </span>
                <h2 className="font-bold">{selectedStep.label}</h2>
              </div>
              <div className="mt-2 break-all font-mono text-xs text-muted-foreground">
                {selectedStep.path.replace(
                  "{articleId}",
                  articleId || "{articleId}",
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void runSingle(selectedStep)}
              disabled={Boolean(runMode)}
              className="inline-flex h-9 items-center gap-2 bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50"
            >
              {activeStepId === selectedStep.id ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              이 단계 실행
            </button>
          </div>

          <div className="grid min-h-[600px] divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="min-w-0 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Request JSON
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  다음 단계는 직전 응답으로 자동 갱신
                </span>
              </div>
              {selectedStep.hasBody ? (
                <textarea
                  value={bodies[selectedStep.id]}
                  onChange={(event) =>
                    updateBody(selectedStep.id, event.target.value)
                  }
                  spellCheck={false}
                  disabled={Boolean(runMode)}
                  className="mt-3 h-[520px] w-full resize-y border border-border bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100 outline-none focus:border-slate-500 disabled:opacity-70"
                />
              ) : (
                <div className="mt-3 flex h-[520px] items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
                  이 GET 요청에는 body가 없습니다.
                </div>
              )}
            </div>

            <div className="min-w-0 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Response
                </h3>
                {selectedResult ? (
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        pretty(selectedResult.response),
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    복사
                  </button>
                ) : null}
              </div>

              {selectedResult ? (
                <>
                  <div
                    className={`mt-3 flex items-center justify-between border px-3 py-2 text-xs font-semibold ${
                      selectedResult.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-red-800"
                    }`}
                  >
                    <span>
                      {selectedResult.status ?? "LOCAL"} ·{" "}
                      {selectedResult.ok ? "SUCCESS" : "FAILED"}
                    </span>
                    <span>{selectedResult.elapsedMs}ms</span>
                  </div>
                  {selectedResult.error ? (
                    <div className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {selectedResult.error}
                    </div>
                  ) : null}
                  {selectedResult.checks.length > 0 ? (
                    <div className="mt-3 border border-border">
                      <div className="border-b border-border px-3 py-2 text-xs font-bold">
                        품질 검사
                      </div>
                      <div className="divide-y divide-border">
                        {selectedResult.checks.map((check) => (
                          <div
                            key={check.id}
                            className="flex items-start gap-2 px-3 py-2 text-xs"
                          >
                            {check.pass ? (
                              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            ) : (
                              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                            )}
                            <div className="min-w-0">
                              <div className="font-semibold">{check.label}</div>
                              <div className="mt-0.5 break-words text-muted-foreground">
                                {check.detail}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <pre className="mt-3 h-[360px] overflow-auto border border-border bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-100">
                    {pretty(selectedResult.response)}
                  </pre>
                </>
              ) : (
                <div className="mt-3 flex h-[520px] flex-col items-center justify-center border border-dashed border-border text-center text-sm text-muted-foreground">
                  <Circle className="mb-3 h-6 w-6" />
                  단계를 실행하면 실제 HTTP 응답과
                  <br />
                  품질 검사 결과가 표시됩니다.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
