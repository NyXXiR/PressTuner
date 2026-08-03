// app/my/billing/page.tsx
import { redirect } from "next/navigation";
import { requireTeamContext } from "@/lib/auth";
import { BillingHistoryClient } from "./BillingHistoryClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MyBillingPage() {
  try {
    await requireTeamContext();
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 401) {
      redirect(`/login?next=${encodeURIComponent("/my/billing")}`);
    }
    redirect("/pricing?error=FORBIDDEN");
  }

  return <BillingHistoryClient />;
}
