// app/my/notifications/page.tsx
import { requireSessionContext } from "@/lib/auth";
import MyNotificationsClient from "./MyNotificationsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 알림 | brieFFlow" };

export default async function MyNotificationsPage() {
  await requireSessionContext();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">내 알림</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          처리할 요청 → 새 알림 → 지난 기록 순서로 정리됩니다.
        </p>
      </header>

      <MyNotificationsClient />
    </div>
  );
}
