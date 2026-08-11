"use client";

import { useCallback, useState } from "react";

import type { PressRagStartRequest, PublicPressRagScenario } from "@/domain/demo/pressRagScenarioContract";
import {
  PublicPressRagApiError,
  commandPublicPressRagScenarioClient,
  startPublicPressRagScenarioClient,
} from "@/lib/publicPressRagScenarioClient";

export function usePublicPressRagScenario() {
  const [scenario, setScenario] = useState<PublicPressRagScenario | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perform = useCallback(async (work: () => Promise<PublicPressRagScenario>) => {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      const next = await work();
      setScenario(next);
      return next;
    } catch (caught) {
      if (caught instanceof PublicPressRagApiError) {
        if (caught.scenario) setScenario(caught.scenario);
        const retry = caught.retryAfterSeconds ? ` ${caught.retryAfterSeconds}초 후 다시 시도할 수 있습니다.` : "";
        setError(`${caught.code}.${retry}`);
      } else {
        setError(caught instanceof Error ? caught.message : "시나리오 요청에 실패했습니다.");
      }
      return null;
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const start = useCallback(
    (input: PressRagStartRequest) => perform(() => startPublicPressRagScenarioClient(input)),
    [perform],
  );
  const command = useCallback(
    (input: Parameters<typeof commandPublicPressRagScenarioClient>[1]) =>
      scenario ? perform(() => commandPublicPressRagScenarioClient(scenario, input)) : Promise.resolve(null),
    [perform, scenario],
  );

  return { scenario, busy, error, start, command, clear: () => { setScenario(null); setError(null); } };
}
