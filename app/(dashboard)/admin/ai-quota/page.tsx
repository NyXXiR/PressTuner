import { redirect } from "next/navigation";

import { getAiQuotaAdminConfig } from "@/domain/quota/aiQuota";
import { requireAdmin } from "@/lib/auth";
import { AdminToolNav } from "../AdminToolNav";
import AiQuotaAdminClient from "./ai-quota-admin-client";

export default async function AdminAiQuotaPage() {
  try {
    await requireAdmin();
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) redirect("/login");
    redirect("/unavailable");
  }

  const config = await getAiQuotaAdminConfig();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI quota 관리</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            플랜별 rolling window 한도와 AI 요청별 기본 소모량을 조정합니다.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <AdminToolNav current="ai-quota" compact />
      </div>

      <div className="mt-6">
        <AiQuotaAdminClient initialConfig={config} />
      </div>
    </div>
  );
}
