import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { AdminToolNav } from "./AdminToolNav";

export default async function AdminHomePage() {
  try {
    await requireAdmin();
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) redirect("/login");
    redirect("/unavailable");
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">관리자 도구</h1>
        <p className="text-sm text-muted-foreground">
          운영 설정과 dev 전용 검수 화면으로 이동합니다.
        </p>
      </div>

      <div className="mt-6">
        <AdminToolNav current="home" />
      </div>
    </div>
  );
}
