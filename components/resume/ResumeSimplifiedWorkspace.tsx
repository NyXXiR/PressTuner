"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleHelp,
  CreditCard,
  Ellipsis,
  FilePlus2,
  Files,
  LayoutDashboard,
  Layers,
  Megaphone,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { useResumeSimplifiedLayoutStore } from "@/stores/useResumeSimplifiedLayoutStore";

const WORKSPACE_MAX_CLASS = "max-w-[1536px]";
const NAV_EXPANDED_WIDTH_CLASS = "w-52";
const NAV_COLLAPSED_WIDTH_CLASS = "w-16";

const PRIMARY_NAV_ITEMS = [
  {
    label: "새 지원서",
    mobileLabel: "작성",
    href: "/resume/write",
    icon: FilePlus2,
    match: (pathname: string) =>
      pathname === "/resume/write" ||
      pathname.startsWith("/resume/write?") ||
      pathname === "/resume/write/legacy" ||
      pathname.startsWith("/resume/write/legacy?"),
    primary: true,
    prefetch: false,
  },
  {
    label: "대시보드",
    mobileLabel: "현황",
    href: "/resume/dashboard",
    icon: LayoutDashboard,
    match: (pathname: string) => pathname.startsWith("/resume/dashboard"),
    primary: false,
    prefetch: false,
  },
  {
    label: "지원서 목록",
    mobileLabel: "목록",
    href: "/resume/applications",
    icon: Files,
    match: (pathname: string) => pathname.startsWith("/resume/applications"),
    primary: false,
    prefetch: false,
  },
] as const;

const RESOURCE_NAV_ITEMS = [
  {
    label: "경험 보관함",
    href: "/resume/bricks",
    icon: Layers,
    match: (pathname: string) => pathname.startsWith("/resume/bricks"),
    prefetch: false,
  },
  {
    label: "문항 뱅크",
    href: "/resume/questions",
    icon: MessageSquareText,
    match: (pathname: string) => pathname.startsWith("/resume/questions"),
    prefetch: false,
  },
] as const;

const COMMON_NAV_ITEMS = [
  {
    label: "공지사항",
    href: "/resume/notices",
    icon: Megaphone,
    match: (pathname: string) => pathname.startsWith("/resume/notices"),
  },
  {
    label: "요금제",
    href: "/resume/pricing",
    icon: CreditCard,
    match: (pathname: string) => pathname.startsWith("/resume/pricing"),
  },
  {
    label: "고객지원",
    href: "/resume/contact",
    icon: CircleHelp,
    match: (pathname: string) => pathname.startsWith("/resume/contact"),
  },
] as const;

const MOBILE_NAV_ITEMS = PRIMARY_NAV_ITEMS;
const PANEL_NAV_ITEMS = [...RESOURCE_NAV_ITEMS, ...COMMON_NAV_ITEMS] as const;

