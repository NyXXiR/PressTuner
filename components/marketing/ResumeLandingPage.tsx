import Link from "next/link";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { AuthRedirectIfAuthed } from "@/components/marketing/AuthRedirectIfAuthed";
import {
  Layers,
  Cpu,
  FileJson,
  ArrowRightLeft,
  ChevronRight,
} from "lucide-react";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function ResumeLandingPage() {
  return (
    <>
      <AuthRedirectIfAuthed redirectTo="/resume/write" />
      <MarketingResumeHome />
    </>
  );
}

function MarketingResumeHome() {
  return (
    <div className="theme-resume relative w-full overflow-x-hidden -mt-10 -mb-10 bg-transparent text-foreground">
      {/* 1. HERO SECTION */}
      <section className="relative pt-12 pb-16 text-center -mt-6 sm:-mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="absolute top-0 left-1/2 -z-10 h-[400px] w-full max-w-[800px] -translate-x-1/2 -translate-y-20 opacity-[0.08] dark:opacity-20 [background:radial-gradient(circle_at_center,hsl(var(--primary))_0,transparent_70%)]" />

          <div className="flex justify-center mb-6 pt-20">
            <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold tracking-wider uppercase border border-primary/20">
              자기소개서 AI · Cover Letter AI
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.2] mb-6">
            자기소개서 AI로 초안을 만들고, <br />
            <span className="text-muted-foreground/80 dark:text-muted-foreground">
              자소서 문항별로 다시 조립하세요.
            </span>
          </h1>

          <p className="mx-auto max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed mb-10 font-light">
            회사마다 다른 질문, 자소서마다 새로 쓰지 마세요.
            <br className="hidden sm:block" />
            당신의 이력서를{" "}
            <span className="pt-hl pt-hl-hint dark:bg-primary/20 bg-primary/10 text-foreground font-semibold px-1">
              경험 브릭(Brick)
            </span>
            으로 분해하고,
            <br className="hidden sm:block" />
            기업의 문항에 딱 맞는 브릭을 찾아 <strong>자기소개서 초안으로 자동 조립</strong>해
            드립니다.
          </p>

          <div className="flex justify-center">
            <Link
              href="/login?next=/resume"
              className="h-14 px-10 bg-primary text-primary-foreground font-bold inline-flex items-center justify-center hover:scale-[1.02] transition-all"
            >
              내 경험 브릭 추출하기
              <ChevronRight className="ml-1 h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* 2. PROCESS SECTION */}
      <section id="process" className="py-12 border-t border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="mb-8 flex flex-col items-center text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-1">
              WORKFLOW
            </p>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              복잡한 자소서, 3단계로 끝내기
            </h2>
          </div>

          <ChevronProgressBar
            steps={[
              { title: "경험 브릭 추출", desc: "이력서에서 핵심 소재 분해" },
              { title: "기업/문항 입력", desc: "지원할 회사의 질문 등록" },
              { title: "AI 맞춤 조립", desc: "질문별 최적 브릭 배정 & 생성" },
            ]}
          />
        </div>
      </section>

      {/* 3. FEATURES */}
      <section id="features" className="py-20 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {/* ✅ 2행 2열 중앙 정렬을 위한 Grid 설정 */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* 카드 1 */}
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<Layers className="text-violet-500" />}
              title="경험 브릭(Brick) 시스템"
              desc="긴 줄글의 이력서를 의미 있는 최소 단위인 '브릭'으로 변환하여 관리합니다."
            />

            {/* 카드 2: ✅ 색상 통일됨, 아이콘만 포인트 컬러 */}
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<ArrowRightLeft className="text-primary" />}
              title="자동 소재 매칭"
              desc="'도전적인 경험을 쓰시오'라는 문항에 딱 맞는 내 브릭을 AI가 찾아 배치합니다."
            />

            {/* 카드 3 */}
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<Cpu className="text-blue-400" />}
              title="인재상 맞춤형 답변 생성"
              desc="단순한 작문이 아닙니다. 회사의 인재상과 톤앤매너를 분석해, 경험 브릭을 해당 기업의 언어로 재조립합니다."
            />

            {/* 카드 4 */}
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<FileJson className="text-indigo-400" />}
              title="지원 현황 통합 관리"
              desc="A사에는 '소통'으로, B사에는 '리더십'으로. 하나의 브릭이 회사별로 어떻게 변주되어 사용되었는지 파악하세요."
            />
          </div>
        </div>
      </section>

      {/* 4. CTA SECTION */}
      <section className="py-20 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="pt-surface bg-card/40 backdrop-blur-md px-8 py-16 text-center relative overflow-hidden group border border-border/50">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,hsl(var(--primary))_0,transparent_70%)] transition-opacity group-hover:opacity-20" />

            <div className="relative z-10 max-w-3xl mx-auto">
              <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-6">
                서류 지원의 고통에서 <br />
                해방되세요.
              </h2>

              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/login?next=/resume"
                  className="h-12 px-8 bg-foreground text-background font-bold inline-flex items-center justify-center hover:scale-[1.02] transition-all text-sm"
                >
                  무료로 시작하기
                </Link>

                <Link
                  href="/resume/about"
                  className="h-12 px-8 border border-border bg-transparent text-foreground font-bold inline-flex items-center justify-center hover:bg-muted/20 transition-colors text-sm"
                >
                  사용법 더 알아보기
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-8 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-2">
              GUIDES
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              검색 유입용 상세 페이지도 함께 제공합니다
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              자기소개서 AI, 자소서 AI, 보도자료 AI를 각각 어떤 사용자와 상황에
              맞춰 설계했는지 별도 안내 페이지에서 확인할 수 있습니다.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <article className="pt-surface border border-border/60 bg-card/40 p-6 text-left backdrop-blur-sm">
              <h3 className="text-lg font-bold leading-snug text-foreground">
                자기소개서 AI 상세 페이지
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                문항별 소재 매칭, 자소서 초안 생성, 경험 재사용 방식까지 한 번에
                정리한 안내 페이지입니다.
              </p>
              <Link
                href="/cover-letter-ai"
                className="mt-4 inline-flex items-center text-sm font-semibold text-primary"
              >
                자기소개서 AI 자세히 보기
              </Link>
            </article>
            <article className="pt-surface border border-border/60 bg-card/40 p-6 text-left backdrop-blur-sm">
              <h3 className="text-lg font-bold leading-snug text-foreground">
                보도자료 AI 상세 페이지
              </h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                press release AI writer 흐름으로 출시와 공지 초안을 만드는 과정을
                별도 페이지에서 설명합니다.
              </p>
              <Link
                href="/press"
                className="mt-4 inline-flex items-center text-sm font-semibold text-primary"
              >
                보도자료 AI 자세히 보기
              </Link>
            </article>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

