"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  FileCheck2,
  FileSearch,
  FileText,
  RotateCcw,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";

import { TrackedMarketingLink } from "@/components/marketing/TrackedMarketingLink";
import {
  advanceDemoStage,
  correctedDemoFindings,
  correctedDemoPressRelease,
  demoDocuments,
  demoEvidenceCandidates,
  demoSourceMap,
  evidencePageHref,
  initialDemoPressRelease,
  initialDemoStage,
  verificationFindings,
  type DemoFinding,
  type DemoPressRelease,
  type DemoStage,
  type DemoVerdict,
} from "@/domain/demo/productDemo";
import { trackGaEvent } from "@/lib/analytics/ga4";

const stages: readonly {
  id: DemoStage;
  number: string;
  label: string;
  description: string;
}[] = [
  { id: "draft", number: "01", label: "오류가 포함된 초안", description: "검증 전 보도자료" },
  { id: "evidence", number: "02", label: "근거 후보", description: "PDF 페이지 연결" },
  { id: "verification", number: "03", label: "주장 검증", description: "PASS · WARN · BLOCK" },
  { id: "complete", number: "04", label: "검증 완료", description: "수정본과 출처 맵" },
] as const;

const stageIndex: Record<DemoStage, number> = {
  draft: 0,
  evidence: 1,
  verification: 2,
  complete: 3,
};

const buttonFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const verdictStyle: Record<DemoVerdict, string> = {
  PASS: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  WARN: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  BLOCK: "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function BriefFlowProductDemo() {
  const [stage, setStage] = useState<DemoStage>(initialDemoStage);
  const [furthestStage, setFurthestStage] = useState<DemoStage>(initialDemoStage);
  const [corrected, setCorrected] = useState(false);

  const currentIndex = stageIndex[stage];
  const furthestIndex = stageIndex[furthestStage];
  const findings = corrected ? correctedDemoFindings : verificationFindings;

  function advance() {
    const next = advanceDemoStage(stage, findings);
    setStage(next);
    if (stageIndex[next] > furthestIndex) setFurthestStage(next);
    const eventName =
      next === "evidence"
        ? "demo_brief_generated"
        : next === "verification"
          ? "demo_draft_viewed"
          : "demo_press_release_completed";
    trackGaEvent(eventName, { source: "public_product_demo" });
  }

  function correctAndReverify() {
    setCorrected(true);
    trackGaEvent("demo_draft_viewed", {
      source: "public_product_demo",
      action: "corrected_and_reverified",
    });
  }

  function reset() {
    setStage(initialDemoStage);
    setFurthestStage(initialDemoStage);
    setCorrected(false);
    trackGaEvent("demo_flow_reset", { source: "public_product_demo" });
  }

  return (
    <main className="bg-background text-foreground">
      <section className="border-b border-border/60 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.12),transparent_42%)] px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-primary">
            brieFFlow · Evidence verification demo
          </p>
          <h1 className="max-w-4xl text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
            틀린 초안을 찾고,
            <br />
            페이지 근거로 고칩니다.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
            32% 수치 오류와 근거 없는 최상급 표현이 있는 보도자료를 PDF 페이지 단위로 검증하고,
            BLOCK을 해소한 뒤 출처 맵이 있는 최종본으로 완성해 보세요.
          </p>
          <div className="mt-7 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="border border-primary/25 bg-primary/10 px-3 py-2 text-primary">로그인 없이 체험</span>
            <span className="border border-border bg-card px-3 py-2">controlled-synthetic 문서</span>
            <span className="border border-border bg-card px-3 py-2">AI/API 호출 · 저장 없음</span>
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 sm:py-14" aria-label="보도자료 근거 검증 데모">
        <div className="mx-auto max-w-6xl">
          <ol className="grid border border-border bg-card sm:grid-cols-4">
            {stages.map((item, index) => {
              const isCurrent = item.id === stage;
              const isAvailable = index <= furthestIndex;
              return (
                <li key={item.id} className="border-b border-border last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                  <button
                    type="button"
                    disabled={!isAvailable}
                    aria-current={isCurrent ? "step" : undefined}
                    onClick={() => setStage(item.id)}
                    className={`${buttonFocus} flex w-full items-center gap-4 px-5 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isCurrent ? "bg-primary text-primary-foreground" : ""}`}
                  >
                    <span className="font-mono text-xs font-bold opacity-70">{item.number}</span>
                    <span>
                      <strong className="block text-sm">{item.label}</strong>
                      <span className="mt-0.5 block text-xs opacity-70">{item.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="min-w-0 border border-border bg-card" aria-live="polite">
              {stage === "draft" ? <DraftStage /> : null}
              {stage === "evidence" ? <EvidenceStage /> : null}
              {stage === "verification" ? <VerificationStage findings={findings} corrected={corrected} /> : null}
              {stage === "complete" ? <CompleteStage /> : null}

              <div className="flex flex-col gap-3 border-t border-border bg-muted/25 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <p className="text-xs leading-5 text-muted-foreground">
                  모든 회사·제품·실행 기록은 데모용 controlled-synthetic 샘플입니다.
                </p>
                {stage === "verification" && !corrected ? (
                  <button
                    type="button"
                    onClick={correctAndReverify}
                    className={`${buttonFocus} inline-flex min-h-11 items-center justify-center gap-2 bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90`}
                  >
                    <Wrench className="h-4 w-4" aria-hidden="true" />
                    32%를 40%로 수정하고 “업계 최초” 제거 · 재검증
                  </button>
                ) : stage !== "complete" ? (
                  <button
                    type="button"
                    onClick={advance}
                    className={`${buttonFocus} inline-flex min-h-11 items-center justify-center gap-2 bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90`}
                  >
                    {stage === "draft" ? "PDF 근거 찾기" : stage === "evidence" ? "주장 검증 실행" : "검증 완료 문서 보기"}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={reset}
                    className={`${buttonFocus} inline-flex min-h-11 items-center justify-center gap-2 border border-border bg-background px-5 py-3 text-sm font-bold hover:border-primary`}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    처음부터 다시
                  </button>
                )}
              </div>
            </section>

            <aside className="h-fit border border-border bg-card p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Verification contract</p>
              <h2 className="mt-3 text-xl font-bold">근거 역할과 완료 조건을 분리합니다.</h2>
              <ul className="mt-5 space-y-4 text-sm leading-6">
                {[
                  "FACT 문서만 사실 주장을 뒷받침",
                  "STYLE 문서는 표현 지침으로만 사용",
                  "PASS/WARN은 완료 가능, BLOCK은 완료 차단",
                  "수정 후 PASS 재검증과 출처 맵 확인",
                ].map((item, index) => (
                  <li key={item} className="flex gap-3">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${index <= currentIndex ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 border-t border-border pt-6">
                <p className="text-sm leading-6 text-muted-foreground">
                  실제 워크스페이스에서는 팀 문서와 작성 맥락을 연결해 같은 검증 정책을 적용합니다.
                </p>
                <TrackedMarketingLink
                  href="/login?next=/press/new"
                  eventName="demo_workspace_cta_clicked"
                  eventParams={{ source: "public_product_demo", track: "press" }}
                  className={`${buttonFocus} mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary underline decoration-primary/30 underline-offset-4`}
                >
                  워크스페이스에서 시작
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </TrackedMarketingLink>
              </div>
              <div className="mt-6 border border-border bg-muted/25 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">별도의 Live AI demo</p>
                <h3 className="mt-2 text-base font-bold">AI 프로세스 디버거</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  이 페이지는 결정론적 튜토리얼입니다. 서버측 AI가 근거를 수집하고 수정하는 실제 흐름은 별도 시나리오에서 확인하세요.
                </p>
                <TrackedMarketingLink
                  href="/demo/rag-test/scenario"
                  eventName="demo_ai_debugger_opened"
                  eventParams={{ source: "public_product_demo" }}
                  className={`${buttonFocus} mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary underline decoration-primary/30 underline-offset-4`}
                >
                  AI 프로세스 디버거 데모 열기
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </TrackedMarketingLink>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

function StageHeading({ eyebrow, title, description, icon: Icon }: { eyebrow: string; title: string; description: string; icon: typeof FileText }) {
  return (
    <div className="flex items-start gap-4 border-b border-border p-5 sm:p-7">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function DraftStage() {
  return (
    <div>
      <StageHeading
        eyebrow="01 · Flawed draft"
        title="오류가 포함된 보도자료 초안"
        description="32% 수치와 ‘업계 최초’ 주장을 그대로 믿지 않고, 첨부 문서에서 확인합니다."
        icon={FileText}
      />
      <div className="mx-5 mt-5 grid gap-2 sm:mx-8 sm:mt-8 sm:grid-cols-2">
        <FindingCallout tone="WARN" text="32% · 문서 수치와 불일치 가능" />
        <FindingCallout tone="BLOCK" text="업계 최초 · 사실 근거 없음" />
      </div>
      <PressReleaseDocument release={initialDemoPressRelease} />
    </div>
  );
}

function EvidenceStage() {
  return (
    <div>
      <StageHeading
        eyebrow="02 · Evidence"
        title="문서 역할과 페이지 단위 근거 후보"
        description="FACT와 STYLE을 분리하고, 각 후보가 나온 정확한 PDF 페이지를 엽니다."
        icon={FileSearch}
      />
      <div className="grid gap-5 p-5 sm:p-7">
        <div className="grid gap-3 sm:grid-cols-2">
          {demoDocuments.map((document) => (
            <article key={document.id} className="border border-border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="bg-primary/10 px-2 py-1 text-[11px] font-black text-primary">{document.role}</span>
                <span className="text-xs text-muted-foreground">{document.pageCount} page{document.pageCount > 1 ? "s" : ""}</span>
              </div>
              <h3 className="mt-3 break-all text-sm font-bold">{document.name}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{document.description}</p>
              <a href={evidencePageHref(document.path, 1)} target="_blank" rel="noreferrer" className={`${buttonFocus} mt-3 inline-flex text-xs font-bold text-primary underline underline-offset-4`}>
                PDF p.1 열기
              </a>
            </article>
          ))}
        </div>
        <ol className="grid gap-3">
          {demoEvidenceCandidates.map((candidate) => (
            <li key={candidate.id} className="border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{candidate.translatedFact}</strong>
                <a href={candidate.pageHref} target="_blank" rel="noreferrer" className={`${buttonFocus} text-xs font-black text-primary underline underline-offset-4`}>
                  {candidate.documentId} · p.{candidate.pageStart}
                </a>
              </div>
              <p className="mt-2 font-mono text-xs leading-5 text-muted-foreground">{candidate.excerpt}</p>
              {candidate.exclusionReason ? <p className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-300">{candidate.exclusionReason}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function VerificationStage({ findings, corrected }: { findings: readonly DemoFinding[]; corrected: boolean }) {
  return (
    <div>
      <StageHeading
        eyebrow="03 · Verification"
        title={corrected ? "재검증 결과 · PASS" : "초안 주장 검증 결과"}
        description={corrected ? "수치 오류와 근거 없는 주장을 수정한 뒤 모든 잔존 주장이 통과했습니다." : "PASS와 WARN은 확인할 수 있지만, BLOCK이 하나라도 있으면 최종 확정할 수 없습니다."}
        icon={ShieldCheck}
      />
      {!corrected ? (
        <div className="mx-5 mt-5 border border-rose-500/40 bg-rose-500/10 p-4 sm:mx-7 sm:mt-7">
          <p className="font-black text-rose-700 dark:text-rose-300">BLOCK 항목 때문에 최종 확정할 수 없습니다.</p>
          <p className="mt-1 text-sm text-muted-foreground">32%를 40%로 수정하고, 근거 없는 “업계 최초”를 제거한 뒤 재검증하세요.</p>
        </div>
      ) : (
        <div className="mx-5 mt-5 border border-emerald-500/40 bg-emerald-500/10 p-4 sm:mx-7 sm:mt-7">
          <p className="font-black text-emerald-700 dark:text-emerald-300">최종 게이트 PASS · 완료 가능</p>
          <p className="mt-1 text-sm text-muted-foreground">결정론적 수정과 재검증이 끝났습니다.</p>
        </div>
      )}
      <FindingList findings={findings} />
    </div>
  );
}

function CompleteStage() {
  return (
    <div>
      <StageHeading
        eyebrow="04 · Complete"
        title="검증 완료 보도자료"
        description="최종 PASS를 받은 수정본과 잔존 사실의 페이지 단위 출처 맵입니다."
        icon={FileCheck2}
      />
      <div className="mx-5 mt-5 border border-emerald-500/40 bg-emerald-500/10 p-5 sm:mx-8 sm:mt-8">
        <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">재검증 결과 · PASS</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">32%는 40%로 수정했고, 근거 없는 “업계 최초”는 제거했습니다.</p>
      </div>
      <PressReleaseDocument release={correctedDemoPressRelease} />
      <section className="border-t border-border p-5 sm:p-8" aria-labelledby="source-map-title">
        <h3 id="source-map-title" className="text-xl font-black">주장별 출처 맵</h3>
        <ol className="mt-4 grid gap-3">
          {demoSourceMap.map((entry) => (
            <li key={entry.claimId} className="flex flex-col gap-2 border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-bold">{entry.claim}</span>
              <a href={entry.pageHref} target="_blank" rel="noreferrer" className={`${buttonFocus} text-xs font-black text-primary underline underline-offset-4`}>
                {entry.documentName} · p.{entry.pageStart}
              </a>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function FindingList({ findings }: { findings: readonly DemoFinding[] }) {
  return (
    <ol className="grid gap-3 p-5 sm:p-7">
      {findings.map((finding) => (
        <li key={finding.id} className="border border-border bg-background p-4">
          <div className="flex flex-wrap items-center gap-3">
            <VerdictBadge verdict={finding.verdict} />
            <strong className="text-sm">{finding.claim}</strong>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{finding.explanation}</p>
        </li>
      ))}
    </ol>
  );
}

function FindingCallout({ tone, text }: { tone: DemoVerdict; text: string }) {
  return <div className={`flex items-center gap-2 border p-3 text-xs font-bold ${verdictStyle[tone]}`}>{tone === "BLOCK" ? <XCircle className="h-4 w-4" aria-hidden="true" /> : <CircleAlert className="h-4 w-4" aria-hidden="true" />}{text}</div>;
}

function VerdictBadge({ verdict }: { verdict: DemoVerdict }) {
  return <span className={`border px-2 py-1 font-mono text-[11px] font-black ${verdictStyle[verdict]}`}>{verdict}</span>;
}

function PressReleaseDocument({ release }: { release: DemoPressRelease }) {
  return (
    <article className="mx-auto max-w-3xl p-5 sm:p-8 lg:p-10">
      <p className="font-mono text-xs font-bold text-primary">{release.eyebrow}</p>
      <h3 className="mt-5 text-2xl font-black leading-tight sm:text-4xl">{release.title}</h3>
      <p className="mt-4 border-b border-border pb-6 text-base font-semibold leading-7 text-muted-foreground sm:text-lg">{release.subtitle}</p>
      <p className="mt-7 text-base font-semibold leading-8">{release.lead}</p>
      {release.paragraphs.map((paragraph) => <p key={paragraph} className="mt-5 text-sm leading-8 sm:text-base">{paragraph}</p>)}
      <blockquote className="my-7 border-l-4 border-primary bg-primary/5 p-5 text-base font-semibold leading-8">{release.quote}</blockquote>
      <div className="border-t border-border pt-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">About brieflab</p>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{release.boilerplate}</p>
      </div>
    </article>
  );
}
