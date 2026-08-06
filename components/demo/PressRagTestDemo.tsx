"use client";

import { useState } from "react";

import type {
  PressRagDemoViewModel,
  PressRagRecordedOutcome,
} from "@/domain/evaluation/pressRagDemoPresenter";
import { PressRagWorkflowViewer } from "@/components/demo/PressRagWorkflowViewer";

const CHECK_LABELS: Readonly<Record<keyof PressRagRecordedOutcome["checks"], string>> = {
  retrieval: "기대 문서 검색",
  answerability: "답변/유보 판단",
  citations: "인용 정확성",
  forbiddenSources: "금지 출처 회피",
  verification: "최종 주장 검증",
  expectedTools: "기대 도구 사용",
};

const CHECK_COPY = {
  MATCH: { icon: "✓", label: "기대와 일치", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200" },
  MISMATCH: { icon: "×", label: "불일치", tone: "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200" },
  NOT_EVALUABLE: { icon: "–", label: "평가 불가", tone: "border-border bg-muted text-muted-foreground" },
} as const;

function CheckBadge({ status }: { status: keyof typeof CHECK_COPY }) {
  const copy = CHECK_COPY[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${copy.tone}`}>
      <span aria-hidden="true">{copy.icon}</span>
      {copy.label}
    </span>
  );
}

function OutcomeCard({
  label,
  outcome,
}: {
  label: string;
  outcome: PressRagRecordedOutcome;
}) {
  const failed = outcome.status === "FAILED";
  return (
    <article className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">기록된 실행 {outcome.runIndex}</p>
          <h3 className="mt-1 text-xl font-black text-foreground">{label}</h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${failed ? "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"}`}>
          <span aria-hidden="true">{failed ? "× " : "✓ "}</span>
          {failed ? "실패 기록" : "완료 기록"}
        </span>
      </div>

      <section className="mt-5" aria-labelledby={`${label}-answer-heading`}>
        <h4 id={`${label}-answer-heading`} className="text-sm font-black text-foreground">답변 가능성 및 최종 결과</h4>
        <div className="mt-2 rounded-xl bg-muted/60 p-4">
          {failed ? (
            <p className="break-words text-sm font-semibold text-rose-800 dark:text-rose-200">
              오류 코드: <code className="break-all">{outcome.errorCode ?? "기록 없음"}</code>
            </p>
          ) : (
            <>
              <p className="text-xs font-bold text-muted-foreground">
                {outcome.cannotAnswer === true ? "답변 유보로 기록됨" : outcome.cannotAnswer === false ? "답변으로 기록됨" : "판단 기록 없음"}
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
                {outcome.finalAnswer ?? "최종 답변 기록 없음"}
              </p>
              {outcome.summary ? <p className="mt-3 break-words border-t border-border pt-3 text-xs leading-6 text-muted-foreground">요약: {outcome.summary}</p> : null}
            </>
          )}
        </div>
      </section>

      <section className="mt-5" aria-labelledby={`${label}-retrieval-heading`}>
        <h4 id={`${label}-retrieval-heading`} className="text-sm font-black text-foreground">검색 근거</h4>
        {outcome.retrieval.length ? (
          <div className="mt-2 max-w-full overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-left text-xs">
              <caption className="sr-only">{label} 상위 검색 결과</caption>
              <thead className="bg-muted text-muted-foreground">
                <tr><th className="px-3 py-2">순위</th><th className="px-3 py-2">논리 문서</th><th className="px-3 py-2">파일 / 페이지</th><th className="px-3 py-2">점수</th><th className="px-3 py-2">기대</th></tr>
              </thead>
              <tbody>
                {outcome.retrieval.map((row) => (
                  <tr key={`${row.rank}-${row.logicalDocumentId}-${row.pageStart}`} className="border-t border-border">
                    <td className="px-3 py-2 font-bold">{row.rank}</td>
                    <td className="break-all px-3 py-2 font-mono">{row.logicalDocumentId}</td>
                    <td className="break-words px-3 py-2">{row.filename} · p.{row.pageStart}{row.pageEnd === row.pageStart ? "" : `–${row.pageEnd}`}</td>
                    <td className="px-3 py-2">{row.score === null ? "—" : row.score.toFixed(5)}</td>
                    <td className="px-3 py-2">{row.expected ? "기대 문서" : "기대 외"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-sm text-muted-foreground">표시할 검색 근거가 없습니다.</p>}
      </section>

      <section className="mt-5" aria-labelledby={`${label}-citation-heading`}>
        <h4 id={`${label}-citation-heading`} className="text-sm font-black text-foreground">최종 인용</h4>
        {outcome.citations.length ? (
          <ul className="mt-2 space-y-2">
            {outcome.citations.map((citation) => (
              <li key={`${citation.sourceLabel}-${citation.logicalDocumentId}-${citation.pageStart}`} className="break-words rounded-xl border border-border p-3 text-xs leading-6">
                <strong>{citation.sourceLabel}</strong> · <span className="font-mono">{citation.logicalDocumentId}</span><br />
                {citation.filename} · p.{citation.pageStart}{citation.pageEnd === citation.pageStart ? "" : `–${citation.pageEnd}`} · {citation.expected ? "기대 출처" : "기대하지 않은 출처"}
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-muted-foreground">최종 인용 없음</p>}
      </section>

      <section className="mt-5" aria-labelledby={`${label}-verification-heading`}>
        <h4 id={`${label}-verification-heading`} className="text-sm font-black text-foreground">주장 검증 및 안전 대체</h4>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-lg bg-muted p-3"><dt className="text-muted-foreground">모드</dt><dd className="mt-1 font-bold">{outcome.verification.mode ?? "없음"}</dd></div>
          <div className="rounded-lg bg-muted p-3"><dt className="text-muted-foreground">상태</dt><dd className="mt-1 font-bold">{outcome.verification.status ?? "평가 불가"}</dd></div>
          <div className="rounded-lg bg-muted p-3"><dt className="text-muted-foreground">지원 주장</dt><dd className="mt-1 font-bold">{outcome.verification.supportedClaims}/{outcome.verification.totalClaims}</dd></div>
          <div className="rounded-lg bg-muted p-3"><dt className="text-muted-foreground">대체 모드</dt><dd className="mt-1 font-bold">{outcome.fallback.mode ?? "없음"}</dd></div>
        </dl>
        {outcome.fallback.reason ? <p className="mt-2 break-all text-xs text-muted-foreground">안전 대체 사유: {outcome.fallback.reason}</p> : null}
        {outcome.verification.claims.length ? (
          <ul className="mt-3 space-y-3">
            {outcome.verification.claims.map((claim, index) => (
              <li key={`${index}-${claim.text.slice(0, 20)}`} className="rounded-xl border border-border p-3 text-xs leading-6">
                <p className="break-words font-semibold">{claim.status}: {claim.text}</p>
                {claim.evidence.map((evidence, evidenceIndex) => (
                  <p key={`${evidenceIndex}-${evidence.sourceLabel}`} className="mt-2 break-words border-l-2 border-primary pl-3 text-muted-foreground">
                    근거 좌표: {evidence.sourceLabel}, p.{evidence.pageStart}{evidence.pageEnd === evidence.pageStart ? "" : `–${evidence.pageEnd}`}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-5" aria-labelledby={`${label}-tools-heading`}>
        <h4 id={`${label}-tools-heading`} className="text-sm font-black text-foreground">도구 단계</h4>
        {outcome.tools.length ? (
          <ol className="mt-2 space-y-2">
            {outcome.tools.map((tool) => (
              <li key={`${tool.sequence}-${tool.toolName}`} className="flex flex-wrap justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                <span><strong>{tool.sequence}. {tool.toolName}</strong> · {tool.status}</span><span>{tool.latencyMs.toLocaleString("ko-KR")} ms</span>
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-sm text-muted-foreground">공개 가능한 도구 단계 없음</p>}
      </section>

      <section className="mt-5" aria-labelledby={`${label}-checks-heading`}>
        <h4 id={`${label}-checks-heading`} className="text-sm font-black text-foreground">독립 기대값 검사</h4>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {(Object.entries(outcome.checks) as [keyof PressRagRecordedOutcome["checks"], keyof typeof CHECK_COPY][]).map(([name, status]) => (
            <li key={name} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border p-2 text-xs">
              <span>{CHECK_LABELS[name]}</span><CheckBadge status={status} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-5 rounded-xl border border-border bg-muted/40 p-4" aria-label={`${label} 성능과 비용`}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">지연 시간</dt><dd className="mt-1 font-black">{outcome.latencyMs.toLocaleString("ko-KR")} ms</dd></div>
          <div><dt className="text-xs text-muted-foreground">기록된 비용</dt><dd className="mt-1 font-black">{outcome.costMicros.toLocaleString("ko-KR")} micro-USD <span className="font-normal text-muted-foreground">(${(outcome.costMicros / 1_000_000).toFixed(6)})</span></dd></div>
        </dl>
      </section>
    </article>
  );
}

export function PressRagTestDemo({ viewModel }: { viewModel: PressRagDemoViewModel }) {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [runIndex, setRunIndex] = useState(1);
  const scenario = viewModel.scenarios[scenarioIndex] ?? viewModel.scenarios[0]!;
  const selectedRun = scenario.runs.find((run) => run.runIndex === runIndex) ?? scenario.runs[0]!;

  function selectScenario(index: number) {
    setScenarioIndex(index);
    setRunIndex(1);
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8" aria-labelledby="scenario-picker-heading">
      {/* Preset and repetition are controls for the workflow below, not sections of their
          own, so they sit in one bar and the graph stays in the first screen. */}
      <h2 id="scenario-picker-heading" className="sr-only">RAG 실행 디버깅 프리셋</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="group" aria-label="RAG 검토 프리셋">
        {viewModel.scenarios.map((option, index) => (
          <button
            key={option.preset}
            type="button"
            aria-pressed={index === scenarioIndex}
            onClick={() => selectScenario(index)}
            className={`min-h-11 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${index === scenarioIndex ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted"}`}
          >
            <span className="block text-[13px] font-black leading-tight">{option.label}</span>
            <span className={`mt-0.5 block font-mono text-[10px] ${index === scenarioIndex ? "text-primary-foreground/85" : "text-muted-foreground"}`}>{option.caseId}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5" aria-live="polite">
        <p className="min-w-0 flex-1 text-sm">
          <strong className="font-black text-foreground">{scenario.label}</strong>
          <span className="ml-2 break-words text-muted-foreground">{scenario.description}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor="recorded-run" className="text-xs font-bold text-foreground">기록된 반복</label>
          <select
            id="recorded-run"
            value={selectedRun.runIndex}
            onChange={(event) => setRunIndex(Number(event.target.value))}
            className="min-h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {scenario.runs.map((run) => <option key={run.runIndex} value={run.runIndex}>기록 {run.runIndex}</option>)}
          </select>
        </div>
      </div>

      <section className="mt-3 rounded-xl border border-border bg-card p-4" aria-labelledby="provenance-heading">
        <h2 id="provenance-heading" className="text-sm font-black text-foreground">승인 데이터 출처</h2>
        <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
          <div><dt className="font-bold text-muted-foreground">데이터셋 아티팩트</dt><dd className="mt-1 font-mono">{viewModel.evidence.datasetArtifact}</dd></div>
          <div><dt className="font-bold text-muted-foreground">버전</dt><dd className="mt-1 break-all font-mono">{viewModel.evidence.datasetVersion}</dd></div>
          <div><dt className="font-bold text-muted-foreground">승인 시각</dt><dd className="mt-1"><time dateTime={viewModel.evidence.approvedAt}>{viewModel.evidence.approvedAt}</time></dd></div>
        </dl>
      </section>

      <PressRagWorkflowViewer
        key={`${scenario.caseId}-${selectedRun.runIndex}`}
        baseline={selectedRun.baseline}
        candidate={selectedRun.candidate}
        expectation={scenario.expectation}
        prompt={scenario.prompt}
        caseId={scenario.caseId}
        repetitionCount={scenario.runs.length}
        baselineEvidence={viewModel.evidence.baseline}
        candidateEvidence={viewModel.evidence.candidate}
      />

      {/* The expected behavior is what the verdicts were judged against, so it reads after
          the workflow rather than ahead of it. */}
      <details className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-4" aria-labelledby="expected-heading">
        <summary className="cursor-pointer text-base font-black text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span id="expected-heading">승인된 synthetic 기대 동작</span>
        </summary>
        <p className="mt-3 break-words rounded-xl bg-background p-4 text-sm leading-7 text-foreground"><strong>승인된 synthetic 질문:</strong> {scenario.prompt}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs font-bold text-muted-foreground">답변성</dt><dd className="mt-1 font-semibold">{scenario.expectation.answerability}</dd></div>
          <div><dt className="text-xs font-bold text-muted-foreground">상충 처리</dt><dd className="mt-1 font-semibold">{scenario.expectation.conflict}</dd></div>
          <div><dt className="text-xs font-bold text-muted-foreground">주장 근거 필수</dt><dd className="mt-1 font-semibold">{scenario.expectation.requiresClaimEvidence ? "예" : "아니요"}</dd></div>
          <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs font-bold text-muted-foreground">기대 문서</dt><dd className="mt-1 break-words font-mono text-xs">{scenario.expectation.expectedDocuments.map(({ logicalId }) => logicalId).join(", ") || "없음"}</dd></div>
          <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs font-bold text-muted-foreground">필수 사실</dt><dd className="mt-1 break-words text-xs">{scenario.expectation.requiredFacts.map(({ key, value }) => `${key}: ${value}`).join(" · ") || "없음"}</dd></div>
        </dl>
      </details>

      <section className="mt-8" aria-labelledby="comparison-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 id="comparison-heading" className="text-2xl font-black text-foreground">보조 기록 결과 비교</h2><p className="mt-1 text-xs text-muted-foreground">워크플로 디버깅을 보완하는 읽기 전용 비교입니다. 1 micro-USD는 미화 0.000001달러입니다.</p></div>
          <p className="text-xs font-bold text-muted-foreground">{scenario.partition} · 반복 {selectedRun.runIndex}</p>
        </div>
        <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-2">
          <OutcomeCard label={viewModel.evidence.baseline.label} outcome={selectedRun.baseline} />
          <OutcomeCard label={viewModel.evidence.candidate.label} outcome={selectedRun.candidate} />
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-muted/40 p-5" aria-labelledby="identity-heading">
        <h2 id="identity-heading" className="text-lg font-black text-foreground">기록 신원</h2>
        <dl className="mt-3 grid gap-4 text-xs sm:grid-cols-2">
          <div><dt className="font-bold text-muted-foreground">{viewModel.evidence.baseline.label}</dt><dd className="mt-1 break-all font-mono">{viewModel.evidence.baseline.configurationHash}</dd></div>
          <div><dt className="font-bold text-muted-foreground">{viewModel.evidence.candidate.label}</dt><dd className="mt-1 break-all font-mono">{viewModel.evidence.candidate.configurationHash}</dd></div>
        </dl>
      </section>
    </section>
  );
}
