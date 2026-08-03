// app/(dashboard)/legacy/press/new/page.tsx
"use client";

import { useEffect, useRef } from "react";
import StatusPanel from "@/components/article/StatusPanel";
import { PressGenerator } from "@/components/press/PressGenerator";
import { trackGaEvent } from "@/lib/analytics/ga4";

export default function NewPressPage() {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;

    const ref = document.referrer;
    const source = ref.includes("/signup")
      ? "signup"
      : ref.includes("/login")
        ? "login"
        : "direct";

    trackGaEvent("press_new_opened", { source });
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:px-6 lg:px-8">
      <StatusPanel initialStatus="DRAFT" compact />
      <PressGenerator
        editPathForArticle={(articleId) => `/legacy/press/${articleId}/edit`}
      />
    </div>
  );
}
