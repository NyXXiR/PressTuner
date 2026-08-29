import Link from "next/link";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { AuthRedirectIfAuthed } from "@/components/marketing/AuthRedirectIfAuthed";
import { TrackedMarketingLink } from "@/components/marketing/TrackedMarketingLink";
import { PressGeneratorDemo } from "@/components/press/PressGeneratorDemo";
import { PageCTA } from "@/components/page/PageCTA";
import {
  ChevronRight,
  FileText,
  MousePointerClick,
  PlayCircle,
  Sparkles,
  Zap,
} from "lucide-react";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const PRIMARY_CTA = {
  href: "#demo",
  label: "메모로 브리프 만들기",
};

const USE_CASES = [
  {
    title: "지금 가진 메모를 보도자료로 바꿔야 할 때",
    description:
      "핵심 사실 몇 줄을 넣으면 제목, 리드, 핵심 포인트가 잡힌 브리프로 이어집니다.",
  },
  {
    title: "팀에서 검토할 수 있는 형태가 필요할 때",
    description:
      "초안 생성 후 표현, 인용문, 톤을 다듬어 공식 발표문에 가깝게 정리합니다.",
  },
  {
    title: "반복되는 발표 업무를 같은 흐름으로 처리할 때",
    description:
      "출시, 제휴, 행사, 투자 소식을 같은 입력 방식과 팀 문체로 관리합니다.",
  },
];

export function PressLandingPage() {
  return (
    <>
      <AuthRedirectIfAuthed redirectTo="/press/dashboard" />
      <MarketingPressHome />
    </>
  );
}

