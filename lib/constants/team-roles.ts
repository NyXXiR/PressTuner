// lib/constants/team-roles.ts
import { ShieldCheck, UserCog, User, Ghost, LucideIcon } from "lucide-react";

// Prisma Enum과 동일하게 맞춥니다.
export type TeamRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

interface RoleMeta {
  label: string;
  description: string;
  icon: LucideIcon;
  colorClass: string; // 배지나 아이콘 색상용 Tailwind 클래스
  bgClass: string; // 배경색용
}

export const TEAM_ROLE_META: Record<TeamRole, RoleMeta> = {
  OWNER: {
    label: "소유자",
    description:
      "팀 삭제, 소유권 이전, 결제 관리 등 팀의 모든 권한을 가집니다.",
    icon: ShieldCheck,
    colorClass: "text-amber-500",
    bgClass: "bg-amber-500/10",
  },
  ADMIN: {
    label: "관리자",
    description:
      "멤버 초대 및 내보내기, 팀 설정 변경 등 대부분의 관리 권한을 가집니다.",
    icon: UserCog,
    colorClass: "text-blue-500",
    bgClass: "bg-blue-500/10",
  },
  MEMBER: {
    label: "일반 멤버",
    description:
      "프로젝트 생성 및 편집 등 팀 내 기본적인 협업 활동이 가능합니다.",
    icon: User,
    colorClass: "text-green-500",
    bgClass: "bg-green-500/10",
  },
  GUEST: {
    label: "게스트",
    description:
      "초대된 리소스에 대해 읽기 전용 권한을 가지며, 편집은 불가능합니다.",
    icon: Ghost,
    colorClass: "text-muted-foreground",
    bgClass: "bg-muted/10",
  },
};

// 드롭다운 등에서 반복 사용하기 위한 배열
export const TEAM_ROLES_LIST = Object.entries(TEAM_ROLE_META).map(
  ([key, value]) => ({
    role: key as TeamRole,
    ...value,
  })
);
