"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  DevRagFixtureDomain,
  DevRagFixtureState,
} from "@/domain/dev-rag-fixtures/contracts";
import {
  createDevRagFixtureApiClient,
  type DevRagFixtureExchange,
} from "@/lib/devRagFixtureApiClient";

export function RagFixtureCard({
  domain,
  onState,
}: {
  domain: DevRagFixtureDomain;
  onState?: (state: DevRagFixtureState) => void;
}) {
  const [state, setState] = useState<DevRagFixtureState | null>(null);
  const [lastExchange, setLastExchange] =
    useState<DevRagFixtureExchange | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(
    (fixture: DevRagFixtureState) => {
      setState(fixture);
      onState?.(fixture);
    },
    [onState],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    const api = createDevRagFixtureApiClient({
      onExchange: setLastExchange,
    });
    try {
      const fixtures = await api.read();
      const fixture = fixtures.find((item) => item.domain === domain);
      if (!fixture) throw new Error(`${domain} fixture status is missing`);
      apply(fixture);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Fixture read failed");
    } finally {
      setBusy(false);
    }
  }, [apply, domain]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function mutate(mounted: boolean) {
    setBusy(true);
    setError(null);
    const api = createDevRagFixtureApiClient({
      onExchange: setLastExchange,
    });
    try {
      apply(await api.setMounted(domain, mounted));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Fixture update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            {domain} persistent RAG fixture
          </p>
          <h2 className="mt-1 text-lg font-bold">
            {state?.mounted ? "Mounted" : "Unmounted"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {state?.summary ?? "Reading server-owned fixture state…"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="border border-border px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={busy || state?.mounted === true}
            onClick={() => void mutate(true)}
            className="border border-border px-3 py-2 text-xs font-bold disabled:opacity-40"
          >
            Mount
          </button>
          <button
            type="button"
            disabled={busy || state?.mounted !== true}
            onClick={() => void mutate(false)}
            className="border border-red-300 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40"
          >
            Unmount
          </button>
        </div>
      </div>
      {state ? (
        <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-bold">Fixture version</dt>
            <dd>{state.fixtureVersion}</dd>
          </div>
          <div>
            <dt className="font-bold">Resource version</dt>
            <dd>{state.resourceVersion}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-bold">Scope</dt>
            <dd>
              {state.scope.kind} · {state.scope.id}
            </dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-3 text-xs text-amber-700">
        Unmounting invalidates current verification. Press also deactivates
        fixture-backed facts on unfinished articles; remounting does not
        reaccept them.
      </p>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      {lastExchange ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold">
            Last sanitized fixture exchange
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto text-xs">
            {JSON.stringify(lastExchange, null, 2)}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
