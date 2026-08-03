import Link from "next/link";
import { PageHeader } from "@/components/page/PageHeader";
import { ArrowRight } from "lucide-react";

const SUPPORT_EMAIL = "lgh0334@gmail.com";
const DISCORD_INVITE_URL = "https://discord.gg/7AA863NbWX";

// 옵션: 비워두면 섹션이 안 보임
const GITHUB_PROFILE_URL = ""; // e.g. "https://github.com/your-id"
const OTHER_CONTACT_URL = ""; // e.g. "https://open.kakao.com/..."

function buildMailtoHref() {
  const subject = encodeURIComponent("[brieFFlow] 문의/피드백");
  const body = encodeURIComponent(
    [
      "문의 유형: (버그/기능요청/기타)",
      "내용:",
      "",
      "재현 방법:",
      "1) ",
      "2) ",
      "",
      "기대 결과:",
      "실제 결과:",
      "",
      "현재 페이지 URL:",
      "",
      "브라우저/디바이스:",
    ].join("\n"),
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

type Item = {
  key: string;
  title: string;
  description: string;
  value?: string;
  href: string;
  actionLabel: string;
  icon: string;
  external?: boolean;
  show?: boolean;
};

export function ContactPageContent({
  eyebrow = "Support",
  title = "문의하기",
  description = "불편한 점/버그/기능 요청을 남겨주시면 확인 후 반영할게요.",
  noticesHref = "/notices",
  noticesLabel = "공지사항 보러가기",
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  noticesHref?: string;
  noticesLabel?: string;
}) {
  const items: Item[] = [
    {
      key: "email",
      title: "이메일",
      description: "버그/기능 요청을 메일로 남겨주세요.",
      value: SUPPORT_EMAIL,
      href: buildMailtoHref(),
      actionLabel: "메일 보내기",
      icon: "✉️",
      show: true,
    },
    {
      key: "discord",
      title: "Discord Support",
      description: "빠른 Q&A / 공지 / 피드백 채널",
      value: "discord.gg/7AA863NbWX",
      href: DISCORD_INVITE_URL,
      actionLabel: "서버로 이동",
      icon: "💬",
      external: true,
      show: true,
    },
    {
      key: "github",
      title: "GitHub",
      description: "프로필/프로젝트 링크",
      value: GITHUB_PROFILE_URL,
      href: GITHUB_PROFILE_URL,
      actionLabel: "프로필 보기",
      icon: "🐙",
      external: true,
      show: Boolean(GITHUB_PROFILE_URL),
    },
    {
      key: "other",
      title: "기타",
      description: "추가 연락/링크",
      value: OTHER_CONTACT_URL,
      href: OTHER_CONTACT_URL,
      actionLabel: "열기",
      icon: "🔗",
      external: true,
      show: Boolean(OTHER_CONTACT_URL),
    },
  ].filter((x) => x.show);

  return (
    <div className="w-full">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader eyebrow={eyebrow} title={title} description={description} />
        <Link
          href={noticesHref}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 border border-border bg-card px-5 text-sm font-bold transition-colors hover:bg-muted"
        >
          {noticesLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      <div className="mt-6 border-t-2 border-foreground">
        {items.map((item) => (
          <a
            key={item.key}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noreferrer" : undefined}
            className="group flex items-center gap-4 border-b border-border px-1 py-4 transition-colors hover:bg-primary/[0.03] sm:py-5"
          >
            <span className="text-xl" aria-hidden="true">
              {item.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">
                {item.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.description}
              </p>
              {item.value && (
                <p className="mt-1.5 truncate font-mono text-xs tabular-nums text-foreground/90">
                  {item.value}
                </p>
              )}
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {item.actionLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </a>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        * 재현 방법/환경/URL을 같이 적어주면 해결이 훨씬 빨라져요.
      </p>
    </div>
  );
}
