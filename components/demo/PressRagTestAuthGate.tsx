"use client";

import { useEffect, useState } from "react";

import { PressAiProcessDebugger } from "./PressAiProcessDebugger";
import { PressAiScenarioDemo } from "./PressAiScenarioDemo";

export function PressRagTestAuthGate() {
  const [auth, setAuth] = useState<"checking" | "authenticated" | "anonymous">(
    "checking",
  );

  useEffect(() => {
    void fetch("/api/me", { cache: "no-store" })
      .then((response) =>
        setAuth(response.ok ? "authenticated" : "anonymous"),
      )
      .catch(() => setAuth("anonymous"));
  }, []);

  if (auth === "checking") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (auth === "authenticated") {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <PressAiProcessDebugger />
      </div>
    );
  }

  return <PressAiScenarioDemo showLoginHint />;
}
