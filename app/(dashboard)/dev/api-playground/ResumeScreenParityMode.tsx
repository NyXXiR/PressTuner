"use client";

import { WriteFlowRoot } from "@/app/resume/write/components/WriteFlowRoot";

export function ResumeScreenParityMode() {
  return (
    <section className="space-y-4">
      <div className="border border-primary/30 bg-primary/5 p-4 text-sm">
        This mounts the same multi-question flow used by <code>/resume/write</code>.
        Intake and bricks load together, the first question drafts automatically,
        and completion remains server-authoritative. AI requests consume real
        QA-team quota.
      </div>
      <WriteFlowRoot />
    </section>
  );
}
