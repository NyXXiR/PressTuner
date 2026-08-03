"use client";

import { useState } from "react";

import type { DevRagFixtureState } from "@/domain/dev-rag-fixtures/contracts";
import { PressDomainInspectionMode } from "./PressDomainInspectionMode";
import { PressScreenParityMode } from "./PressScreenParityMode";
import { RagFixtureCard } from "./RagFixtureCard";

type Mode = "screen-parity" | "domain-inspection";

export default function PressApiPlaygroundClient({
  initialTeam,
}: {
  initialTeam: { id: string; name: string };
}) {
  const [mode, setMode] = useState<Mode>("screen-parity");
  const [fixture, setFixture] = useState<DevRagFixtureState | null>(null);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-primary">
          Development tool
        </p>
        <h1 className="mt-2 text-3xl font-extrabold">Press API playground</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Authenticated operations run against {initialTeam.name}. Fixture
          ownership stays mounted while modes switch; each mode owns separate
          article state.
        </p>
      </header>
      <RagFixtureCard domain="PRESS" onState={setFixture} />
      <ModeSelector mode={mode} onMode={setMode} />
      {mode === "screen-parity" ? (
        <PressScreenParityMode key="press-screen-parity" />
      ) : (
        <PressDomainInspectionMode
          key="press-domain-inspection"
          initialTeam={initialTeam}
          fixture={fixture}
        />
      )}
    </main>
  );
}
function ModeSelector({
  mode,
  onMode,
}: {
  mode: Mode;
  onMode: (mode: Mode) => void;
}) {
  return (
    <div className="flex gap-2" role="tablist" aria-label="Press playground mode">
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
          onClick={() => onMode(value)}
          className={`border px-4 py-2 text-sm font-bold ${
            mode === value ? "border-primary bg-primary text-primary-foreground" : "border-border"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
