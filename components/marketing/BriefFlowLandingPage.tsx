import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { AuthRedirectIfAuthed } from "@/components/marketing/AuthRedirectIfAuthed";
import { TrackedMarketingLink } from "@/components/marketing/TrackedMarketingLink";
import { ArrowRight, Briefcase, Newspaper, PlayCircle } from "lucide-react";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const TRACKS = [
  {
    id: "press",
    eyebrow: "PRESS",
    title: "보도자료 AI",
    description:
      "출시·제휴·행사 소식을 팀 톤에 맞는 보도자료 초안으로. 자유롭게 메모만 입력하면 됩니다.",
    href: "/press",
    startHref: "/login?next=/press/new",
    startLabel: "바로 작성 시작",
    icon: Newspaper,
    accentClass: "text-primary",
    bgClass: "bg-primary/10 border-primary/20",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
  },
  {
    id: "resume",
    eyebrow: "CAREER",
    title: "자기소개서 AI",
    description:
      "이력서와 경험을 재사용 가능한 브릭으로 정리하고, 회사별 문항에 맞춰 초안을 조립합니다.",
    href: "/resume",
    startHref: "/login?next=/resume/write",
    startLabel: "바로 작성 시작",
    icon: Briefcase,
    accentClass: "text-violet-500",
    bgClass: "bg-violet-500/10 border-violet-500/20",
    badgeClass: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  },
] as const;

export function BriefFlowLandingPage() {
  return (
    <>
      <AuthRedirectIfAuthed redirectTo="/my/dashboard" />
      <MarketingHome />
    </>
  );
}

function MarketingHome() {
  return (
    <div className="relative w-full overflow-x-hidden">
      {/* ── Hero ── */}
      <section className="pt-20 pb-16 text-center px-4">
        <div className="mx-auto max-w-3xl">
          <span className="inline-block mb-6 border border-border bg-card px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            brieFFlow
          </span>

          <h1 className="text-4xl font-bold leading-[1.18] tracking-tight text-foreground md:text-6xl mb-5">
            작성 목적에 맞는 AI로
            <br />
            <span className="text-muted-foreground/70">바로 시작하세요.</span>
          </h1>

          <p className="text-base text-muted-foreground md:text-lg leading-relaxed max-w-xl mx-auto mb-10 break-keep">
            보도자료를 써야 한다면 <strong className="text-foreground/80">PRESS</strong>로,
            자기소개서를 써야 한다면 <strong className="text-foreground/80">CAREER</strong>로 들어가세요.
          </p>

          <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-3">
            <TrackedMarketingLink
              href="/login?next=/press/new"
              className="inline-flex h-12 items-center justify-center gap-2 bg-primary text-primary-foreground px-7 text-sm font-bold hover:opacity-90 transition-all hover:scale-[1.02]"
              eventName="primary_cta_clicked"
              eventParams={{ cta_name: "hero_press_start", source: "landing_hero", target_path: "/login?next=/press/new" }}
            >
              <Newspaper className="w-4 h-4" />
              보도자료 작성
              <ArrowRight className="w-4 h-4" />
            </TrackedMarketingLink>
            <TrackedMarketingLink
              href="/login?next=/resume/write"
              className="inline-flex h-12 items-center justify-center gap-2 border border-border bg-background px-7 text-sm font-bold text-foreground hover:bg-muted/40 transition-colors"
              eventName="primary_cta_clicked"
              eventParams={{ cta_name: "hero_resume_start", source: "landing_hero", target_path: "/login?next=/resume/write" }}
            >
              <Briefcase className="w-4 h-4 text-violet-500" />
              자기소개서 작성
              <ArrowRight className="w-4 h-4" />
            </TrackedMarketingLink>
            <TrackedMarketingLink
              href="/demo"
              className="inline-flex h-12 items-center justify-center gap-2 border border-primary/30 bg-primary/5 px-7 text-sm font-bold text-primary hover:bg-primary/10 transition-colors sm:basis-full sm:mx-auto sm:max-w-xs"
              eventName="product_demo_opened"
              eventParams={{ source: "landing_hero", target_path: "/demo" }}
            >
              <PlayCircle className="w-4 h-4" />
              로그인 없이 제품 데모 보기
              <ArrowRight className="w-4 h-4" />
            </TrackedMarketingLink>
          </div>
        </div>
      </section>

      {/* ── 트랙 카드 ── */}
      <section className="py-12 border-t border-border/40 px-4">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-5 md:grid-cols-2">
            {TRACKS.map((track) => {
              const Icon = track.icon;
              return (
                <article
                  key={track.id}
                  className={cx(
                    "border p-7 text-left transition-all",
                    track.bgClass
                  )}
                >
                  <span
                    className={cx(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold mb-5",
                      track.badgeClass
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {track.eyebrow}
                  </span>

                  <h2 className="text-2xl font-bold tracking-tight text-foreground mb-3">
                    {track.title}
                  </h2>
                  <p className="text-sm leading-7 text-muted-foreground mb-6 break-keep">
                    {track.description}
                  </p>

                  <TrackedMarketingLink
                    href={track.startHref}
                    className={cx(
                      "inline-flex items-center gap-2 h-10 px-5 text-sm font-bold transition-all hover:scale-[1.02]",
                      track.id === "press"
                        ? "bg-primary text-primary-foreground hover:opacity-90"
                        : "bg-violet-500 text-white hover:opacity-90"
                    )}
                    eventName="track_start_clicked"
                    eventParams={{ cta_name: `${track.id}_start`, source: "landing_track_card", target_path: track.startHref }}
                  >
                    {track.startLabel}
                    <ArrowRight className="w-4 h-4" />
                  </TrackedMarketingLink>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
