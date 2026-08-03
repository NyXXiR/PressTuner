"use client";

import type { ReactNode } from "react";

import { ResumeSimplifiedWorkspace } from "@/components/resume/ResumeSimplifiedWorkspace";

export default function ResumeLayout({ children }: { children: ReactNode }) {
  return <ResumeSimplifiedWorkspace>{children}</ResumeSimplifiedWorkspace>;
}
