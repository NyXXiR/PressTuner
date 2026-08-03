"use client";

import type { ReactNode } from "react";
import { Suspense, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { RightPanel } from "@/components/layout/RightPanel";
import { AppErrorState } from "@/components/layout/AppErrorState";
import { PressSimplifiedWorkspace } from "@/components/press/PressSimplifiedWorkspace";
import { ResumeSimplifiedWorkspace } from "@/components/resume/ResumeSimplifiedWorkspace";
import { useMeStore } from "@/stores/useMeStore";

// 🟢 [제거] nav 상수 import 제거됨 (Sidebar 내부로 이동)

const SystemNoticeBar = dynamic(
  () =>
    import("@/components/layout/SystemNoticeBar").then(
      (m) => m.SystemNoticeBar,
    ),
  { ssr: false },
);

const LEGACY_ROUTES_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_LEGACY_ROUTES === "true";
const DEV_BILLING_SANDBOX_LINK_VISIBLE =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_DEV_BILLING_SANDBOX === "true";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function isPressWorkspacePath(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname === "/press/knowledge" ||
    pathname === "/my/dashboard" ||
    pathname === "/my/articles" ||
    pathname === "/my/notifications" ||
    pathname.startsWith("/my/articles/") ||
    pathname.startsWith("/articles/") ||
    pathname.startsWith("/press/notices") ||
    pathname === "/press/pricing" ||
    pathname === "/press/contact"
  );
}

function isPublicShellPath(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname === "/" ||
    pathname === "/press" ||
    pathname === "/contact" ||
    pathname === "/pricing" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/business" ||
    pathname === "/signup/terms" ||
    pathname.startsWith("/billing") ||
    pathname.startsWith("/notices") ||
    pathname.startsWith("/policy/")
  );
}

function isDevOnlyLegacyPath(pathname: string | null) {
  if (!pathname) return false;
  if (pathname === "/admin/ai-quota") return false;
  if (DEV_BILLING_SANDBOX_LINK_VISIBLE && pathname === "/admin") return false;
  return (
    pathname === "/my/billing" ||
    pathname.startsWith("/team") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/legacy")
  );
}

function DashboardLayoutContent({ children }: { children: ReactNode }) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isClient = useIsClient();

  const authStatus = useMeStore((s) => s.authStatus);
  const checked = useMeStore((s) => s.checked);
  const isAuthed = authStatus === "authed";

  const showLoggedInUI = isClient && checked && isAuthed;
  const mySurface = searchParams.get("surface");

  if (!LEGACY_ROUTES_ENABLED && isDevOnlyLegacyPath(pathname)) {
    return (
      <AppErrorState
        statusCode="404"
        title="현재 사용할 수 없는 화면입니다"
        description="이 관리 화면은 개편 중인 기능으로, 배포 환경에서는 열리지 않습니다. 필요한 작업은 현재 공개된 Press 또는 Resume 화면에서 진행해 주세요."
      />
    );
  }

  if (pathname === "/my" && mySurface === "resume") {
    return <ResumeSimplifiedWorkspace>{children}</ResumeSimplifiedWorkspace>;
  }

  if (pathname === "/my") {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <PressSimplifiedWorkspace
          mainClassName="max-w-4xl"
          paddingClassName="pb-16 pt-8 sm:pt-10"
        >
          {children}
        </PressSimplifiedWorkspace>
      </div>
    );
  }

  if (isPressWorkspacePath(pathname)) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <PressSimplifiedWorkspace
          mainClassName="max-w-6xl"
          paddingClassName="pb-16 pt-8 sm:pt-10"
        >
          {children}
        </PressSimplifiedWorkspace>
      </div>
    );
  }

  if (isPublicShellPath(pathname)) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <Header
          mode="PRESS"
          variant="simple"
          homeHref={pathname === "/" || pathname === "/press" ? "/" : "/press"}
          contentClassName="max-w-6xl"
        />
        {children}
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <Header
        onToggleSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        mode="PRESS" // 대문자 유지
      />

      <SystemNoticeBar
        noticeId="beta-2025-01"
        message="brieFFlow는 베타 버전입니다. 중요한 보도자료는 반드시 사람이 최종 검토해 주세요."
      />

      <div className="flex flex-1 min-h-0 min-w-0">
        <Sidebar
          mode="PRESS" // 🟢 [변경] 대문자 & 메뉴 데이터 props 전달 제거 (내부에서 처리)
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
        />

        <div className="flex flex-1 min-h-0 min-w-0 flex-col border-x border-border bg-background overflow-hidden">
          {/* NavBar 필요 시 주석 해제 */}
          {/* {showLoggedInUI && (
            <div className="hidden md:block">
              <NavBar />
            </div>
          )} */}

          <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
            <main className="relative z-10 flex-1 min-h-0 min-w-0 overflow-y-auto">
              <div className="mx-auto w-full max-w-6xl px-4 lg:px-8">
                <div className="py-10 min-h-full">{children}</div>
              </div>
            </main>
          </div>
        </div>
      </div>

      {showLoggedInUI && <RightPanel />}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background text-foreground">{children}</div>}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}
