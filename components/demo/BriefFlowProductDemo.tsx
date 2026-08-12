"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  NotebookPen,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { TrackedMarketingLink } from "@/components/marketing/TrackedMarketingLink";
import {
  advanceDemoStage,
  demoBrief,
  demoPressRelease,
  initialDemoStage,
  roughNotes,
  type DemoStage,
} from "@/domain/demo/productDemo";
import { trackGaEvent } from "@/lib/analytics/ga4";

const stages: readonly {
  id: DemoStage;
  number: string;
  label: string;
  description: string;
}[] = [
  {
    id: "notes",
    number: "01",
    label: "거친 메모",
    description: "발표에 필요한 재료",
  },
  {
    id: "brief",
    number: "02",
    label: "메시지 브리프",
    description: "핵심 사실과 구조",
  },
  {
    id: "draft",
    number: "03",
    label: "보도자료 초안",
    description: "검토 가능한 문서",
  },
  {
    id: "complete",
    number: "04",
    label: "보도자료 생성 완료",
    description: "배포 준비가 끝난 문서",
  },
] as const;

const stageIndex: Record<DemoStage, number> = {
  notes: 0,
  brief: 1,
  draft: 2,
  complete: 3,
};

const buttonFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function BriefFlowProductDemo() {
  const [stage, setStage] = useState<DemoStage>(initialDemoStage);
  const [furthestStage, setFurthestStage] =
    useState<DemoStage>(initialDemoStage);

  const currentIndex = stageIndex[stage];
  const furthestIndex = stageIndex[furthestStage];

  function advance() {
    const next = advanceDemoStage(stage);
    setStage(next);
    if (stageIndex[next] > furthestIndex) setFurthestStage(next);
    const eventName =
      next === "brief"
        ? "demo_brief_generated"
        : next === "draft"
          ? "demo_draft_viewed"
          : "demo_press_release_completed";
    trackGaEvent(eventName, { source: "public_product_demo" });
  }

  function reset() {
    setStage(initialDemoStage);
    setFurthestStage(initialDemoStage);
    trackGaEvent("demo_flow_reset", { source: "public_product_demo" });
  }

  return (
    <main className="bg-background text-foreground">
      <section className="border-b border-border/60 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.12),transparent_42%)] px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-primary">
            brieFFlow · Press demo
          </p>
          <h1 className="max-w-4xl text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
            흩어진 메모를
            <br />
            배포 가능한 보도자료로.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
            제품 소식의 거친 재료가 메시지 브리프와 검토 단계를 거쳐
            보도자료 생성 완료에 이르는 흐름을 직접 확인해 보세요.
          </p>
          <div className="mt-7 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="border border-primary/25 bg-primary/10 px-3 py-2 text-primary">
              로그인 없이 체험
            </span>
            <span className="border border-border bg-card px-3 py-2">
              결정론적 샘플 데이터
            </span>
            <span className="border border-border bg-card px-3 py-2">
              AI/API 호출 · 저장 없음
            </span>
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 sm:py-14" aria-label="보도자료 데모">
        <div className="mx-auto max-w-6xl">
          <ol className="grid border border-border bg-card sm:grid-cols-4">
            {stages.map((item, index) => {
              const isCurrent = item.id === stage;
              const isAvailable = index <= furthestIndex;
              return (
                <li
                  key={item.id}
                  className="border-b border-border last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                >
                  <button
                    type="button"
                    disabled={!isAvailable}
                    aria-current={isCurrent ? "step" : undefined}
                    onClick={() => setStage(item.id)}
                    className={`${buttonFocus} flex w-full items-center gap-4 px-5 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isCurrent ? "bg-primary text-primary-foreground" : ""
                    }`}
                  >
                    <span className="font-mono text-xs font-bold opacity-70">
                      {item.number}
                    </span>
                    <span>
                      <strong className="block text-sm">{item.label}</strong>
                      <span className="mt-0.5 block text-xs opacity-70">
                        {item.description}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section
              className="min-w-0 border border-border bg-card"
              aria-live="polite"
            >
              {stage === "notes" ? <NotesStage /> : null}
              {stage === "brief" ? <BriefStage /> : null}
              {stage === "draft" ? <DraftStage /> : null}
              {stage === "complete" ? <CompleteStage /> : null}

              <div className="flex flex-col gap-3 border-t border-border bg-muted/25 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <p className="text-xs leading-5 text-muted-foreground">
                  모든 회사·인물·수치는 데모를 위해 만든 가상 샘플입니다.
                </p>
                {stage !== "complete" ? (
                  <button
                    type="button"
                    onClick={advance}
                    className={`${buttonFocus} inline-flex min-h-11 items-center justify-center gap-2 bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90`}
                  >
                    {stage === "notes"
                      ? "메시지 브리프 만들기"
                      : stage === "brief"
                        ? "보도자료 초안 만들기"
                        : "보도자료 생성 완료하기"}
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
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                What you&apos;ll see
              </p>
              <h2 className="mt-3 text-xl font-bold">
                작성의 빈칸을 구조로 바꿉니다.
              </h2>
              <ul className="mt-5 space-y-4 text-sm leading-6">
                {[
                  "원문 메모의 핵심 사실 정리",
                  "대상 독자와 메시지 우선순위 설정",
                  "배포 전 검토 가능한 보도자료 초안",
                ].map((item, index) => (
                  <li key={item} className="flex gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${
                        index <= currentIndex
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 border-t border-border pt-6">
                <p className="text-sm leading-6 text-muted-foreground">
                  실제 워크스페이스에서는 팀 자료와 작성 맥락을 연결해 더
                  깊은 흐름으로 이어집니다.
                </p>
                <TrackedMarketingLink
                  href="/login?next=/press/new"
                  eventName="demo_workspace_cta_clicked"
                  eventParams={{
                    source: "public_product_demo",
                    track: "press",
                  }}
                  className={`${buttonFocus} mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary underline decoration-primary/30 underline-offset-4`}
                >
                  워크스페이스에서 시작
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </TrackedMarketingLink>
              </div>
              <div className="mt-6 border border-border bg-muted/25 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                  별도의 Live AI demo
                </p>
                <h3 className="mt-2 text-base font-bold">AI 프로세스 디버거</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  이 페이지는 결정론적 튜토리얼입니다. 서버측 AI가 근거를
                  수집하고 수정하는 실제 흐름은 별도 시나리오에서 확인하세요.
                </p>
                <TrackedMarketingLink
                  href="/demo/rag-test/scenario"
                  eventName="demo_ai_debugger_opened"
                  eventParams={{ source: "public_product_demo" }}
                  className={`${buttonFocus} mt-3 inline-flex items-center gap-2 text-sm font-bold text-primary underline decoration-primary/30 underline-offset-4`}
                >
                  AI 프로세스 디버거 열기
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

function StageHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof NotebookPen;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-border p-5 sm:p-7">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function NotesStage() {
  return (
    <div>
      <StageHeading
        eyebrow="01 · Capture"
        title="팀에 흩어진 거친 메모"
        description="문장 형식도, 출처도 제각각인 발표 재료에서 시작합니다."
        icon={NotebookPen}
      />
      <ul className="grid gap-px bg-border sm:grid-cols-2">
        {roughNotes.map((note) => (
          <li key={note.id} className="min-w-0 bg-background p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                {note.label}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {note.source}
              </span>
            </div>
            <p className="mt-5 break-words text-lg font-bold leading-8">
              {note.text}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BriefStage() {
  return (
    <div>
      <StageHeading
        eyebrow="02 · Structure"
        title="한눈에 검토하는 메시지 브리프"
        description="발표 내용, 독자, 핵심 메시지와 근거를 같은 구조 안에 정리했습니다."
        icon={Sparkles}
      />
      <div className="grid gap-6 p-5 sm:p-7">
        <BriefField label="발표 내용" value={demoBrief.announcement} />
        <BriefField label="핵심 독자" value={demoBrief.audience} />
        <div>
          <p className="text-xs font-bold text-muted-foreground">핵심 메시지</p>
          <ol className="mt-3 space-y-2">
            {demoBrief.keyMessages.map((message, index) => (
              <li
                key={message}
                className="flex gap-3 border border-border bg-background p-4 text-sm leading-6"
              >
                <span className="font-mono text-xs font-bold text-primary">
                  0{index + 1}
                </span>
                {message}
              </li>
            ))}
          </ol>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border border-border bg-muted/25 p-4">
            <p className="text-xs font-bold text-muted-foreground">근거 포인트</p>
            <ul className="mt-3 space-y-2 text-sm leading-6">
              {demoBrief.proofPoints.map((point) => (
                <li key={point} className="flex gap-2">
                  <Check
                    className="mt-1 h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <BriefField label="인용문 방향" value={demoBrief.quoteDirection} />
        </div>
      </div>
    </div>
  );
}

function BriefField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-primary pl-4">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-2 text-base font-semibold leading-7">{value}</p>
    </div>
  );
}

function DraftStage() {
  return (
    <div>
      <StageHeading
        eyebrow="03 · Draft"
        title="배포 전 검토 중인 보도자료 초안"
        description="브리프의 사실과 메시지를 보도자료 구조에 맞춰 연결했습니다. 아직 생성 완료 전 검토 단계입니다."
        icon={FileText}
      />
      <PressReleaseDocument />
    </div>
  );
}

function CompleteStage() {
  return (
    <div>
      <StageHeading
        eyebrow="04 · Complete"
        title="보도자료 생성 완료"
        description="핵심 사실과 메시지 검토를 마치고 배포 준비 상태로 전환했습니다."
        icon={Check}
      />
      <div className="mx-5 mt-5 border border-primary/30 bg-primary/10 p-5 sm:mx-8 sm:mt-8">
        <p className="text-sm font-black text-primary">생성이 완료되었습니다</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          실제 워크스페이스에서는 이 문서를 팀과 최종 검토한 뒤 배포 채널에
          맞게 내보내는 다음 단계로 이어집니다.
        </p>
      </div>
      <PressReleaseDocument />
    </div>
  );
}

function PressReleaseDocument() {
  return (
      <article className="mx-auto max-w-3xl p-5 sm:p-8 lg:p-10">
        <p className="font-mono text-xs font-bold text-primary">
          {demoPressRelease.eyebrow}
        </p>
        <h3 className="mt-5 text-2xl font-black leading-tight sm:text-4xl">
          {demoPressRelease.title}
        </h3>
        <p className="mt-4 border-b border-border pb-6 text-base font-semibold leading-7 text-muted-foreground sm:text-lg">
          {demoPressRelease.subtitle}
        </p>
        <p className="mt-7 text-base font-semibold leading-8">
          {demoPressRelease.lead}
        </p>
        {demoPressRelease.paragraphs.map((paragraph) => (
          <p key={paragraph} className="mt-5 text-sm leading-8 sm:text-base">
            {paragraph}
          </p>
        ))}
        <blockquote className="my-7 border-l-4 border-primary bg-primary/5 p-5 text-base font-semibold leading-8">
          {demoPressRelease.quote}
        </blockquote>
        <div className="border-t border-border pt-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            About brieflab
          </p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {demoPressRelease.boilerplate}
          </p>
        </div>
      </article>
  );
}
