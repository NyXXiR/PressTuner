"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import Image from "next/image";

import {
  Bell,
  ChevronDown,
  CreditCard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  User,
  Zap,
  ChevronRight,
  Briefcase,
  Newspaper,
} from "lucide-react";

import { useMeStore } from "@/stores/useMeStore";
import { useNotificationsStore } from "@/stores/notificationsStore";
import { useUiStore } from "@/stores/useUiStore";

import { NotificationPopover } from "@/components/notifications/NotificationPopover";
import type {
  AppNotification,
  InvitationNotification,
  NoticeNotification,
  InfoNotification,
  LinkNotification,
} from "@/components/notifications/types";
import { getPlanBadgeStyle } from "@/config/billing/plans";
import { getProfileMenuItems, type CommonNavMode } from "@/lib/constants/nav";
import {
  formatQuotaBalance,
  formatQuotaRemaining,
  toQuotaView,
  type QuotaStatus,
} from "@/lib/quota/quotaView";

const ADMIN_HUB_LINK_VISIBLE =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_LEGACY_ROUTES === "true" ||
  process.env.NEXT_PUBLIC_ENABLE_DEV_BILLING_SANDBOX === "true";
const DEV_BILLING_SANDBOX_LINK_VISIBLE =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_DEV_BILLING_SANDBOX === "true";
const LEGACY_ADMIN_LINKS_VISIBLE =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_LEGACY_ROUTES === "true";

const QUOTA_PILL_STYLES = {
  available:
    "border-border/50 bg-muted/50 hover:border-primary/30 hover:bg-muted",
  near_limit: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  limited: "border-destructive/40 text-destructive",
} satisfies Record<QuotaStatus, string>;

const QUOTA_PROGRESS_STYLES = {
  available: "bg-primary",
  near_limit: "bg-amber-500",
  limited: "bg-destructive",
} satisfies Record<QuotaStatus, string>;

type HeaderProps = {
  onToggleSidebar?: () => void;
  mode?: "PRESS" | "RESUME" | "STANDARD";
  variant?: "default" | "simple";
  homeHref?: string;
  contentClassName?: string;
};

