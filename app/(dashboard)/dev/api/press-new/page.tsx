import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireTeamContext } from "@/lib/auth";
import { assertDevPressApiPlaygroundEnabled } from "@/lib/devPressApiPlayground";
import PressApiPlaygroundClient from "./PressApiPlaygroundClient";

export const metadata: Metadata = {
  title: "Press API Playground",
};

export const dynamic = "force-dynamic";

export default async function PressApiPlaygroundPage() {
  let context: Awaited<ReturnType<typeof requireTeamContext>>;
  try {
    assertDevPressApiPlaygroundEnabled();
    context = await requireTeamContext();
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) {
      redirect(`/login?next=${encodeURIComponent("/dev/api/press-new")}`);
    }
    if (status === 404) notFound();
    throw error;
  }
  return (
    <PressApiPlaygroundClient
      teamName={context.team.name}
      userLabel={context.user.label || context.user.loginId}
    />
  );
}
