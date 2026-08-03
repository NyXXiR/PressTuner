"use client";

import { SimplifiedPressFlow } from "@/components/press/SimplifiedPressFlow";

export function PressScreenParityMode() {
  return (
    <section className="space-y-4">
      <div className="border border-primary/30 bg-primary/5 p-4 text-sm">
        This mounts the same simplified Press flow used by <code>/press/new</code>.
        Normalize implicitly initializes one article, and normalize/generate use
        the simplified quota path. AI requests consume real QA-team quota.
      </div>
      <SimplifiedPressFlow />
    </section>
  );
}
