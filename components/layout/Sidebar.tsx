"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LucideIcon,
  X,
} from "lucide-react";
import { useMeStore } from "@/stores/useMeStore";
import { useTeamStore } from "@/stores/useTeamStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { getPlanBadgeStyle } from "@/config/billing/plans";

import {
  getSidebarToggleLabel,
  getWorkspaceNavGroups,
} from "@/lib/constants/nav";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export interface SidebarItemType {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface SidebarGroupType {
  label?: string;
  items: SidebarItemType[];
}

export type SidebarMode = "PRESS" | "RESUME";

type SidebarProps = {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  menuGroups?: SidebarGroupType[];
  bottomItems?: SidebarItemType[];
  variant?: "default" | "glass";
  /** mode를 생략하면 pathname 기반으로 자동 판단 */
  mode?: SidebarMode;
};

export function Sidebar({
  isMobileOpen = false,
  onMobileClose,
  menuGroups,
  bottomItems,
  mode,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // mode prop이 없으면 pathname으로 자동 결정
  const resolvedMode: SidebarMode =
    mode ?? (pathname?.startsWith("/resume") ? "RESUME" : "PRESS");

  const isOpen = useSidebarStore((s) => s.isOpen);
  const toggleSidebar = useSidebarStore((s) => s.toggle);
  const hydrated = useSidebarStore((s) => s.hasHydrated);

  const me = useMeStore((s) => s.me);
  const fetchMe = useMeStore((s) => s.fetchMe);
  const authStatus = useMeStore((s) => s.authStatus);
  const isAuthed = authStatus === "authed";

  const selectedTeamId = useTeamStore((s) => s.selectedTeamId);
  const setSelectedTeamId = useTeamStore((s) => s.setSelectedTeamId);
  const hydrateFromStorage = useTeamStore((s) => s.hydrateFromStorage);

  const [switchingTeam, setSwitchingTeam] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeMenuGroups = useMemo(() => {
    if (menuGroups) return menuGroups;
    return getWorkspaceNavGroups(resolvedMode);
  }, [resolvedMode, menuGroups]);

  const activeBottomItems = useMemo(() => {
    return bottomItems ?? [];
  }, [bottomItems]);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  const teams = useMemo(
    () => (isAuthed ? (me?.teams ?? []) : []),
    [isAuthed, me?.teams],
  );
  const effectiveTeamId = useMemo(() => {
    if (!isAuthed) return null;
    const ids = new Set(teams.map((t) => t.id));
    if (selectedTeamId && ids.has(selectedTeamId)) return selectedTeamId;
    return teams[0]?.id ?? null;
  }, [isAuthed, teams, selectedTeamId]);

  const currentTeam = useMemo(
    () => teams.find((x) => x.id === effectiveTeamId),
    [teams, effectiveTeamId]
  );

  const effectiveTeamName = currentTeam?.name ?? "팀 선택";
  const currentPlan = (currentTeam?.plan ?? "FREE") as string;

  const handleChangeTeam = async (nextTeamId: string) => {
    if (!isAuthed || nextTeamId === effectiveTeamId) return;
    setSelectedTeamId(nextTeamId);
    setSwitchingTeam(true);
    try {
      await fetch("/api/team/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: nextTeamId }),
      });
      await fetchMe();
      router.refresh();
    } finally {
      setSwitchingTeam(false);
      onMobileClose?.();
    }
  };

  const getItemStyles = (active: boolean, isPrimary = false) => {
    if (active) {
      return "bg-primary text-primary-foreground font-semibold";
    }
    if (isPrimary) {
      return "text-primary hover:bg-primary/10 font-bold border border-primary/20 bg-primary/5";
    }
    return "text-muted-foreground hover:bg-muted hover:text-foreground font-medium";
  };

  // 첫 번째 항목(새 보도자료 작성)인지 판단
  const isPrimaryItem = (item: SidebarItemType) =>
    item.href === "/press/new" || item.href === "/resume/write";

  const NavLink = ({
    item,
    isMobile = false,
  }: {
    item: SidebarItemType;
    isMobile?: boolean;
  }) => {
    const finalHref = (() => {
      if (item.href.includes("pricing")) {
        const targetTab = resolvedMode === "RESUME" ? "CAREER" : "PRESS";
        const separator = item.href.includes("?") ? "&" : "?";
        return `${item.href}${separator}tab=${targetTab}`;
      }
      return item.href;
    })();

    const active = (() => {
      if (pathname === item.href) return true;
      if (pathname.startsWith(item.href + "/")) {
        const allItems = [
          ...activeMenuGroups.flatMap((g) => g.items),
          ...activeBottomItems,
        ];
        const exactMatchMenu = allItems.find(
          (other) => other.href === pathname,
        );
        if (exactMatchMenu && exactMatchMenu.href !== item.href) return false;
        return true;
      }
      return false;
    })();

    const primary = isPrimaryItem(item);
    const Icon = item.icon;

    return (
      <Link
        href={finalHref}
        onClick={isMobile ? onMobileClose : undefined}
        className={cx(
          "group relative flex items-center gap-3 px-3 py-2 text-sm transition-all duration-200",
          getItemStyles(active, primary),
          !isOpen && !isMobile && "justify-center px-0 w-10 mx-auto"
        )}
        title={isMobile ? item.label : undefined}
      >
        <Icon
          size={isOpen || isMobile ? 16 : 18}
          className={cx(
            "shrink-0 transition-colors",
            active
              ? "text-current"
              : primary
              ? "text-primary"
              : "text-muted-foreground group-hover:text-foreground"
          )}
        />
        {(isOpen || isMobile) && (
          <span className="truncate">{item.label}</span>
        )}

        {/* 접힌 상태 툴팁 */}
        {!isOpen && !isMobile && (
          <div
            className={cx(
              "absolute left-full top-1/2 ml-2 -translate-y-1/2 px-2 py-1.5 whitespace-nowrap text-xs font-medium z-50 shadow-md",
              "opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none",
              "bg-foreground text-background"
            )}
          >
            {item.label}
          </div>
        )}
      </Link>
    );
  };

  if (!hydrated) return null;

  // ── 모바일 드로어 ──
  const MobileDrawerContent = () => (
    <div className="fixed inset-0 z-[9999] flex md:hidden animate-in fade-in duration-300">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onMobileClose}
      />
      <aside
        className={cx(
          "relative w-[80%] max-w-[300px] h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-300",
          "bg-background border-r border-border text-foreground"
        )}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-border">
          <span className="font-bold text-sm">Menu</span>
          <button
            onClick={onMobileClose}
            className="p-1.5 transition-colors hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-6">
          {/* 팀 선택 */}
          {isAuthed && teams.length > 0 && (
            <div className="relative flex flex-col gap-1 p-3 bg-muted/50 border border-border">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Team
              </span>
              <div className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-bold truncate text-foreground">
                  {effectiveTeamName}
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cx(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded border",
                      getPlanBadgeStyle(currentPlan)
                    )}
                  >
                    {currentPlan}
                  </span>
                  <ChevronDown size={12} className="text-muted-foreground" />
                </div>
              </div>
              <select
                value={effectiveTeamId ?? ""}
                onChange={(e) => handleChangeTeam(e.target.value)}
                disabled={switchingTeam}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 메인 메뉴 */}
          {isAuthed &&
            activeMenuGroups.map((group, idx) => (
              <div key={idx} className="space-y-1">
                {group.label && (
                  <span className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {group.label}
                  </span>
                )}
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} isMobile />
                ))}
              </div>
            ))}

          {activeBottomItems.length > 0 && (
            <div className="space-y-1">
              <span className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Info
              </span>
              {activeBottomItems.map((item) => (
                <NavLink key={item.href} item={item} isMobile />
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );

  return (
    <>
      <aside
        className={cx(
          "hidden md:flex flex-col h-full sticky top-0 transition-all duration-300 ease-in-out z-30",
          "bg-card border-r border-border text-foreground",
          isOpen ? "w-56" : "w-[56px] !overflow-visible"
        )}
      >
        {/* 토글 버튼 */}
        <div
          className={cx(
            "h-14 flex items-center border-b border-border",
            isOpen ? "px-3 justify-end" : "px-0 justify-center"
          )}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={getSidebarToggleLabel(isOpen)}
            aria-expanded={isOpen}
            title={getSidebarToggleLabel(isOpen)}
            className={cx(
              "p-1.5 border transition-colors",
              "bg-background border-border hover:bg-muted text-foreground",
            )}
          >
            {isOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        {/* 팀 선택기 */}
        {isAuthed && (
          <div className={cx("pt-3 pb-2", isOpen ? "px-3" : "px-2")}>
            <div
              className={cx(
                "relative flex flex-col gap-1 p-2 transition-all",
                !isOpen && "items-center",
                "bg-muted/40 border border-border/60"
              )}
            >
              {isOpen ? (
                <div className="flex flex-col w-full relative group">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground px-1 mb-0.5">
                    Team
                  </span>
                  <div className="flex items-center justify-between px-1 py-1 hover:bg-muted/80 cursor-pointer">
                    <span className="text-xs font-bold truncate text-foreground">
                      {effectiveTeamName}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      <span
                        className={cx(
                          "text-[8px] font-bold px-1 py-0.5 rounded border",
                          getPlanBadgeStyle(currentPlan)
                        )}
                      >
                        {currentPlan}
                      </span>
                      <ChevronDown size={11} className="text-muted-foreground" />
                    </div>
                  </div>
                  <select
                    value={effectiveTeamId ?? ""}
                    onChange={(e) => handleChangeTeam(e.target.value)}
                    disabled={switchingTeam}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id} className="text-foreground bg-card">
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div
                  className="w-8 h-8 bg-primary/10 flex items-center justify-center text-primary font-bold text-xs cursor-default"
                  title={effectiveTeamName}
                >
                  {effectiveTeamName.charAt(0)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 메인 메뉴 */}
        <div
          className={cx(
            "flex-1 py-2 space-y-4 scrollbar-hide",
            isOpen ? "overflow-y-auto px-3" : "overflow-visible px-2"
          )}
        >
          {isAuthed &&
            activeMenuGroups.map((group, idx) => (
              <section key={idx}>
                {isOpen && group.label && (
                  <h3 className="px-3 mb-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    {group.label}
                  </h3>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink key={item.href} item={item} />
                  ))}
                </div>
              </section>
            ))}

          {/* 비로그인 */}
          {!isAuthed && (
            <section className="pt-2 space-y-0.5">
              {activeBottomItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </section>
          )}
        </div>

        {/* 하단: 공지·가격·문의 — 아이콘 행 */}
        {isAuthed && activeBottomItems.length > 0 && (
          <div
            className={cx(
              "py-3 mt-auto border-t border-border",
              isOpen ? "px-3" : "px-2"
            )}
          >
            {isOpen ? (
              <div className="space-y-0.5">
                {activeBottomItems.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </div>
            ) : (
              // 접힌 상태: 아이콘만 나란히
              <div className="flex flex-col items-center gap-1">
                {activeBottomItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className="group relative p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Icon size={15} />
                      <div className="absolute left-full top-1/2 ml-2 -translate-y-1/2 px-2 py-1.5 whitespace-nowrap text-xs font-medium z-50 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none bg-foreground text-background">
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </aside>

      {mounted &&
        isMobileOpen &&
        createPortal(<MobileDrawerContent />, document.body)}
    </>
  );
}
