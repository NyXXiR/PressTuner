// app/my/billing/BillingHistoryClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBillingHistoryFilterStore } from "@/stores/billingHistoryFilterStore";
import { formatYMDHM } from "@/lib/utils/datetime";

type Item = {
  id: string;
  occurredAt: string; // ISO
  type: "PAYMENT" | "CANCEL" | "REFUND" | string;
  status: "SUCCESS" | "REQUESTED" | "FAILED" | string;
  plan: string | null;
  planId: string | null;
  product: "PRESS" | "CAREER" | null;
  subscriptionId: string | null;
  amount: number | null;
  currency: string;
  provider: string | null;
  receiptUrl: string | null;
  externalId: string | null;
};

function formatKRW(v: number | null | undefined) {
  if (typeof v !== "number") return "—";
  return new Intl.NumberFormat("ko-KR").format(v) + "원";
}

function isValidYmd(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function BillingHistoryClient() {
  const {
    preset,
    startDate,
    endDate,
    applyPreset,
    applyCustom,
    setStartDate,
    setEndDate,
  } = useBillingHistoryFilterStore();

  const [items, setItems] = useState<Item[]>([]);
  const [product, setProduct] = useState<"ALL" | "PRESS" | "CAREER">("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acRef = useRef<AbortController | null>(null);

  const canSearch = useMemo(() => {
    return isValidYmd(startDate) && isValidYmd(endDate) && startDate <= endDate;
  }, [startDate, endDate]);

  async function fetchData(s: string, e: string) {
    if (acRef.current) {
      try {
        acRef.current.abort();
      } catch {}
    }
    const ac = new AbortController();
    acRef.current = ac;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ startDate: s, endDate: e });
      if (product !== "ALL") params.set("product", product);
      const res = await fetch(`/api/billing/history?${params.toString()}`, {
        cache: "no-store",
        signal: ac.signal,
      });

      const json = await res.json().catch(() => null);
      if (ac.signal.aborted) return;

      if (!res.ok || !json?.ok) {
        setError(json?.message ?? json?.error ?? "결제 내역을 불러오지 못했습니다.");
        setItems([]);
        return;
      }

      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e: any) {
      if (ac.signal.aborted) return;
      setError(
        e?.message ?? "네트워크 오류로 결제 내역을 불러오지 못했습니다."
      );
      setItems([]);
    } finally {
      if (acRef.current === ac) acRef.current = null;
      setLoading(false);
    }
  }

  // ✅ 필터 변경 시 자동 조회 (버튼/날짜 입력 반응 즉시)
  useEffect(() => {
    if (!canSearch) return;
    fetchData(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, canSearch, product]);

  const presetButton = (id: "7d" | "1m" | "3m" | "6m", label: string) => {
    const active = preset === id;
    return (
      <button
        type="button"
        onClick={() => applyPreset(id)}
        className={[
          "h-9 px-3 border text-sm font-medium transition-colors",
          active
            ? "bg-primary text-primary-foreground border-primary/30"
            : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground",
        ].join(" ")}
      >
        {label}
      </button>
    );
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            결제 내역
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            프리셋 또는 기간 지정으로 결제/해지 이력을 조회할 수 있습니다.
          </p>
        </div>

        {/* 프리셋 */}
        <div className="flex flex-wrap gap-2">
          {presetButton("7d", "7일")}
          {presetButton("1m", "1달")}
          {presetButton("3m", "3달")}
          {presetButton("6m", "6달")}
        </div>
      </div>

      {/* 커스텀 범위 */}
      <section className="mt-6 border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">제품</label>
              <select
                value={product}
                onChange={(event) =>
                  setProduct(event.target.value as "ALL" | "PRESS" | "CAREER")
                }
                className="h-10 w-[140px] border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="ALL">전체</option>
                <option value="PRESS">PRESS</option>
                <option value="CAREER">CAREER</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 w-[180px] border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">종료일</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 w-[180px] border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (!canSearch) return;
                applyCustom(startDate, endDate);
                // applyCustom은 preset만 custom으로 바꾸는 역할이고,
                // 실조회는 start/end 변경 effect로 자동 발생
              }}
              disabled={!canSearch}
              className={[
                "h-10 px-4 text-sm font-semibold transition-all",
                canSearch
                  ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              ].join(" ")}
            >
              기간 검색
            </button>
          </div>

          <div className="text-xs text-muted-foreground">
            {canSearch ? (
              <span>
                조회 기간: <span className="text-foreground">{startDate}</span>{" "}
                ~ <span className="text-foreground">{endDate}</span>
              </span>
            ) : (
              <span>기간을 올바르게 선택해주세요.</span>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </section>

      {/* 결과 테이블 */}
      <section className="mt-6 border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            구독 결제/해지 내역
          </h2>
          <div className="text-xs text-muted-foreground">
            {loading ? "불러오는 중..." : `${items.length}건`}
          </div>
        </div>

        {!loading && items.length === 0 && !error ? (
          <div className="p-6 text-sm text-muted-foreground">
            해당 기간 내 결제/해지 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">일시</th>
                  <th className="text-left px-6 py-3 font-medium">구분</th>
                  <th className="text-left px-6 py-3 font-medium">상태</th>
                  <th className="text-left px-6 py-3 font-medium">제품</th>
                  <th className="text-left px-6 py-3 font-medium">플랜</th>
                  <th className="text-right px-6 py-3 font-medium">금액</th>
                  <th className="text-left px-6 py-3 font-medium">PG</th>
                  <th className="text-left px-6 py-3 font-medium">영수증</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((h) => (
                  <tr key={h.id} className="hover:bg-muted/20">
                    <td className="px-6 py-3 text-foreground">
                      {formatYMDHM(new Date(h.occurredAt))}
                    </td>
                    <td className="px-6 py-3">
                      <span className="font-medium text-foreground">
                        {h.type === "PAYMENT"
                          ? "결제"
                          : h.type === "CANCEL"
                          ? "해지"
                          : h.type === "REFUND"
                          ? "환불"
                          : h.type}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                        {h.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-foreground">
                      {h.product ?? "미분류"}
                    </td>
                    <td className="px-6 py-3 text-foreground">
                      {h.plan ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-right text-foreground">
                      {formatKRW(h.amount)}
                    </td>
                    <td className="px-6 py-3 text-foreground">
                      {h.provider ?? "—"}
                    </td>
                    <td className="px-6 py-3">
                      {h.receiptUrl ? (
                        <a
                          href={h.receiptUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          보기
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