function MarketingPressHome() {
  return (
    <div className="wongoji-sharp relative -mt-10 -mb-10 w-full overflow-x-hidden">
      <section className="relative pt-12 pb-16 text-center -mt-6 sm:-mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex justify-center pt-20">
            <span className="border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-primary">
              Press Release AI
            </span>
          </div>

          <h1 className="mb-6 pt-6 text-4xl font-bold leading-[1.18] tracking-tight text-foreground md:text-6xl">
            메모를 넣으면 보도자료 작업이 <br />
            <span className="text-muted-foreground/80 dark:text-muted-foreground">
              브리프부터 시작됩니다.
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-xl break-keep text-base leading-7 text-muted-foreground md:text-lg">
            brieFFlow Press는 출시, 제휴, 행사 소식을 보도자료 브리프와 초안으로
            이어주는 작업 공간입니다. 아래 데모에서 메모를 정리한 뒤 로그인하면
            같은 내용으로 초안 작성까지 계속 진행할 수 있습니다.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
            <PageCTA href={PRIMARY_CTA.href}>
              {PRIMARY_CTA.label}
              <ChevronRight className="ml-1 h-5 w-5" />
            </PageCTA>
            <PageCTA href="/login?next=/press/new" variant="secondary">
              로그인하고 바로 작성
            </PageCTA>
            <div className="flex justify-center sm:basis-full">
              <TrackedMarketingLink
                href="/demo"
                className="inline-flex h-12 w-full items-center justify-center gap-2 border border-primary/30 bg-primary/5 px-7 text-sm font-bold text-primary transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:max-w-sm"
                eventName="product_demo_opened"
                eventParams={{
                  source: "press_landing_hero",
                  target_path: "/demo",
                }}
              >
                <PlayCircle className="h-4 w-4" />
                로그인 없이 제품 데모 보기
                <ChevronRight className="h-4 w-4" />
              </TrackedMarketingLink>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-8 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-2">
              USE CASES
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              유입 후 바로 작업으로 이어집니다
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {USE_CASES.map((item) => (
              <div
                key={item.title}
                className="border border-border bg-card p-5 sm:p-6 text-left"
              >
                <h3 className="text-lg font-bold leading-snug text-foreground">
                  {item.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PressGeneratorDemo />

      <section id="process" className="py-12 border-t border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="mb-8 flex flex-col items-center text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-1">
              WORKFLOW
            </p>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              초안 작성부터 팀 문체 반영까지 한 흐름으로
            </h2>
          </div>

          <ChevronProgressBar
            steps={[
              { title: "브리프 정리", desc: "메모를 초안으로" },
              { title: "팀 문체 반영", desc: "팀 톤에 맞게" },
              { title: "문서 완성", desc: "최종 문서로 정리" },
            ]}
          />
        </div>
      </section>

      <section id="features" className="py-20 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<FileText className="text-blue-500" />}
              title="보도자료 초안 작성"
              desc="출시, 제휴, 행사 소식을 기사형 구조로 빠르게 초안화합니다."
            />
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<Zap className="text-amber-500" />}
              title="팀 톤앤매너 반영"
              desc="기존 문체를 기준으로 팀다운 표현을 맞춥니다."
            />
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<Sparkles className="text-primary" />}
              title="검토용 초안 다듬기"
              desc="생성된 초안을 검토 가능한 문서로 정리하고 표현을 다듬습니다."
            />
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<MousePointerClick className="text-orange-500" />}
              title="재사용 가능한 발표 흐름"
              desc="반복되는 출시, 제휴, 행사 공지의 작성 흐름을 팀 안에 남깁니다."
            />
          </div>
        </div>
      </section>

      <section className="py-20 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="border border-border bg-card p-6 sm:p-8 text-center">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-6">
                메모가 준비됐다면, <br />
                브리프를 만들고 초안까지 이어가세요.
              </h2>

              <div className="flex justify-center">
                <PageCTA href={PRIMARY_CTA.href}>
                  {PRIMARY_CTA.label}
                </PageCTA>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-8 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-2">
              RELATED TRACKS
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              다른 목적으로 들어왔다면 이동하세요
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border border-border bg-card p-5 sm:p-6 text-left">
              <h3 className="text-lg font-bold leading-snug text-foreground">
                brieFFlow 공통 홈
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                보도자료 AI와 자기소개서 AI 중 지금 필요한 작성 트랙을
                선택합니다.
              </p>
              <Link
                href="/"
                className="mt-4 inline-flex items-center text-sm font-bold text-primary"
              >
                공통 홈으로 이동
              </Link>
            </div>
            <div className="border border-border bg-card p-5 sm:p-6 text-left">
              <h3 className="text-lg font-bold leading-snug text-foreground">
                자기소개서 AI
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                자기소개서 AI와 자소서 AI가 경험 브릭을 어떻게 문항별
                초안으로 바꾸는지 확인합니다.
              </p>
              <Link
                href="/resume"
                className="mt-4 inline-flex items-center text-sm font-bold text-primary"
              >
                자기소개서 AI 보기
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

function ChevronProgressBar({
  steps,
}: {
  steps: { title: string; desc: string }[];
}) {
  return (
    <div className="flex flex-col md:flex-row w-full gap-2 md:gap-0 overflow-hidden border border-border/50 md:border-none">
      {steps.map((step, i) => {
        const isFirst = i === 0;
        const isLast = i === steps.length - 1;

        return (
          <div
            key={i}
            className={cx(
              "relative flex flex-col items-center justify-center py-6 px-8 md:flex-1 transition-all border-b md:border-b-0 border-border/40",
              i === 0
                ? "bg-primary text-primary-foreground z-30"
                : i === 1
                  ? "bg-primary/60 text-primary-foreground/95 z-20"
                  : "bg-primary/20 text-foreground dark:text-foreground/90 z-10",
              !isFirst && !isLast
                ? "[clip-path:polygon(calc(100%-15px)_0,100%_50%,calc(100%-15px)_100%,0_100%,15px_50%,0_0)]"
                : "",
              isFirst
                ? "[clip-path:polygon(calc(100%-15px)_0,100%_50%,calc(100%-15px)_100%,0_100%,0_0)]"
                : "",
              isLast
                ? "[clip-path:polygon(100%_0,100%_100%,0_100%,15px_50%,0_0)]"
                : "",
            )}
            style={{ marginLeft: !isFirst ? "-14px" : "0" }}
          >
            <div className="flex items-center gap-2 md:flex-col md:gap-1">
              <span
                className={cx(
                  "text-[9px] font-bold uppercase tracking-widest",
                  i === 2 ? "opacity-60" : "opacity-80",
                )}
              >
                Step {i + 1}
              </span>
              <h3 className="font-bold text-sm md:text-base whitespace-nowrap">
                {step.title}
              </h3>
            </div>
            <p
              className={cx(
                "hidden md:block text-[11px] mt-1 whitespace-nowrap font-medium",
                i === 2
                  ? "text-muted-foreground dark:text-foreground/70"
                  : "text-primary-foreground/80",
              )}
            >
              {step.desc}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function FeatureBentoCard({
  icon,
  title,
  desc,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "group flex flex-col items-start border border-border bg-card p-6 text-left transition-colors hover:border-primary/50",
        className,
      )}
    >
      <div className="mb-4 border border-border bg-background p-3 transition-colors group-hover:border-primary/50">
        {icon}
      </div>
      <h3 className="text-lg font-bold mb-2 tracking-tight text-foreground group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed font-medium">
        {desc}
      </p>
    </div>
  );
}
