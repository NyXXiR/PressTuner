import { notFound, redirect } from "next/navigation";

import { AdminToolNav } from "../../admin/AdminToolNav";
import { isAdmin, requireTeamContext } from "@/lib/auth";
import {
  assertDevApiPlaygroundEnabled,
  isDevApiPlaygroundAutoSessionEligible,
} from "@/lib/devApiPlayground";
import PressApiPlaygroundClient from "./PressApiPlaygroundClient";
import ResumeApiPlaygroundClient from "./ResumeApiPlaygroundClient";

const PLAYGROUND_PATH = "/dev/api-playground";

export default async function PressApiPlaygroundPage() {
  try {
    assertDevApiPlaygroundEnabled();
  } catch {
    notFound();
  }

  let context: Awaited<ReturnType<typeof requireTeamContext>>;
  try {
    context = await requireTeamContext();
  } catch (error) {
    if ((error as { status?: number }).status === 401) {
      if (isDevApiPlaygroundAutoSessionEligible()) {
        redirect("/api/auth/qa/auto");
      }
      redirect(`/login?next=${encodeURIComponent(PLAYGROUND_PATH)}`);
    }
    notFound();
  }

  const { team, role } = context;
  if (!team?.id || !isAdmin(role)) notFound();

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 pt-8">
        <AdminToolNav current="api-playground" compact />
      </div>
      <PressApiPlaygroundClient
        initialTeam={{ id: team.id, name: team.name }}
      />
      <div className="mx-auto w-full max-w-6xl border-t border-border" />
      <ResumeApiPlaygroundClient />
    </>
  );
}
