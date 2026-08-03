import type { ReactNode } from "react";
import { PublicSectionNav } from "@/components/layout/PublicSectionNav";

export default function PublicPagesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <PublicSectionNav />
      {children}
    </>
  );
}