function isInvitation(n: AppNotification): n is InvitationNotification {
  return n.type === "INVITATION";
}
function isNotice(n: AppNotification): n is NoticeNotification {
  return n.type === "NOTICE";
}
function hasTitle(
  n: AppNotification,
): n is NoticeNotification | InfoNotification | LinkNotification {
  return n.type !== "INVITATION";
}
function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function Header({
  onToggleSidebar,
  mode = "PRESS",
  variant = "default",
  homeHref,
  contentClassName,
}: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const isSimple = variant === "simple";

  const me = useMeStore((s) => s.me);
  const loading = useMeStore((s) => s.loading);
  const checked = useMeStore((s) => s.checked);
  const authStatus = useMeStore((s) => s.authStatus);
  const fetchMe = useMeStore((s) => s.fetchMe);
  const clearMe = useMeStore((s) => s.clearMe);

  const isAuthed = authStatus === "authed";
  const isGuest = authStatus === "guest";
  const isSuperAdmin = me?.isSuperAdmin === true;

  const popover = useNotificationsStore((s) => s.popover);
  const fetchNotifications = useNotificationsStore((s) => s.fetchList);

  // --- Popover States ---
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const popoverWrapRef = useRef<HTMLDivElement | null>(null);

  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement | null>(null);

  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const usageWrapRef = useRef<HTMLDivElement | null>(null);

  const [isModeOpen, setIsModeOpen] = useState(false);
  const modeWrapRef = useRef<HTMLDivElement | null>(null);

  const [isMobile, setIsMobile] = useState(false);

  const mobileHeaderCollapsed = useUiStore((s) => s.mobileHeaderCollapsed);
  const setMobileHeaderCollapsed = useUiStore(
    (s) => s.setMobileHeaderCollapsed,
  );

  // ✅ 현재 모드 확인 (URL 기준)
  const isResumeMode = pathname?.startsWith("/resume");
  const isPressMode = pathname?.startsWith("/press");
  const profileMenuMode: CommonNavMode = isResumeMode
    ? "RESUME"
    : isPressMode
      ? "PRESS"
      : mode === "RESUME" || mode === "PRESS"
        ? mode
        : "STANDARD";
  const commonProfileMenuItems = useMemo(
    () => getProfileMenuItems(profileMenuMode),
    [profileMenuMode],
  );
  const profileMenuItems = isSimple ? commonProfileMenuItems : [];
  const myPageHref =
    profileMenuMode === "RESUME" ? "/my?surface=resume" : "/my?surface=press";
  const pricingHref =
    commonProfileMenuItems.find((item) => item.label === "요금제")?.href ??
    "/pricing";

  const loginHref = isResumeMode ? "/login?next=/resume" : "/login";

  useEffect(() => {
    if (!checked && !loading) fetchMe();
  }, [checked, loading, fetchMe]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    fetchNotifications("popover");
  }, [isAuthed, fetchNotifications]);

  // --- Click Outside Handlers ---
  useEffect(() => {
    if (!isNotifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        popoverWrapRef.current &&
        !popoverWrapRef.current.contains(e.target as Node)
      )
        setIsNotifOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isNotifOpen]);

  useEffect(() => {
    if (!isMoreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        moreWrapRef.current &&
        !moreWrapRef.current.contains(e.target as Node)
      )
        setIsMoreOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isMoreOpen]);

  useEffect(() => {
    if (!isUsageOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        usageWrapRef.current &&
        !usageWrapRef.current.contains(e.target as Node)
      )
        setIsUsageOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isUsageOpen]);

  useEffect(() => {
    if (!isModeOpen) return;
    const onDown = (e: MouseEvent) => {
      if (modeWrapRef.current && !modeWrapRef.current.contains(e.target as Node))
        setIsModeOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isModeOpen]);

  // --- Notifications Logic ---
  const notifications = useMemo(() => popover.items, [popover.items]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => {
      if (isInvitation(n)) return n.isActive !== false;
      return !n.isRead;
    }).length;
  }, [notifications]);

  const invitationCount = useMemo(
    () =>
      notifications.filter((n) => isInvitation(n) && n.isActive !== false)
        .length,
    [notifications],
  );

  const noticeCount = useMemo(
    () => notifications.filter((n) => isNotice(n) && !n.isRead).length,
    [notifications],
  );

  const displayTeamName = me?.teamName ?? "—";
  const displayUserLabel =
    me?.userLabel ?? me?.userLoginId ?? me?.userEmail ?? "—";

  // --- Usage Data Preparation ---
  const quotaUsage = isResumeMode ? me?.usage?.resume : me?.usage?.article;
  const quotaView = toQuotaView(quotaUsage ?? {});
  const { remaining: usageRemaining, limit: usageLimit } = quotaView;
  const remainingPercent = quotaView.percentRemaining;
  const planName = me?.teamPlan ?? "Free";
  const planType = me?.teamPlan || "FREE";

  const remainingText = quotaView.unlimited
    ? formatQuotaRemaining(true, usageRemaining)
    : quotaView.status === "limited"
      ? "0"
      : formatQuotaRemaining(false, usageRemaining);

  const usageLabel = isResumeMode ? "자소서 크레딧" : "보도자료 크레딧";
  const quotaResetText =
    quotaView.resetAtLabel === "정보 없음"
      ? "한도 초기화: 정보 없음"
      : `한도 초기화: ${quotaView.resetAtLabel}`;

  const currentMode = isResumeMode ? "RESUME" : "PRESS";
  const modeOptions = [
    {
      label: "CAREER",
      href: "/resume",
      icon: Briefcase,
      active: currentMode === "RESUME",
      activeClassName:
        "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
      iconClassName: "text-violet-500",
    },
    {
      label: "PRESS",
      href: "/",
      icon: Newspaper,
      active: currentMode === "PRESS",
      activeClassName:
        "border-primary/20 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/15 dark:text-primary",
      iconClassName: "text-primary",
    },
  ];

  const bannerText = useMemo(() => {
    if (!isAuthed) return "로그인 후 알림을 확인할 수 있어요.";
    if (unreadCount <= 0) return `${displayTeamName} 팀 알림 내역입니다.`;

    const latestInvitation = notifications.find(
      (n): n is InvitationNotification =>
        isInvitation(n) && n.isActive !== false,
    );
    if (latestInvitation && invitationCount > 0) {
      return invitationCount === 1
        ? `새 팀 초대: ${latestInvitation.teamName}`
        : `새 팀 초대: ${latestInvitation.teamName} 외 ${
            invitationCount - 1
          }건`;
    }

    const latestNotice = notifications.find(
      (n): n is NoticeNotification => isNotice(n) && !n.isRead,
    );
    if (latestNotice && noticeCount > 0) {
      return noticeCount === 1
        ? `새 공지: ${latestNotice.title}`
        : `새 공지: ${latestNotice.title} 외 ${noticeCount - 1}건`;
    }

    const latest = notifications.find((n) => !n.isRead);
    if (latest && hasTitle(latest)) {
      return `알림: ${latest.title}`;
    }

    return `새 알림 ${unreadCount}건이 있어요.`;
  }, [
    isAuthed,
    unreadCount,
    invitationCount,
    noticeCount,
    notifications,
    displayTeamName,
  ]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      clearMe();
      window.location.href = isResumeMode ? "/resume" : "/";
    }
  };

  const openNotifications = async () => {
    if (!isAuthed) {
      router.push("/login");
      return;
    }
    if (isMobile && !isSimple) {
      router.push("/my/notifications");
      return;
    }
    const nextOpen = !isNotifOpen;
    setIsNotifOpen(nextOpen);
    if (nextOpen) await fetchNotifications("popover");
  };

  return (
    <>
      {isAuthed && isMobile && mobileHeaderCollapsed && (
        <button
          onClick={() => setMobileHeaderCollapsed(false)}
          className="fixed left-1/2 -translate-x-1/2 top-safe z-[60] inline-flex items-center gap-1 border border-border bg-background/90 backdrop-blur px-3 py-1.5 text-xs font-medium text-foreground"
        >
          <ChevronDown className="w-3 h-3" /> <span>헤더 열기</span>
        </button>
      )}

      <div
        className={cx(
          "relative z-50 w-full transition-all duration-300",
          isAuthed && isMobile && mobileHeaderCollapsed
            ? "-mt-16 opacity-0 pointer-events-none"
            : "mt-0 opacity-100",
        )}
      >
        <header className="sticky top-0 w-full border-b border-border bg-background/80 backdrop-blur-md">
          <div
            className={cx(
              "flex h-16 w-full items-center justify-between px-4",
              isSimple && "mx-auto sm:px-6",
              contentClassName,
            )}
          >
            {/* Logo Section */}
            <div className="flex items-center gap-4">
              {onToggleSidebar && (
                <button
                  onClick={onToggleSidebar}
                  className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}

              <div className="flex items-center gap-2 sm:gap-4">
                {/* 1. 로고 이미지 */}
                  <Link
                  href={homeHref ?? (isResumeMode ? "/resume" : "/")}
                  className="flex items-center gap-3"
                >
                  <div className="flex items-end gap-1.5">
                    {/* 모바일에서 로고 크기 조정이 필요하면 w-[100px] 등으로 조절 가능 */}
                    <div className="relative h-9 w-[120px] shrink-0">
                      <Image
                        src="/favicon/logo_black.png"
                        alt="brieFFlow"
                        fill
                        sizes="140px"
                        priority
                        className="object-contain object-left logo-light"
                      />
                      <Image
                        src="/favicon/logo_white.png"
                        alt="brieFFlow"
                        fill
                        sizes="140px"
                        priority
                        className="object-contain object-left logo-dark"
                      />
                    </div>
                  </div>
                </Link>

                {!isSimple && (
                <div className="hidden sm:block relative" ref={modeWrapRef}>
                  <button
                    type="button"
                    onClick={() => setIsModeOpen((v) => !v)}
                    className={cx(
                      "inline-flex items-center gap-1.5 border border-border/50 bg-muted/35 px-3 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:border-border hover:bg-muted/50",
                    )}
                    aria-haspopup="menu"
                    aria-expanded={isModeOpen}
                    aria-label="CAREER / PRESS 전환"
                  >
                    {currentMode === "RESUME" ? (
                      <Briefcase className="h-3.5 w-3.5 text-violet-500" />
                    ) : (
                      <Newspaper className="h-3.5 w-3.5 text-primary" />
                    )}
                    <span>{currentMode === "RESUME" ? "CAREER" : "PRESS"}</span>
                  </button>

                  {isModeOpen && (
                    <div className="absolute left-0 top-full mt-2 w-40 border border-border bg-card p-1.5 shadow-lg ring-1 ring-black/5 z-50 animate-in fade-in zoom-in-95 duration-200">
                      {modeOptions.map((option) => {
                        const Icon = option.icon;
                        return (
                          <Link
                            key={option.label}
                            href={option.href}
                            onClick={() => setIsModeOpen(false)}
                            className={cx(
                              "flex items-center gap-2 px-2.5 py-2 text-xs font-bold transition-colors",
                              option.active
                                ? option.activeClassName
                                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                            )}
                          >
                            <Icon className={cx("h-3.5 w-3.5", option.iconClassName)} />
                            <span>{option.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>

            {/* Desktop Notification Banner */}
            <div className={cx(
              "hidden lg:flex flex-1 justify-center max-w-xl mx-4",
              isSimple && "invisible pointer-events-none",
            )}>
              {isAuthed && (
                <button
                  onClick={openNotifications}
                  className="relative w-full flex items-center gap-3 px-4 py-2 border border-border bg-muted/40 hover:bg-muted/60 transition-all text-xs text-muted-foreground group"
                >
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                    <Bell className="w-3 h-3" />
                  </div>
                  <span className="truncate flex-1 text-left text-foreground/80">
                    {bannerText}
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* simple 헤더는 원래 사용량 위젯을 숨기지만, 자소서 작업 공간에서는
                  AI 한도 잔량이 작업 계획에 직결되므로 항상 노출한다. */}
              {isAuthed && quotaUsage && (
                <div className="relative" ref={usageWrapRef}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isUsageOpen) void fetchMe();
                      setIsUsageOpen(!isUsageOpen);
                    }}
                    aria-expanded={isUsageOpen}
                    aria-label={
                      `${usageLabel} ${remainingPercent}% 남음, ${remainingText} 크레딧 남음`
                    }
                    className={cx(
                      "group flex items-center border px-2 py-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:px-3",
                      QUOTA_PILL_STYLES[quotaView.status],
                    )}
                  >
                    <Zap className={cx(
                      "w-3.5 h-3.5 mr-1.5 group-hover:scale-110 transition-transform md:mr-2",
                      quotaView.status === "available" ? "text-yellow-500" : "text-current",
                    )} />
                    <span className={cx(
                      "text-xs font-bold tabular-nums",
                      quotaView.status === "available" && "text-foreground",
                    )}>
                      {remainingText}
                    </span>
                  </button>

                  {/* 사용량 팝업 */}
                  {isUsageOpen && (
                    <div className="fixed inset-x-3 top-16 z-50 animate-in fade-in zoom-in-95 duration-200 md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-3 md:w-72">
                      <div className="w-full h-full border border-border bg-card shadow-lg ring-1 ring-black/5 overflow-hidden">
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-foreground">
                              크레딧 잔여량
                            </span>
                            <span
                              className={cx(
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors",
                                getPlanBadgeStyle(planType),
                              )}
                            >
                              {planName}
                            </span>
                          </div>
                          {!quotaView.unlimited && (
                            <div className="mb-2">
                              <div className="flex justify-between text-xs mb-1.5">
                                <span className="text-muted-foreground">
                                  남은 {usageLabel}
                                </span>
                                <span className="font-medium">
                                  {remainingPercent}% 남음
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                  className={cx(
                                    "h-full rounded-full transition-all duration-500",
                                    QUOTA_PROGRESS_STYLES[quotaView.status],
                                  )}
                                  style={{ width: `${remainingPercent}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                            <p>
                              {formatQuotaBalance(
                                quotaView.unlimited,
                                usageRemaining,
                                usageLimit,
                              )}
                            </p>
                            {!quotaView.unlimited && <p>{quotaResetText}</p>}
                          </div>
                        </div>

                        {/* Footer Link */}
                        <Link
                          href={pricingHref}
                          onClick={() => setIsUsageOpen(false)}
                          className="flex items-center justify-between bg-muted/30 px-4 py-3 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors border-t border-border"
                        >
                          <span>요금제 업그레이드 / 관리</span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                aria-label="색상 테마 전환"
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Moon className="w-4 h-4 dark:hidden" aria-hidden="true" />
                <Sun className="hidden w-4 h-4 dark:block" aria-hidden="true" />
              </button>

              {isGuest && (
            <Link
              href={loginHref} // ✅ [수정] 동적 경로 적용
              className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
            >
              로그인
            </Link>
          )}
              {isAuthed && (
                <div className="flex items-center gap-2">
                  {isSimple ? (
                    <div ref={popoverWrapRef} className="relative">
                      <button
                        type="button"
                        onClick={openNotifications}
                        className="relative p-2 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="알림"
                        aria-haspopup="dialog"
                        aria-expanded={isNotifOpen}
                      >
                        <Bell className="w-4 h-4" />
                        {unreadCount > 0 && (
                          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
                        )}
                      </button>
                      <NotificationPopover
                        isOpen={isNotifOpen}
                        onClose={() => setIsNotifOpen(false)}
                        notifications={notifications}
                        onRefresh={() => fetchNotifications("popover")}
                        onAfterAccept={fetchMe}
                      />
                    </div>
                  ) : (
                    <>
                      {/* Mobile Notification Button */}
                      <div className="relative lg:hidden">
                        <button
                          onClick={openNotifications}
                          className="relative p-2 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Bell className="w-4 h-4" />
                          {unreadCount > 0 && (
                            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
                          )}
                        </button>
                      </div>

                      {/* Desktop Notification Popover */}
                      <div
                        ref={popoverWrapRef}
                        className="relative hidden lg:block"
                      >
                        <NotificationPopover
                          isOpen={!isMobile && isNotifOpen}
                          onClose={() => setIsNotifOpen(false)}
                          notifications={notifications}
                          onRefresh={() => fetchNotifications("popover")}
                          onAfterAccept={fetchMe}
                        />
                      </div>
                    </>
                  )}

                  {/* Profile Menu */}
                  <div
                    className="relative flex items-center pl-2"
                    ref={moreWrapRef}
                  >
                    <button
                      type="button"
                      onClick={() => setIsMoreOpen(!isMoreOpen)}
                      aria-label="프로필 메뉴 열기"
                      aria-expanded={isMoreOpen}
                      className="w-8 h-8 rounded-full bg-muted/50 border border-border overflow-hidden hover:border-primary/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                    >
                      {me?.avatarUrl ? (
                        <Image
                          src={me.avatarUrl}
                          alt="Avatar"
                          width={32}
                          height={32}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <User className="w-4 h-4 mx-auto text-muted-foreground" />
                      )}
                    </button>

                    {isMoreOpen && (
                      <div className="pt-surface absolute right-0 top-full mt-2 w-56 p-1.5 z-50 shadow-lg animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-2 py-2 border-b border-border/50 mb-1">
                          <p className="text-xs font-bold text-foreground truncate">
                            {displayUserLabel}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {displayTeamName}
                          </p>
                        </div>
                        <Link
                          href={myPageHref}
                          onClick={() => setIsMoreOpen(false)}
                          className="flex items-center gap-2 px-2 py-2 text-xs text-foreground hover:bg-muted/80 transition-colors"
                        >
                          <Settings className="w-3.5 h-3.5" />
                          마이페이지
                        </Link>

                        {profileMenuItems.length > 0 && (
                          <div className="mt-1 mb-1 space-y-0.5 border-y border-border/50 py-1">
                            {profileMenuItems.map((item) => {
                              const Icon = item.icon;
                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  onClick={() => setIsMoreOpen(false)}
                                  className="flex items-center gap-2 px-2 py-2 text-xs text-foreground hover:bg-muted/80 transition-colors"
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                  {item.label}
                                </Link>
                              );
                            })}
                          </div>
                        )}

                        <Link
                          href={isResumeMode ? "/press" : "/resume"}
                          onClick={() => setIsMoreOpen(false)}
                          className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                        >
                          {isResumeMode ? (
                            <Newspaper className="w-3.5 h-3.5" />
                          ) : (
                            <Briefcase className="w-3.5 h-3.5" />
                          )}
                          {isResumeMode ? "보도자료 화면으로 이동" : "커리어 화면으로 이동"}
                        </Link>

                        {isSuperAdmin && (
                          <div className="mt-1 mb-1 space-y-0.5 border-y border-border/50 py-1">
                            {ADMIN_HUB_LINK_VISIBLE && (
                              <Link
                                href="/admin"
                                onClick={() => setIsMoreOpen(false)}
                                className="flex items-center gap-2 px-2 py-2 text-xs text-foreground hover:bg-muted/80 transition-colors"
                              >
                                <Settings className="w-3.5 h-3.5" />
                                관리자 홈
                              </Link>
                            )}
                            <Link
                              href="/admin/ai-quota"
                              onClick={() => setIsMoreOpen(false)}
                              className="flex items-center gap-2 px-2 py-2 text-xs text-foreground hover:bg-muted/80 transition-colors"
                            >
                              <Settings className="w-3.5 h-3.5" />
                              AI quota 관리
                            </Link>
                            {LEGACY_ADMIN_LINKS_VISIBLE && (
                              <Link
                                href="/admin/coupons"
                                onClick={() => setIsMoreOpen(false)}
                                className="flex items-center gap-2 px-2 py-2 text-xs text-foreground hover:bg-muted/80 transition-colors"
                              >
                                <Settings className="w-3.5 h-3.5" />
                                쿠폰 관리
                              </Link>
                            )}
                            {DEV_BILLING_SANDBOX_LINK_VISIBLE && (
                              <Link
                                href="/dev/billing-sandbox"
                                onClick={() => setIsMoreOpen(false)}
                                className="flex items-center gap-2 px-2 py-2 text-xs text-foreground hover:bg-muted/80 transition-colors"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                결제 프로세스 테스트
                              </Link>
                            )}
                          </div>
                        )}

                        {/* 모바일에서도 잔여량 보기 */}
                        {quotaUsage && (
                        <div className="md:hidden px-2 py-2 text-xs text-muted-foreground border-b border-border/50 mb-1">
                          <div className="flex items-center justify-between mb-1">
                            <span>{usageLabel}</span>
                            <span className="font-bold text-foreground">
                              {remainingText}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={cx(
                                "h-full rounded-full",
                                QUOTA_PROGRESS_STYLES[quotaView.status],
                              )}
                              style={{ width: `${remainingPercent}%` }}
                            />
                          </div>
                        </div>
                        )}

                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2 px-2 py-2 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          로그아웃
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
      </div>
    </>
  );
}