type NavItem = {
  readonly label: string;
  readonly mobileLabel?: string;
  readonly href: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly match: (pathname: string) => boolean;
  readonly primary?: boolean;
  readonly prefetch?: boolean;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getNavWidthClass(collapsed: boolean) {
  return collapsed ? NAV_COLLAPSED_WIDTH_CLASS : NAV_EXPANDED_WIDTH_CLASS;
}

function isPublicResumeRoute(pathname: string) {
  return (
    pathname === "/resume" ||
    pathname === "/resume/pricing" ||
    pathname === "/resume/contact" ||
    pathname === "/resume/about" ||
    pathname === "/resume/redesign" ||
    pathname.startsWith("/resume/notices")
  );
}

function useEffectiveNavCollapsed() {
  const navCollapsed = useResumeSimplifiedLayoutStore((s) => s.navCollapsed);
  const hydrated = useResumeSimplifiedLayoutStore((s) => s.hydrated);

  return hydrated && navCollapsed;
}

function ResumeSimplifiedNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname() ?? "";
  const mobileServiceMenuRef = useRef<HTMLDivElement | null>(null);
  const navCollapsed = useEffectiveNavCollapsed();
  const toggleNavCollapsed = useResumeSimplifiedLayoutStore(
    (s) => s.toggleNavCollapsed,
  );
  const collapsed = !mobile && navCollapsed;
  const [mobileServiceOpen, setMobileServiceOpen] = useState(false);
  const toggleLabel = collapsed ? "좌측 작업 메뉴 펼치기" : "좌측 작업 메뉴 접기";
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const serviceMenuId = "resume-mobile-resource-menu";
  const mobileServiceLabel = mobileServiceOpen
    ? "자료/서비스 패널 닫기"
    : "자료/서비스 패널 열기";
  const mobileServiceActive = PANEL_NAV_ITEMS.some((item) => item.match(pathname));

  useEffect(() => {
    if (!mobile || !mobileServiceOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        mobileServiceMenuRef.current &&
        !mobileServiceMenuRef.current.contains(event.target as Node)
      ) {
        setMobileServiceOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileServiceOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobile, mobileServiceOpen]);

  const renderNavItem = (
    item: NavItem,
    options?: { onClick?: () => void; panel?: boolean },
  ) => {
    const active = item.match(pathname);
    const Icon = item.icon;
    const isPrimary = "primary" in item && item.primary;
    const isMobileTab = mobile && !options?.panel;
    const displayLabel =
      isMobileTab && "mobileLabel" in item ? item.mobileLabel : item.label;

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={options?.onClick}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed || isMobileTab ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        prefetch={"prefetch" in item ? item.prefetch : undefined}
        className={cx(
          "inline-flex items-center font-bold transition-colors",
          options?.panel
            ? "h-11 w-full justify-start gap-2.5 px-3 text-sm"
            : isMobileTab
              ? "h-11 min-w-0 justify-center gap-1.5 px-1 text-xs"
              : collapsed
                ? "mx-auto h-11 w-10 justify-center px-0 text-sm"
                : "h-11 w-full gap-2.5 px-3 text-sm",
          active
            ? isMobileTab
              ? "bg-primary text-primary-foreground"
              : "border-primary bg-primary text-primary-foreground"
            : isPrimary
              ? isMobileTab
                ? "text-primary hover:bg-primary/10"
                : "border-primary/25 bg-primary/5 text-primary hover:bg-primary/10"
              : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <span
            className={cx(
              "whitespace-nowrap",
              isMobileTab && "truncate text-[11px] sm:text-xs",
            )}
          >
            {displayLabel}
          </span>
        )}
      </Link>
    );
  };

  if (mobile) {
    return (
      <nav aria-label="자기소개서 작업 공간" className="wongoji-sharp relative overflow-visible py-2 lg:hidden">
        <div ref={mobileServiceMenuRef} className="relative">
          <div className="grid grid-cols-4 gap-1 border border-border/70 bg-background/95 p-1 backdrop-blur">
            {MOBILE_NAV_ITEMS.map((item) =>
              renderNavItem(item, {
                onClick: () => setMobileServiceOpen(false),
              }),
            )}
            <button
              type="button"
              onClick={() => setMobileServiceOpen((open) => !open)}
              aria-label={mobileServiceLabel}
              aria-expanded={mobileServiceOpen}
              aria-controls={serviceMenuId}
              className={cx(
                "inline-flex h-11 min-w-0 items-center justify-center gap-1.5 px-1 text-xs font-bold transition-colors",
                mobileServiceOpen || mobileServiceActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Ellipsis className="h-4 w-4 shrink-0" />
              <span className="truncate text-[11px] sm:text-xs">더보기</span>
            </button>
          </div>

          {mobileServiceOpen && (
            <div
              id={serviceMenuId}
              className="mt-2 border border-border bg-popover p-2 text-popover-foreground shadow-xl ring-1 ring-black/5"
            >
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                자료/서비스 메뉴
              </p>
              <div className="grid gap-1">
                {PANEL_NAV_ITEMS.map((item) =>
                  renderNavItem(item, {
                    onClick: () => setMobileServiceOpen(false),
                    panel: true,
                  }),
                )}
              </div>
            </div>
          )}
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label="자기소개서 작업 공간"
      className={cx(
        "wongoji-sharp sticky top-20 hidden min-h-[calc(100dvh-6rem)] w-full flex-col border-r border-border/70 lg:flex",
        collapsed ? "pr-2" : "pr-4",
      )}
    >
      <div className="space-y-2">
        <div
          className={cx(
            "flex items-center pb-2",
            collapsed ? "justify-center" : "justify-between px-3",
          )}
        >
          {!collapsed && (
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Workspace
            </p>
          )}
          <button
            type="button"
            onClick={toggleNavCollapsed}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            title={toggleLabel}
            className="inline-flex h-8 w-8 items-center justify-center border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ToggleIcon className="h-4 w-4" />
          </button>
        </div>
        {PRIMARY_NAV_ITEMS.map((item) => renderNavItem(item))}
      </div>

      <div className={cx("mt-5 space-y-2 border-t border-border/70 pt-4", collapsed ? "pb-2" : "pb-4")}>
        {!collapsed && (
          <p className="px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Resources
          </p>
        )}
        {RESOURCE_NAV_ITEMS.map((item) => renderNavItem(item))}
      </div>

      <div className={cx("mt-auto space-y-2 border-t border-border/70 pt-4", collapsed ? "pb-2" : "pb-4")}>
        {!collapsed && (
          <p className="px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Service
          </p>
        )}
        {COMMON_NAV_ITEMS.map((item) => renderNavItem(item))}
      </div>
    </nav>
  );
}

export function ResumeSimplifiedWorkspace({
  children,
  mainClassName,
  paddingClassName = "pb-32 pt-8 sm:pt-10",
}: {
  children: ReactNode;
  mainClassName?: string;
  paddingClassName?: string;
}) {
  const pathname = usePathname() ?? "";
  const navCollapsed = useEffectiveNavCollapsed();
  const navWidthClass = getNavWidthClass(navCollapsed);
  const headerHomeHref = isPublicResumeRoute(pathname) ? "/resume" : "/resume/write";

  return (
    <div className="theme-resume wongoji min-h-dvh bg-background text-foreground selection:bg-primary/30">
      <Header
        mode="RESUME"
        variant="simple"
        homeHref={headerHomeHref}
        contentClassName={WORKSPACE_MAX_CLASS}
      />

      <div className="sticky top-16 z-40 border-b border-border/70 bg-background/95 backdrop-blur lg:hidden">
        <div className={cx("mx-auto w-full px-4 sm:px-6", WORKSPACE_MAX_CLASS)}>
          <ResumeSimplifiedNav mobile />
        </div>
      </div>

      <div
        className={cx(
          "mx-auto flex w-full gap-5 px-4 sm:px-6",
          WORKSPACE_MAX_CLASS,
        )}
      >
        <aside
          className={cx(
            "hidden shrink-0 pt-8 transition-[width] duration-200 lg:block",
            navWidthClass,
          )}
        >
          <ResumeSimplifiedNav />
        </aside>
        <main className={cx("min-w-0 flex-1", paddingClassName, mainClassName)}>
          {children}
        </main>
      </div>
    </div>
  );
}
