"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CircleHelp,
  CreditCard,
  Ellipsis,
  FilePlus2,
  Files,
  LayoutDashboard,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { Header } from "@/components/layout/Header";
import { usePressSimplifiedLayoutStore } from "@/stores/usePressSimplifiedLayoutStore";

const WORKSPACE_MAX_CLASS = "max-w-[1536px]";
const NAV_EXPANDED_WIDTH_CLASS = "w-52";
const NAV_COLLAPSED_WIDTH_CLASS = "w-16";

const NAV_ITEMS = [
  {
    label: "새 보도자료",
    mobileLabel: "작성",
    href: "/press/new",
    icon: FilePlus2,
    match: (pathname: string) =>
      pathname === "/press/new" ||
      /^\/press\/[^/]+\/(edit|final)$/.test(pathname) ||
      pathname.startsWith("/press/simplified"),
    primary: true,
    prefetch: false,
  },
  {
    label: "대시보드",
    mobileLabel: "현황",
    href: "/press/dashboard",
    icon: LayoutDashboard,
    match: (pathname: string) => pathname.startsWith("/press/dashboard"),
    primary: false,
    prefetch: false,
  },
  {
    label: "보도자료 목록",
    mobileLabel: "목록",
    href: "/press/articles",
    icon: Files,
    match: (pathname: string) =>
      pathname === "/press/articles" || pathname.startsWith("/press/articles/"),
    primary: false,
    prefetch: false,
  },
  {
    label: "근거 문서",
    mobileLabel: "근거",
    href: "/press/knowledge",
    icon: BookOpen,
    match: (pathname: string) => pathname.startsWith("/press/knowledge"),
    primary: false,
    prefetch: false,
  },
] as const;

const COMMON_NAV_ITEMS = [
  {
    label: "공지사항",
    href: "/press/notices",
    icon: Megaphone,
    match: (pathname: string) => pathname.startsWith("/press/notices"),
  },
  {
    label: "요금제",
    href: "/press/pricing",
    icon: CreditCard,
    match: (pathname: string) => pathname.startsWith("/press/pricing"),
  },
  {
    label: "고객지원",
    href: "/press/contact",
    icon: CircleHelp,
    match: (pathname: string) => pathname.startsWith("/press/contact"),
  },
] as const;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getNavWidthClass(collapsed: boolean) {
  return collapsed ? NAV_COLLAPSED_WIDTH_CLASS : NAV_EXPANDED_WIDTH_CLASS;
}

function useEffectiveNavCollapsed() {
  const navCollapsed = usePressSimplifiedLayoutStore((s) => s.navCollapsed);
  const hydrated = usePressSimplifiedLayoutStore((s) => s.hydrated);

  return hydrated && navCollapsed;
}

function PressSimplifiedNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname() ?? "";
  const mobileServiceMenuRef = useRef<HTMLDivElement | null>(null);
  const navCollapsed = useEffectiveNavCollapsed();
  const toggleNavCollapsed = usePressSimplifiedLayoutStore(
    (s) => s.toggleNavCollapsed,
  );
  const collapsed = !mobile && navCollapsed;
  const [mobileServiceOpen, setMobileServiceOpen] = useState(false);
  const toggleLabel = collapsed ? "좌측 작업 메뉴 펼치기" : "좌측 작업 메뉴 접기";
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const serviceMenuId = "press-mobile-service-menu";
  const mobileServiceActive = COMMON_NAV_ITEMS.some((item) =>
    item.match(pathname),
  );

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
    item: (typeof NAV_ITEMS)[number] | (typeof COMMON_NAV_ITEMS)[number],
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
        role={options?.panel ? "menuitem" : undefined}
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
      <nav
        aria-label="보도자료 작업 공간"
        className="relative overflow-visible py-2 lg:hidden"
      >
        <div ref={mobileServiceMenuRef} className="relative">
          <div className="grid grid-cols-5 gap-1 border border-border/70 bg-background/95 p-1 backdrop-blur">
            {NAV_ITEMS.map((item) =>
              renderNavItem(item, {
                onClick: () => setMobileServiceOpen(false),
              }),
            )}
            <button
              type="button"
              onClick={() => setMobileServiceOpen((open) => !open)}
              aria-label="보조 메뉴 열기"
              aria-expanded={mobileServiceOpen}
              aria-controls={serviceMenuId}
              aria-haspopup="menu"
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
              role="menu"
              className="mt-2 border border-border bg-popover p-2 text-popover-foreground shadow-xl ring-1 ring-black/5"
            >
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                서비스 메뉴
              </p>
              <div className="grid gap-1">
                {COMMON_NAV_ITEMS.map((item) =>
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
      aria-label="보도자료 작업 공간"
      className={cx(
        "sticky top-20 hidden min-h-[calc(100dvh-6rem)] w-full flex-col border-r border-border/70 lg:flex",
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
        {NAV_ITEMS.map((item) => renderNavItem(item))}
      </div>

      <div
        className={cx(
          "mt-auto space-y-2 border-t border-border/70 pt-4",
          collapsed ? "pb-2" : "pb-4",
        )}
      >
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

export function PressSimplifiedWorkspace({
  children,
  mainClassName,
  paddingClassName = "pb-32 pt-8 sm:pt-10",
}: {
  children: ReactNode;
  mainClassName?: string;
  paddingClassName?: string;
}) {
  const navCollapsed = useEffectiveNavCollapsed();
  const navWidthClass = getNavWidthClass(navCollapsed);

  return (
    <>
      <Header
        mode="PRESS"
        variant="simple"
        homeHref="/press/new"
        contentClassName={WORKSPACE_MAX_CLASS}
      />

      <div className="sticky top-16 z-40 border-b border-border/70 bg-background/95 backdrop-blur lg:hidden">
        <div className={cx("mx-auto w-full px-4 sm:px-6", WORKSPACE_MAX_CLASS)}>
          <PressSimplifiedNav mobile />
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
          <PressSimplifiedNav />
        </aside>
        <main className={cx("min-w-0 flex-1", paddingClassName, mainClassName)}>
          {children}
        </main>
      </div>
    </>
  );
}

export function PressSimplifiedBottomBar({
  children,
  contentClassName,
}: {
  children: ReactNode;
  contentClassName?: string;
}) {
  const navCollapsed = useEffectiveNavCollapsed();
  const navWidthClass = getNavWidthClass(navCollapsed);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className={cx("mx-auto flex w-full gap-5", WORKSPACE_MAX_CLASS)}>
        <div
          className={cx(
            "hidden shrink-0 transition-[width] duration-200 lg:block",
            navWidthClass,
          )}
        />
        <div className={cx("min-w-0 flex-1", contentClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
}
