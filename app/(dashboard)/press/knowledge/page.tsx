import type { Metadata } from "next";

import TeamKnowledgePage from "@/app/(dashboard)/team/knowledge/page";

export const metadata: Metadata = {
  title: "근거 문서",
};

export default function PressKnowledgePage() {
  return <TeamKnowledgePage />;
}
