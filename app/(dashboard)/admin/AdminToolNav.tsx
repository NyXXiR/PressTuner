import Link from "next/link";
import {
  CreditCard,
  FlaskConical,
  Gauge,
  Settings,
  TicketPercent,
} from "lucide-react";

import { isDevApiPlaygroundEnabled } from "@/lib/devApiPlayground";
import { isDevBillingSandboxEnabled } from "@/lib/devBillingSandbox";

type AdminToolId =
  | "home"
  | "ai-quota"
  | "coupons"
  | "billing-sandbox"
  | "api-playground";
type AdminTool = {
  id: Exclude<AdminToolId, "home">;
  href: string;
  label: string;
  description: string;
  icon: typeof Gauge;
};

type AdminToolNavProps = {
  current?: AdminToolId;
  compact?: boolean;
};

const LEGACY_ADMIN_TOOLS_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_LEGACY_ROUTES === "true";

function adminTools() {
  const tools: AdminTool[] = [
    {
      id: "ai-quota" as const,
      href: "/admin/ai-quota",
      label: "AI quota 관리",
      description: "플랜별 AI 사용량 한도와 요청별 소모량을 조정합니다.",
      icon: Gauge,
    },
  ];

  if (LEGACY_ADMIN_TOOLS_ENABLED) {
    tools.push({
      id: "coupons" as const,
      href: "/admin/coupons",
      label: "쿠폰 관리",
      description: "프로모션, 체험, 일시 할인 쿠폰을 관리합니다.",
      icon: TicketPercent,
    });
  }

  if (isDevBillingSandboxEnabled()) {
    tools.push({
      id: "billing-sandbox",
      href: "/dev/billing-sandbox",
      label: "결제 프로세스 테스트",
      description: "실결제 없이 PortOne 경계만 mock 처리하고 결제 도메인을 검증합니다.",
      icon: CreditCard,
    });
  }

  if (isDevApiPlaygroundEnabled()) {
    tools.push({
      id: "api-playground",
      href: "/dev/api-playground",
      label: "Domain API playground",
      description:
        "실제 Press·Resume 화면 흐름과 RAG 적용 상태를 한곳에서 확인합니다.",
      icon: FlaskConical,
    });
  }

  return tools;
}

export function AdminToolNav({ current, compact = false }: AdminToolNavProps) {
  const tools = adminTools();

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/admin"
          className={`inline-flex h-9 items-center gap-2 border px-3 text-xs font-medium transition-colors ${
            current === "home"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          관리자 홈
        </Link>
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.id}
              href={tool.href}
              className={`inline-flex h-9 items-center gap-2 border px-3 text-xs font-medium transition-colors ${
                current === tool.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tool.label}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <Link
            key={tool.id}
            href={tool.href}
            className={` border p-4 transition-colors hover:bg-muted/60 ${
              current === tool.id
                ? "border-primary bg-primary/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="h-4 w-4" />
              {tool.label}
            </div>
            <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground">
              {tool.description}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