// ----------------------------------------------------------------------
// SUB COMPONENTS
// ----------------------------------------------------------------------

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

              // ✅ 직관적 색상 처리: Primary 컬러의 농도(Opacity)로 단계 표현
              i === 0
                ? "bg-primary text-primary-foreground z-30" // 100% (가장 진함)
                : i === 1
                ? "bg-primary/60 text-primary-foreground/95 z-20" // 60% (중간)
                : "bg-primary/20 text-foreground dark:text-foreground/90 z-10", // 20% (가장 연함)

              // Clip-path (화살표 모양)
              !isFirst && !isLast
                ? "[clip-path:polygon(calc(100%-15px)_0,100%_50%,calc(100%-15px)_100%,0_100%,15px_50%,0_0)]"
                : "",
              isFirst
                ? "[clip-path:polygon(calc(100%-15px)_0,100%_50%,calc(100%-15px)_100%,0_100%,0_0)]"
                : "",
              isLast
                ? "[clip-path:polygon(100%_0,100%_100%,0_100%,15px_50%,0_0)]"
                : ""
            )}
            style={{ marginLeft: !isFirst ? "-14px" : "0" }}
          >
            <div className="flex items-center gap-2 md:flex-col md:gap-1">
              <span
                className={cx(
                  "text-[9px] font-bold uppercase tracking-widest",
                  // 단계별 텍스트 투명도 미세 조정
                  i === 2 ? "opacity-60" : "opacity-80"
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
                  : "text-primary-foreground/80"
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
        // [레이아웃 & 트랜지션]
        "group relative p-6 flex flex-col items-center text-center transition-all duration-300",

        // [배경 스타일]
        // 일관된 Glassy 배경 적용
        "bg-card/20 backdrop-blur-sm",
        "hover:bg-card/40",

        // [테두리 스타일 ✅]
        // 평소: border-white/10 (잘 보이도록 수정)
        // 호버: border-primary/50 (포인트 컬러)
        "border border-white/10 dark:border-white/10",
        "hover:border-primary/50",

        // [그림자 효과]
        // 호버 시 Primary 색상의 은은한 Glow
        "hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)]",
        className
      )}
    >
      {/* 아이콘 컨테이너 */}
      <div className="mb-4 p-3 bg-white/5 border border-white/10 group-hover:scale-110 group-hover:bg-white/10 transition-transform">
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
