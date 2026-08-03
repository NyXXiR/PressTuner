import type { Metadata } from "next";

import { getSessionContext, isSuperAdminEmail } from "@/lib/auth";

import { WriteFlowRoot } from "./components/WriteFlowRoot";

export const metadata: Metadata = {
  title: "자기소개서 작성",
};

export default async function WriteResumePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; tutorial?: string }>;
}) {
  const [{ id, tutorial }, session] = await Promise.all([
    searchParams,
    getSessionContext(),
  ]);

  return (
    <WriteFlowRoot
      initialAppId={id}
      isTutorial={tutorial === "1"}
      canPreviewStages={isSuperAdminEmail(session?.user.email)}
    />
  );
}
