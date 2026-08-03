import { notFound, redirect } from "next/navigation";

import { assertDevBillingSandboxEnabled } from "@/lib/devBillingSandbox";
import { isAdmin, requireTeamContext } from "@/lib/auth";
import {
  listDevBillingSandboxPlans,
} from "@/lib/services/billing/devBillingSandboxService";
import { getSubscriptionStatusForTeamByProduct } from "@/lib/services/billing/subscriptionService";
import { AdminToolNav } from "../../admin/AdminToolNav";
import DevBillingSandboxClient from "./DevBillingSandboxClient";

export default async function DevBillingSandboxPage() {
  try {
    assertDevBillingSandboxEnabled();

    const { team, role } = await requireTeamContext();
    if (!team?.id || !isAdmin(role)) notFound();

    const initialTeam = await getSubscriptionStatusForTeamByProduct(
      team.id,
      "PRESS",
    );
    const plans = listDevBillingSandboxPlans();

    return (
      <>
        <div className="mx-auto w-full max-w-5xl px-4 pt-8">
          <AdminToolNav current="billing-sandbox" compact />
        </div>
        <DevBillingSandboxClient initialTeam={initialTeam} plans={plans} />
      </>
    );
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) {
      redirect(`/login?next=${encodeURIComponent("/dev/billing-sandbox")}`);
    }
    if (status === 404) notFound();
    redirect("/unavailable");
  }
}
