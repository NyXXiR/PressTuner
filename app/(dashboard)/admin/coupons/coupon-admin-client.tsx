"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { toDatetimeLocal, fromDatetimeLocalToISO } from "@/lib/utils/datetime";

export type CouponItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  benefitType: string;
  discountPercent: number | null;
  discountAmount: number | null;
  grantPlanId: string | null;
  grantPlanType: string | null;
  grantPlanCategory: string | null;
  grantMonths: number | null;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
  redemptionsCount: number;
};

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
const BENEFIT_TYPES = ["PERCENT", "FIXED_AMOUNT", "PLAN_GRANT"] as const;
const PLAN_TYPES = ["FREE", "BASIC", "PRO", "ENTERPRISE"] as const;

type CreateState = {
  code: string;
  name: string;
  description: string;
  benefitType: (typeof BENEFIT_TYPES)[number];
  discountPercent: string;
  discountAmount: string;
  grantPlanId: string;
  grantPlanType: string;
  grantMonths: string;
  status: (typeof STATUS_OPTIONS)[number];
  validFrom: string;
  validTo: string;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR");
}

export default function CouponAdminClient({
  initialItems,
}: {
  initialItems: CouponItem[];
}) {
  const [items, setItems] = useState<CouponItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createState, setCreateState] = useState<CreateState>({
    code: "",
    name: "",
    description: "",
    benefitType: "PERCENT",
    discountPercent: "",
    discountAmount: "",
    grantPlanId: "",
    grantPlanType: "",
    grantMonths: "1",
    status: "ACTIVE",
    validFrom: "",
    validTo: "",
  });

  const canSubmit = useMemo(() => {
    if (!createState.code.trim() || !createState.name.trim()) return false;
    if (createState.benefitType === "PERCENT") {
      return !!createState.discountPercent.trim();
    }
    if (createState.benefitType === "FIXED_AMOUNT") {
      return !!createState.discountAmount.trim();
    }
    if (createState.benefitType === "PLAN_GRANT") {
      return (
        !!createState.grantPlanId.trim() || !!createState.grantPlanType.trim()
      );
    }
    return false;
  }, [createState]);

  const handleCreate = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: createState.code,
          name: createState.name,
          description: createState.description,
          benefitType: createState.benefitType,
          discountPercent: createState.discountPercent || undefined,
          discountAmount: createState.discountAmount || undefined,
          grantPlanId: createState.grantPlanId || undefined,
          grantPlanType: createState.grantPlanType || undefined,
          grantMonths: createState.grantMonths || undefined,
          status: createState.status,
          validFrom: createState.validFrom
            ? fromDatetimeLocalToISO(createState.validFrom)
            : undefined,
          validTo: createState.validTo
            ? fromDatetimeLocalToISO(createState.validTo)
            : undefined,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.message ?? json?.error ?? "쿠폰 생성에 실패했습니다.");
        return;
      }

      const next: CouponItem = {
        id: json.item.id,
        code: json.item.code,
        name: json.item.name,
        description: json.item.description,
        status: json.item.status,
        benefitType: json.item.benefitType,
        discountPercent: json.item.discountPercent,
        discountAmount: json.item.discountAmount,
        grantPlanId: json.item.grantPlanId,
        grantPlanType: json.item.grantPlanType,
        grantPlanCategory: json.item.grantPlanCategory,
        grantMonths: json.item.grantMonths,
        validFrom: json.item.validFrom,
        validTo: json.item.validTo,
        createdAt: json.item.createdAt,
        updatedAt: json.item.updatedAt,
        redemptionsCount: 0,
      };

      setItems((prev) => [next, ...prev]);
      setSuccess("쿠폰이 생성되었습니다.");
      setCreateState((prev) => ({
        ...prev,
        code: "",
        name: "",
        description: "",
      }));
    } catch {
      setError("쿠폰 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (
    id: string,
    payload: Record<string, unknown>,
  ) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/admin/coupons/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.message ?? json?.error ?? "쿠폰 업데이트에 실패했습니다.");
        return;
      }

      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...json.item } : item)),
      );
      setSuccess("쿠폰이 업데이트되었습니다.");
    } catch {
      setError("쿠폰 업데이트에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">새 쿠폰 만들기</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">코드</span>
            <input
              value={createState.code}
              onChange={(e) =>
                setCreateState((prev) => ({
                  ...prev,
                  code: e.target.value.toUpperCase(),
                }))
              }
              className="w-full border border-border bg-background px-3 py-2"
              placeholder="PROMO2025"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">이름</span>
            <input
              value={createState.name}
              onChange={(e) =>
                setCreateState((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-full border border-border bg-background px-3 py-2"
              placeholder="PRO 1개월 이용권"
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">설명</span>
            <input
              value={createState.description}
              onChange={(e) =>
                setCreateState((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              className="w-full border border-border bg-background px-3 py-2"
              placeholder="운영용 쿠폰 설명"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">혜택 유형</span>
            <select
              value={createState.benefitType}
              onChange={(e) =>
                setCreateState((prev) => ({
                  ...prev,
                  benefitType: e.target.value as CreateState["benefitType"],
                }))
              }
              className="w-full border border-border bg-background px-3 py-2"
            >
              {BENEFIT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">상태</span>
            <select
              value={createState.status}
              onChange={(e) =>
                setCreateState((prev) => ({
                  ...prev,
                  status: e.target.value as CreateState["status"],
                }))
              }
              className="w-full border border-border bg-background px-3 py-2"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          {createState.benefitType === "PERCENT" && (
            <label className="space-y-1 text-sm">
              <span className="font-medium">할인율(%)</span>
              <input
                value={createState.discountPercent}
                onChange={(e) =>
                  setCreateState((prev) => ({
                    ...prev,
                    discountPercent: e.target.value,
                  }))
                }
                className="w-full border border-border bg-background px-3 py-2"
                placeholder="10"
              />
            </label>
          )}

          {createState.benefitType === "FIXED_AMOUNT" && (
            <label className="space-y-1 text-sm">
              <span className="font-medium">할인 금액(원)</span>
              <input
                value={createState.discountAmount}
                onChange={(e) =>
                  setCreateState((prev) => ({
                    ...prev,
                    discountAmount: e.target.value,
                  }))
                }
                className="w-full border border-border bg-background px-3 py-2"
                placeholder="10000"
              />
            </label>
          )}

          {createState.benefitType === "PLAN_GRANT" && (
            <>
              <label className="space-y-1 text-sm">
                <span className="font-medium">플랜 ID</span>
                <input
                  value={createState.grantPlanId}
                  onChange={(e) =>
                    setCreateState((prev) => ({
                      ...prev,
                      grantPlanId: e.target.value,
                    }))
                  }
                  className="w-full border border-border bg-background px-3 py-2"
                  placeholder="pro_monthly_v1"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">플랜 타입</span>
                <select
                  value={createState.grantPlanType}
                  onChange={(e) =>
                    setCreateState((prev) => ({
                      ...prev,
                      grantPlanType: e.target.value,
                    }))
                  }
                  className="w-full border border-border bg-background px-3 py-2"
                >
                  <option value="">선택</option>
                  {PLAN_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">이용 개월</span>
                <input
                  value={createState.grantMonths}
                  onChange={(e) =>
                    setCreateState((prev) => ({
                      ...prev,
                      grantMonths: e.target.value,
                    }))
                  }
                  className="w-full border border-border bg-background px-3 py-2"
                  placeholder="1"
                />
              </label>
            </>
          )}

          <label className="space-y-1 text-sm">
            <span className="font-medium">시작일</span>
            <input
              type="datetime-local"
              value={createState.validFrom}
              onChange={(e) =>
                setCreateState((prev) => ({
                  ...prev,
                  validFrom: e.target.value,
                }))
              }
              className="w-full border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">종료일</span>
            <input
              type="datetime-local"
              value={createState.validTo}
              onChange={(e) =>
                setCreateState((prev) => ({
                  ...prev,
                  validTo: e.target.value,
                }))
              }
              className="w-full border border-border bg-background px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={!canSubmit || loading}
            onClick={handleCreate}
            className={clsx(
              " px-4 py-2 text-sm font-semibold",
              "bg-primary text-primary-foreground",
              (!canSubmit || loading) && "opacity-50 cursor-not-allowed",
            )}
          >
            {loading ? "처리 중..." : "쿠폰 생성"}
          </button>
          {error && <span className="text-xs text-red-500">{error}</span>}
          {success && <span className="text-xs text-green-600">{success}</span>}
        </div>
      </section>

      <section className="border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">쿠폰 목록</h2>
        <div className="mt-4 space-y-4">
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground">
              등록된 쿠폰이 없습니다.
            </div>
          )}
          {items.map((item) => (
            <CouponRow
              key={item.id}
              item={item}
              onSave={(payload) => handleUpdate(item.id, payload)}
              loading={loading}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function CouponRow({
  item,
  onSave,
  loading,
}: {
  item: CouponItem;
  onSave: (payload: Record<string, unknown>) => void;
  loading: boolean;
}) {
  const [status, setStatus] = useState(item.status);
  const [validFrom, setValidFrom] = useState(toDatetimeLocal(item.validFrom));
  const [validTo, setValidTo] = useState(toDatetimeLocal(item.validTo));

  const canSave =
    status !== item.status ||
    validFrom !== toDatetimeLocal(item.validFrom) ||
    validTo !== toDatetimeLocal(item.validTo);

  return (
    <div className="border border-border/60 bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold">{item.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            코드: <span className="font-medium text-foreground">{item.code}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            타입: {item.benefitType}
            {item.discountPercent != null && ` (${item.discountPercent}%)`}
            {item.discountAmount != null && ` (${item.discountAmount}원)`}
          </div>
          {item.grantPlanId && (
            <div className="mt-1 text-xs text-muted-foreground">
              이용권: {item.grantPlanId} / {item.grantMonths ?? "-"}개월
            </div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            사용 횟수: {item.redemptionsCount}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted-foreground">
            상태
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-2 py-1 text-sm"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            시작일
            <input
              type="datetime-local"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            종료일
            <input
              type="datetime-local"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              className="mt-1 w-full border border-border bg-background px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={!canSave || loading}
            onClick={() =>
              onSave({
                status,
                validFrom: validFrom
                  ? fromDatetimeLocalToISO(validFrom)
                  : null,
                validTo: validTo ? fromDatetimeLocalToISO(validTo) : null,
              })
            }
            className={clsx(
              "mt-1 px-3 py-1.5 text-xs font-semibold",
              "bg-foreground text-background",
              (!canSave || loading) && "opacity-50 cursor-not-allowed",
            )}
          >
            {loading ? "처리 중..." : "저장"}
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        생성: {formatDate(item.createdAt)} · 업데이트: {formatDate(item.updatedAt)}
      </div>
    </div>
  );
}
