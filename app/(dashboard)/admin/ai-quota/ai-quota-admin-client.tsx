"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Save } from "lucide-react";

import type {
  AiQuotaAdminActionRow,
  AiQuotaAdminConfig,
  AiQuotaAdminWindowRow,
} from "@/domain/quota/aiQuota";
import { toast } from "@/stores/toastStore";

type WindowDraft = AiQuotaAdminWindowRow & { draftLimitUnits: string };
type ActionDraft = AiQuotaAdminActionRow & { draftUnits: string };

function toWindowDraft(row: AiQuotaAdminWindowRow): WindowDraft {
  return { ...row, draftLimitUnits: String(row.limitUnits) };
}

function toActionDraft(row: AiQuotaAdminActionRow): ActionDraft {
  return { ...row, draftUnits: String(row.units) };
}

function planLabel(row: AiQuotaAdminWindowRow) {
  return `${row.planName} (${row.planId})`;
}

function isInvalidInteger(value: string, min: number) {
  if (!value.trim()) return false;
  const n = Number(value);
  return !Number.isInteger(n) || n < min;
}

function changedWindowPayload(row: WindowDraft) {
  const value = row.draftLimitUnits.trim();
  if (!value) {
    return row.overrideLimitUnits === null
      ? null
      : {
          planId: row.planId,
          surface: row.surface,
          windowKey: row.windowKey,
          limitUnits: null,
        };
  }

  const next = Number(value);
  if (next === row.defaultLimitUnits) {
    return row.overrideLimitUnits === null
      ? null
      : {
          planId: row.planId,
          surface: row.surface,
          windowKey: row.windowKey,
          limitUnits: null,
        };
  }

  if (row.overrideLimitUnits === next) return null;
  return {
    planId: row.planId,
    surface: row.surface,
    windowKey: row.windowKey,
    limitUnits: next,
  };
}

function changedActionPayload(row: ActionDraft) {
  const value = row.draftUnits.trim();
  if (!value) {
    return row.overrideUnits === null
      ? null
      : { action: row.action, units: null };
  }

  const next = Number(value);
  if (next === row.defaultUnits) {
    return row.overrideUnits === null
      ? null
      : { action: row.action, units: null };
  }

  if (row.overrideUnits === next) return null;
  return { action: row.action, units: next };
}

