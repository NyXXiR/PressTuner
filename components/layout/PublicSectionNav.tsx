"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type PublicSectionNavProps = {
  basePath?: string;
};

const NAV_ITEMS = [
  { label: "공지사항", href: "/notices" },
  { label: "가격 정책", href: "/pricing" },
  { label: "문의하기", href: "/contact" },
] as const;

function isVisiblePath(pathname: string, basePath: string) {
  return NAV_ITEMS.some((item) => pathname === `${basePath}${item.href}`);
}

export function PublicSectionNav({
  basePath = "",
}: PublicSectionNavProps) {
  const pathname = usePathname();

  if (!isVisiblePath(pathname, basePath)) {
    return null;
  }

  return (
    <div className="border-b border-border bg-background/72 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-6xl px-4 lg:px-8">
        <nav
          aria-label="공개 페이지 이동"
          className="flex gap-2 overflow-x-auto py-3"
        >
          {NAV_ITEMS.map((item) => {
            const href = `${basePath}${item.href}`;
            const active = pathname === href;

            return (
              <Link
                key={href}
                href={href}
                className={[
                  "whitespace-nowrap border px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
