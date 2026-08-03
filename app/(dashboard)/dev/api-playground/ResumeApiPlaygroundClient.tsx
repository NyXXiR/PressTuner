"use client";

import { useState } from "react";

import type { DevRagFixtureState } from "@/domain/dev-rag-fixtures/contracts";
import { RagFixtureCard } from "./RagFixtureCard";
import { ResumeDomainInspectionMode } from "./ResumeDomainInspectionMode";
import { ResumeScreenParityMode } from "./ResumeScreenParityMode";

type Mode = "screen-parity" | "domain-inspection";

export default function ResumeApiPlaygroundClient() {
  const [mode, setMode] = useState<Mode>("screen-parity");
  const [fixture, setFixture] = useState<DevRagFixtureState | null>(null);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-primary">
          Development tool
        </p>
        <h1 className="mt-2 text-3xl font-extrabold">Resume API playground</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The Resume fixture remains independent from Press. Each mode owns a
          separate application state and all AI calls use real quota.
        </p>
      </header>
      <RagFixtureCard domain="RESUME" onState={setFixture} />
      <div className="flex gap-2" role="tablist" aria-label="Resume playground mode">
        {(
          [
            ["screen-parity", "Screen parity"],
            ["domain-inspection", "Domain inspection"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`border px-4 py-2 text-sm font-bold ${
              mode === value ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "screen-parity" ? (
        <ResumeScreenParityMode key="resume-screen-parity" />
      ) : (
        <ResumeDomainInspectionMode
          key="resume-domain-inspection"
          fixture={fixture}
        />
      )}
    </main>
  );
}
