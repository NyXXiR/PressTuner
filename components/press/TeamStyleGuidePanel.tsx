// components/press/TeamStyleGuidePanel.tsx
"use client";

import { StyleRuleSet } from "@/lib/styleCompiler";
import { useEffect, useState } from "react";

// 🔹 타입 정의
type GuideSummary = {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  isArchived: boolean;
  compiledVersion?: number | null;
  compiledUpdatedAt?: string | null;
  compiledRuleCount?: number | null;
};

type CompileMode = "FAST" | "SLOW";

type Props = {
  // 선택된 가이드가 바뀔 때 알려주는 콜백
  onGuideChange?: (guide: GuideSummary | null) => void;
};

export function TeamStyleGuidePanel({ onGuideChange }: Props) {
  const [guides, setGuides] = useState<GuideSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 1️⃣ 팀 가이드 목록 가져오기
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch("/api/style-guides/my-team");

        // 404면 "가이드 없음"으로 정상 처리
        if (res.status === 404) {
          setGuides([]);
          setSelectedId(null);
          return;
        }

        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          throw new Error(
            errorData?.message ?? errorData?.error ?? "팀 스타일 가이드를 불러오지 못했습니다."
          );
        }

        const resJson = await res.json();

        // 🛠️ [수정됨] API 응답 구조가 { data: [...] } 인지 { items: [...] } 인지 몰라도 동작하도록 처리
        // 우선순위: resJson.data -> resJson.items -> resJson (배열 자체)
        const rawList = resJson.data || resJson.items || resJson;

        const items: GuideSummary[] = Array.isArray(rawList) ? rawList : [];

        setGuides(items);

        console.log(items);
        // 기본 선택: isDefault 가이드 → 없으면 첫 번째
        if (items.length > 0) {
          // 이미 선택된게 없다면 기본값 설정
          const def = items.find((g) => g.isDefault);
          const initialId = def?.id ?? items[0].id;
          // 기존 선택된 ID가 유효하지 않다면(삭제됨 등) 새로운 ID로 교체
          const isValidId = items.some((g) => g.id === selectedId);
          if (!selectedId || !isValidId) {
            setSelectedId(initialId);
          }
        }
      } catch (e: any) {
        console.error(e);
        setErr(e?.message ?? "가이드 조회 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 1회 실행

  const selectedGuide = guides.find((g) => g.id === selectedId) ?? null;

  // 선택된 가이드가 바뀔 때 부모에게 알림
  useEffect(() => {
    if (onGuideChange) {
      onGuideChange(selectedGuide ?? null);
    }
  }, [selectedGuide, onGuideChange]);

  // 2️⃣ 컴파일 실행 (API 호출)
  const runCompile = async (mode: CompileMode) => {
    if (!selectedId) return;
    setCompiling(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/style-guides/${selectedId}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message ?? errorData?.error ?? "컴파일에 실패했습니다.");
      }

      const resJson = await res.json();

      // 🛠️ [수정됨] 보여주신 200 응답 예시에 맞춰 데이터 경로 수정
      // 예시: { ok: true, data: { rules: {...}, version: 5, ... } }
      const resultData = resJson.data;

      const rules = resultData?.rules as StyleRuleSet | undefined;
      const version = resultData?.version ?? null;
      const serverUpdatedAt = resultData?.updatedAt;

      // 규칙 개수 카운트
      const vocaCnt = rules?.vocabulary?.length ?? 0;
      const toneCnt = rules?.toneHints?.length ?? 0;
      const boilerCnt = rules?.boilerplates?.length ?? 0;
      const banCnt = rules?.banList?.length ?? 0;
      const keywordCnt = rules?.keywords?.length ?? 0;

      const total = vocaCnt + toneCnt + boilerCnt + banCnt + keywordCnt;

      setMsg(
        `${mode === "FAST" ? "FAST" : "SLOW"} 컴파일 완료 (버전 ${
          version ?? "N/A"
        }, 규칙 ${total}개)`
      );

      // 성공 시 로컬 상태 업데이트 (화면 즉시 반영)
      if (version != null) {
        setGuides((prev) =>
          prev.map((g) =>
            g.id === selectedId
              ? {
                  ...g,
                  compiledVersion: version,
                  compiledRuleCount: total,
                  compiledUpdatedAt:
                    serverUpdatedAt ?? new Date().toISOString(),
                }
              : g
          )
        );
      }
    } catch (e: any) {
      console.error(e);
      setErr(e?.message ?? "컴파일 중 오류가 발생했습니다.");
    } finally {
      setCompiling(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-border bg-card p-3 text-[11px] text-muted-foreground">
        팀 스타일 가이드를 불러오는 중입니다…
      </div>
    );
  }

  if (guides.length === 0) {
    return (
      <div className="border border-border bg-card p-3 text-[11px] text-muted-foreground">
        아직 이 팀에는 스타일 가이드가 없습니다. 보도자료를 편집/저장하면 기본
        가이드가 자동으로 만들어집니다.
      </div>
    );
  }

  return (
    <div className="border border-border bg-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium">
            팀 스타일 가이드 선택 &nbsp;
            <span className="text-[10px] text-muted-foreground">
              (지금은 수동, 나중엔 자동화 예정)
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground">
            어떤 가이드 기준으로 신호를 학습할지 선택하고, 필요하면 여기서
            강제로 컴파일해 볼 수 있습니다.
          </p>
        </div>

        <div className="flex items-center gap-1">
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
            className="text-[11px] border border-input bg-background px-2 py-1"
          >
            {guides.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.isDefault ? " (기본)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedGuide && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            {selectedGuide.description && (
              <p className="line-clamp-1">{selectedGuide.description}</p>
            )}
            <p>
              버전:{" "}
              <span className="font-medium">
                {selectedGuide.compiledVersion ?? "—"}
              </span>{" "}
              · 규칙 수:{" "}
              <span className="font-medium">
                {selectedGuide.compiledRuleCount ?? "—"}
              </span>
            </p>
          </div>

          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => runCompile("FAST")}
              disabled={compiling}
              className="text-[11px] border border-border px-2 py-1 hover:bg-muted disabled:opacity-50"
            >
              {compiling ? "컴파일 중…" : "FAST 컴파일"}
            </button>
            <button
              type="button"
              onClick={() => runCompile("SLOW")}
              disabled={compiling}
              className="text-[11px] border border-primary/40 text-primary px-2 py-1 hover:bg-primary/10 disabled:opacity-50"
            >
              {compiling ? "컴파일 중…" : "SLOW 컴파일"}
            </button>
          </div>
        </div>
      )}

      {msg && <p className="text-[10px] text-green-600 mt-1">{msg}</p>}
      {err && <p className="text-[10px] text-red-500 mt-1">{err}</p>}
    </div>
  );
}
