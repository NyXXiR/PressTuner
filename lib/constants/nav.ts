// src/lib/constants/nav.ts
import {
  LayoutDashboard,
  FileText,
  Clock,
  Newspaper,
  Bell,
  Users,
  Info,
  CreditCard,
  MessageCircle,
  Sparkles,
  BookOpen,
  Layers,
  FilePen,
  type LucideIcon,
} from "lucide-react";

export type ProductNavMode = "PRESS" | "RESUME";
export type CommonNavMode = ProductNavMode | "STANDARD";

export interface AppNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface AppNavGroup {
  label?: string;
  items: AppNavItem[];
}

// 공통 화면은 좌측 workspace nav가 아니라 헤더의 프로필 메뉴에서 노출한다.
const COMMON_PROFILE_MENU_ITEMS: AppNavItem[] = [
  { label: "공지사항", href: "/notices", icon: Info },
  { label: "요금제", href: "/pricing", icon: CreditCard },
  { label: "고객지원", href: "/contact", icon: MessageCircle },
];

// 구버전 import 호환용. 신규 UI에서는 getProfileMenuItems를 사용한다.
export const COMMON_BOTTOM_ITEMS = COMMON_PROFILE_MENU_ITEMS;

// 1. 보도자료(기존) 대시보드용 작업 흐름 메뉴
export const PRESS_DASHBOARD_GROUPS: AppNavGroup[] = [
  {
    label: "MY SPACE",
    items: [
      { label: "새 보도자료 작성", href: "/press/new", icon: Sparkles },
      { label: "내 대시보드", href: "/my/dashboard", icon: LayoutDashboard },
      { label: "내 보도자료 목록", href: "/my/articles", icon: FileText },
      { label: "검토 대기 목록", href: "/my/articles/pending", icon: Clock },
    ],
  },
  {
    label: "TEAM WORKSPACE",
    items: [
      { label: "팀 대시보드", href: "/team/dashboard", icon: LayoutDashboard },
      { label: "보도자료 목록", href: "/team/articles", icon: Newspaper },
      { label: "근거 문서", href: "/team/knowledge", icon: BookOpen },
      { label: "팀 공지사항", href: "/team/notices", icon: Bell },
      { label: "멤버 관리", href: "/team/manage", icon: Users },
    ],
  },
];

// 2. 자기소개서(신규) 대시보드용 작업 흐름 메뉴
export const RESUME_DASHBOARD_GROUPS: AppNavGroup[] = [
  {
    label: "MY WORKSPACE",
    items: [
      {
        label: "새 지원서 작성",
        href: "/resume/write",
        icon: Sparkles,
      },
      {
        label: "대시보드",
        href: "/resume/dashboard",
        icon: LayoutDashboard,
      },
      {
        label: "나의 경험 보관함",
        href: "/resume/bricks",
        icon: Layers,
      },
      {
        label: "내 지원서 관리",
        href: "/resume/applications",
        icon: FilePen,
      },
    ],
  },
  {
    label: "RESOURCE",
    items: [
      { label: "기업별 문항 뱅크", href: "/resume/questions", icon: BookOpen },
    ],
  },
];

export function getWorkspaceNavGroups(mode: ProductNavMode): AppNavGroup[] {
  return mode === "RESUME" ? RESUME_DASHBOARD_GROUPS : PRESS_DASHBOARD_GROUPS;
}

export function getProfileMenuItems(mode: CommonNavMode): AppNavItem[] {
  const routePrefix =
    mode === "RESUME" ? "/resume" : mode === "PRESS" ? "/press" : "";
  const pricingTab =
    mode === "RESUME" ? "CAREER" : mode === "PRESS" ? "PRESS" : null;

  return COMMON_PROFILE_MENU_ITEMS.map((item) => {
    const href = `${routePrefix}${item.href}`;

    if (item.href !== "/pricing" || !pricingTab) {
      return { ...item, href };
    }

    return { ...item, href: `${href}?tab=${pricingTab}` };
  });
}

export function getSidebarToggleLabel(isOpen: boolean): string {
  return isOpen ? "좌측 작업 메뉴 접기" : "좌측 작업 메뉴 펼치기";
}