export default function AiQuotaAdminClient({
  initialConfig,
}: {
  initialConfig: AiQuotaAdminConfig;
}) {
  const [windows, setWindows] = useState<WindowDraft[]>(
    initialConfig.windows.map(toWindowDraft),
  );
  const [actions, setActions] = useState<ActionDraft[]>(
    initialConfig.actions.map(toActionDraft),
  );
  const [surface, setSurface] = useState<"PRESS" | "RESUME" | "ALL">("ALL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleWindows = useMemo(
    () =>
      surface === "ALL"
        ? windows
        : windows.filter((row) => row.surface === surface),
    [surface, windows],
  );
  const visibleActions = useMemo(
    () =>
      surface === "ALL"
        ? actions
        : actions.filter((row) => row.surface === surface),
    [actions, surface],
  );

  const invalid = useMemo(() => {
    return (
      windows.some((row) => isInvalidInteger(row.draftLimitUnits, 0)) ||
      actions.some((row) => isInvalidInteger(row.draftUnits, 1))
    );
  }, [actions, windows]);

  const dirtyCount = useMemo(() => {
    return (
      windows.filter((row) => changedWindowPayload(row)).length +
      actions.filter((row) => changedActionPayload(row)).length
    );
  }, [actions, windows]);

  function updateWindow(row: WindowDraft, value: string) {
    setWindows((prev) =>
      prev.map((item) =>
        item.planId === row.planId &&
        item.surface === row.surface &&
        item.windowKey === row.windowKey
          ? { ...item, draftLimitUnits: value }
          : item,
      ),
    );
  }

  function resetWindow(row: WindowDraft) {
    updateWindow(row, String(row.defaultLimitUnits));
  }

  function updateAction(row: ActionDraft, value: string) {
    setActions((prev) =>
      prev.map((item) =>
        item.action === row.action ? { ...item, draftUnits: value } : item,
      ),
    );
  }

  function resetAction(row: ActionDraft) {
    updateAction(row, String(row.defaultUnits));
  }

  async function save() {
    if (invalid || saving) return;
    const windowPayload = windows
      .map(changedWindowPayload)
      .filter(Boolean);
    const actionPayload = actions
      .map(changedActionPayload)
      .filter(Boolean);

    if (windowPayload.length === 0 && actionPayload.length === 0) {
      toast.info("변경된 quota 설정이 없습니다.", "AI quota");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-quota", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          windows: windowPayload,
          actions: actionPayload,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message ?? json?.error ?? "AI_QUOTA_UPDATE_FAILED");
      }

      setWindows((json.windows as AiQuotaAdminWindowRow[]).map(toWindowDraft));
      setActions((json.actions as AiQuotaAdminActionRow[]).map(toActionDraft));
      toast.success("AI quota 설정을 저장했습니다.", "AI quota");
    } catch (err: any) {
      setError(err?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit border border-border bg-background p-1">
          {(["ALL", "PRESS", "RESUME"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSurface(item)}
              className={[
                "h-8 px-3 text-xs font-medium",
                surface === item
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {item === "ALL" ? "전체" : item}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            변경 {dirtyCount}건
          </div>
          <button
            type="button"
            disabled={saving || invalid || dirtyCount === 0}
            onClick={save}
            className="inline-flex h-9 items-center gap-2 bg-primary px-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "저장 중" : "저장"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      {invalid ? (
        <div className="border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
          Window 한도는 0 이상의 정수, action 소모량은 1 이상의 정수로 입력해야 합니다.
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">플랜별 rolling window 한도</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              기본값과 다른 값만 override로 저장됩니다. 0은 해당 window에서 즉시 제한됩니다.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">플랜</th>
                <th className="px-3 py-2 font-medium">Surface</th>
                <th className="px-3 py-2 font-medium">Window</th>
                <th className="px-3 py-2 font-medium text-right">기본</th>
                <th className="px-3 py-2 font-medium text-right">적용값</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium text-right">동작</th>
              </tr>
            </thead>
            <tbody>
              {visibleWindows.map((row) => (
                <tr
                  key={`${row.planId}:${row.surface}:${row.windowKey}`}
                  className="border-t border-border"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{planLabel(row)}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.planCategory}
                    </div>
                  </td>
                  <td className="px-3 py-2">{row.surface}</td>
                  <td className="px-3 py-2">
                    {row.label}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {row.windowKey}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.defaultLimitUnits}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      value={row.draftLimitUnits}
                      onChange={(event) => updateWindow(row, event.target.value)}
                      inputMode="numeric"
                      className="h-8 w-24 border border-border bg-background px-2 text-right tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.overrideLimitUnits === null ? (
                      <span className="text-muted-foreground">기본값</span>
                    ) : (
                      <span className="font-medium text-primary">override</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => resetWindow(row)}
                      className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs hover:bg-muted"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      기본값
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold">AI action 기본 소모량</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            더 무거운 요청일수록 높은 units를 사용합니다. 호출 코드가 명시적으로 units를
            넘기면 그 값이 우선됩니다.
          </p>
        </div>
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Surface</th>
                <th className="px-3 py-2 font-medium">Label</th>
                <th className="px-3 py-2 font-medium text-right">기본</th>
                <th className="px-3 py-2 font-medium text-right">적용값</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 font-medium text-right">동작</th>
              </tr>
            </thead>
            <tbody>
              {visibleActions.map((row) => (
                <tr key={row.action} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
                  <td className="px-3 py-2">{row.surface}</td>
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.defaultUnits}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      value={row.draftUnits}
                      onChange={(event) => updateAction(row, event.target.value)}
                      inputMode="numeric"
                      className="h-8 w-20 border border-border bg-background px-2 text-right tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.overrideUnits === null ? (
                      <span className="text-muted-foreground">기본값</span>
                    ) : (
                      <span className="font-medium text-primary">override</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => resetAction(row)}
                      className="inline-flex h-8 items-center gap-1 border border-border px-2 text-xs hover:bg-muted"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      기본값
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
