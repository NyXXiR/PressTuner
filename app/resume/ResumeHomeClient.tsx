"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMeStore } from "@/stores/useMeStore";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import {
  ArrowRightLeft,
  BriefcaseBusiness,
  ChevronRight,
  Cpu,
  FileJson,
  Layers,
} from "lucide-react";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function ResumeHomeClient() {
  const router = useRouter();
  const { authStatus, checked, loading, fetchMe } = useMeStore();
  const isAuthed = authStatus === "authed";

  useEffect(() => {
    if (!checked && !loading) fetchMe();
  }, [checked, loading, fetchMe]);

  useEffect(() => {
    if (checked && isAuthed) router.replace("/resume/dashboard");
  }, [checked, isAuthed, router]);

  if (!checked || loading) {
    return (
      <div className="theme-resume flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isAuthed) return null;

  return <MarketingResumeHome />;
}

function MarketingResumeHome() {
  return (
    <div className="theme-resume relative w-full overflow-x-hidden -mt-10 -mb-10 bg-transparent text-foreground">
      <section className="relative pt-12 pb-16 text-center -mt-6 sm:-mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex justify-center mb-6 pt-20">
            <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold tracking-wider uppercase border border-primary/20">
              자기소개서 AI · Resume Track
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.2] mb-6">
            이력서와 문항을 넣으면, <br />
            <span className="text-muted-foreground/80 dark:text-muted-foreground">
              자소서 작업이 시작됩니다.
            </span>
          </h1>

          <p className="mx-auto max-w-xl text-base md:text-lg text-muted-foreground leading-relaxed mb-10 font-light">
            회사마다 다른 질문을 매번 새로 쓰지 않도록, 먼저 경험을{" "}
            <span className="pt-hl pt-hl-hint dark:bg-primary/20 bg-primary/10 text-foreground font-semibold px-1">
              브릭(Brick)
            </span>
            으로 정리합니다.
            <br className="hidden sm:block" />
            이후 지원 회사와 문항에 맞는 브릭을 찾아 자기소개서 초안으로 조립합니다.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/login?next=/resume/write"
              className="h-14 px-10 bg-primary text-primary-foreground font-bold inline-flex items-center justify-center hover:scale-[1.02] transition-all"
            >
              내 경험 브릭 추출하기
              <ChevronRight className="ml-1 h-5 w-5" />
            </Link>
            <Link
              href="/login?next=/resume/applications"
              className="h-14 px-10 border border-border bg-background/60 text-foreground font-bold inline-flex items-center justify-center hover:bg-muted/30 transition-colors"
            >
              지원 문항부터 등록
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-8 text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-2">
              START HERE
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              들어오면 바로 할 일은 세 가지입니다
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                icon: BriefcaseBusiness,
                title: "이력서와 경험 붙여넣기",
                desc: "이미 가진 이력서, 프로젝트 기록, 경력 메모를 먼저 넣습니다.",
              },
              {
                icon: Layers,
                title: "경험 브릭 만들기",
                desc: "AI가 경험을 재사용 가능한 소재 단위로 나누고 정리합니다.",
              },
              {
                icon: ArrowRightLeft,
                title: "문항에 맞춰 조립",
                desc: "회사별 질문에 맞는 브릭을 골라 자기소개서 초안을 만듭니다.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className="pt-surface border border-border/60 bg-card/40 p-6 text-left backdrop-blur-sm"
                >
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center border border-border bg-background/70">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold leading-snug text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    {item.desc}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="process" className="py-12 border-t border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="mb-8 flex flex-col items-center text-center">
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-1">
              WORKFLOW
            </p>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              경험 정리부터 초안 생성까지 한 흐름으로
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

      <section id="features" className="py-20 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<Layers className="text-violet-500" />}
              title="경험 브릭(Brick) 시스템"
              desc="긴 줄글의 이력서를 의미 있는 최소 단위인 '브릭'으로 변환하여 관리합니다."
            />
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<ArrowRightLeft className="text-primary" />}
              title="자동 소재 매칭"
              desc="'도전적인 경험을 쓰시오'라는 문항에 딱 맞는 내 브릭을 AI가 찾아 배치합니다."
            />
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<Cpu className="text-blue-400" />}
              title="인재상 맞춤형 답변 생성"
              desc="단순한 작문이 아닙니다. 회사의 인재상과 톤앤매너를 분석해, 경험 브릭을 해당 기업의 언어로 재조립합니다."
            />
            <FeatureBentoCard
              className="md:col-span-6"
              icon={<FileJson className="text-indigo-400" />}
              title="지원 현황 통합 관리"
              desc="A사에는 '소통'으로, B사에는 '리더십'으로. 하나의 브릭이 회사별로 어떻게 변주되어 사용되었는지 파악하세요."
            />
          </div>
        </div>
      </section>

      <section className="py-20 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="pt-surface bg-card/40 backdrop-blur-md px-8 py-16 text-center relative overflow-hidden group border border-border/50">
            <div className="relative z-10 max-w-3xl mx-auto">
              <h2 className="text-2xl md:text-4xl font-bold tracking-tight mb-6">
                지원할 회사가 정해졌다면, <br />
                지금 바로 자소서 초안을 시작하세요.
              </h2>

              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  href="/login?next=/resume/write"
                  className="h-12 px-8 bg-foreground text-background font-bold inline-flex items-center justify-center hover:scale-[1.02] transition-all text-sm"
                >
                  경험 브릭부터 만들기
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
                : ""
            )}
            style={{ marginLeft: !isFirst ? "-14px" : "0" }}
          >
            <div className="flex items-center gap-2 md:flex-col md:gap-1">
              <span className={cx("text-[9px] font-bold uppercase tracking-widest", i === 2 ? "opacity-60" : "opacity-80")}>
                Step {i + 1}
              </span>
              <h3 className="font-bold text-sm md:text-base whitespace-nowrap">
                {step.title}
              </h3>
            </div>
            <p className={cx("hidden md:block text-[11px] mt-1 whitespace-nowrap font-medium", i === 2 ? "text-muted-foreground dark:text-foreground/70" : "text-primary-foreground/80")}>
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
        "group relative p-6 flex flex-col items-center text-center transition-all duration-300",
        "bg-card/20 backdrop-blur-sm",
        "hover:bg-card/40",
        "border border-white/10 dark:border-white/10",
        "hover:border-primary/50",
        "hover:shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)]",
        className
      )}
    >
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
