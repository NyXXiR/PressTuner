"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { toast } from "@/stores/toastStore";

export type PressSimplifiedDevStep =
  | "input"
  | "brief"
  | "preview"
  | "review"
  | "complete";

const IS_DEV = process.env.NODE_ENV !== "production";
const DEV_ARTICLE_STORAGE_KEY = "press-simplified-dev-article-id-v1";

const DEV_TITLE =
  "2030 직장인 맞춤 금융 앱 '세이브잇', 정식 출시 및 캐시백 프로모션 종료";
const DEV_LEAD =
  "2030 직장인을 위한 금융 앱 '세이브잇'이 2026년 3월 1일 정식 출시되었으며, 오픈 기념으로 3개월간 2% 추가 캐시백 프로모션을 진행 중이다.";
const DEV_PARAGRAPHS = [
  "'세이브잇'은 2026년 3월 1일 정식 오픈된 금융 앱으로, 2030 직장인을 주요 타깃으로 한다. 직관적인 UI와 게이미피케이션 기능을 통해 기존 은행 앱 대비 사용이 간편하고 즐거운 금융 경험을 제공한다.",
  "세이브잇은 금융 거래 시 전환 금액의 2%를 추가로 캐시백해주는 프로모션을 3개월간 진행하며 사용자들에게 실질적인 혜택을 제공한다.",
  '김민준 세이브잇 대표는 "소비가 아닌 자산이 되는 경험을 제공하겠다"고 말하며, 세이브잇만의 차별화된 금융 경험을 강조했다.',
];
const DEV_CLOSING =
  "세이브잇은 사용자 친화적인 디자인과 기능으로 2030 직장인들이 금융 활동에 더 쉽게 접근할 수 있도록 서비스를 확장할 계획이다.";

const ITEMS = [
  { key: "input", label: "메모" },
  { key: "brief", label: "확인" },
  { key: "preview", label: "초안" },
  { key: "review", label: "첨삭" },
  { key: "complete", label: "완료" },
] as const;

async function requestJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message ?? data?.error ?? "dev 문서 준비에 실패했습니다.");
  }
  return data;
}

async function articleExists(articleId: string) {
  try {
    const res = await fetch(`/api/articles/${articleId}`, {
      credentials: "include",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function setArticleStatus(articleId: string, status: "IN_PROGRESS" | "FINAL") {
  await requestJson(`/api/articles/${articleId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

async function warmArticleUsage(articleId: string) {
  await fetch(`/api/articles/${articleId}/usage`, {
    credentials: "include",
    cache: "no-store",
  }).catch(() => null);
}

async function createDevArticle(status: "IN_PROGRESS" | "FINAL") {
  const initData = await requestJson("/api/articles/init", {
    method: "POST",
    body: JSON.stringify({ type: "PRESS_RELEASE" }),
  });
  const articleId = initData?.id ?? initData?.articleId;
  if (!articleId) throw new Error("dev 문서 id를 받지 못했습니다.");

  await requestJson(`/api/articles/${articleId}/save`, {
    method: "POST",
    body: JSON.stringify({
      title: DEV_TITLE,
      lead: DEV_LEAD,
      paragraphs: DEV_PARAGRAPHS.map((text) => ({ text, importance: 0 })),
      closing: DEV_CLOSING,
    }),
  });
  await setArticleStatus(articleId, status);
  await warmArticleUsage(articleId);

  window.sessionStorage.setItem(DEV_ARTICLE_STORAGE_KEY, articleId);
  return articleId;
}

async function ensureDevArticle(status: "IN_PROGRESS" | "FINAL") {
  const storedId = window.sessionStorage.getItem(DEV_ARTICLE_STORAGE_KEY);
  if (storedId && (await articleExists(storedId))) {
    await setArticleStatus(storedId, status);
    await warmArticleUsage(storedId);
    return storedId;
  }

  return createDevArticle(status);
}

export function PressSimplifiedDevSwitcher({
  current,
  onSelectCreateStep,
}: {
  current: PressSimplifiedDevStep;
  onSelectCreateStep?: (step: Extract<PressSimplifiedDevStep, "input" | "brief" | "preview">) => void;
}) {
  const router = useRouter();
  const [busyStep, setBusyStep] = useState<PressSimplifiedDevStep | null>(null);

  if (!IS_DEV) return null;

  const handleSelect = async (step: PressSimplifiedDevStep) => {
    if (step === current) return;

    if (step === "input" || step === "brief" || step === "preview") {
      if (onSelectCreateStep) {
        onSelectCreateStep(step);
      } else {
        router.push(`/press/new?devView=${step}`);
      }
      return;
    }

    setBusyStep(step);
    try {
      const articleId = await ensureDevArticle(
        step === "complete" ? "FINAL" : "IN_PROGRESS",
      );
      router.push(
        step === "complete"
          ? `/press/${articleId}/final`
          : `/press/${articleId}/edit`,
      );
    } catch (error: any) {
      toast.error(
        error?.message ?? "dev 화면 전환에 실패했습니다.",
        undefined,
        "top-center",
      );
    } finally {
      setBusyStep(null);
    }
  };

  return (
    <div className="fixed bottom-36 left-1/2 z-[80] -translate-x-1/2 border border-amber-300/60 bg-amber-50/95 p-1.5 shadow-xl backdrop-blur dark:border-amber-400/30 dark:bg-amber-950/90 sm:bottom-20">
      <div className="flex items-center gap-1">
        <span className="px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
          Dev
        </span>
        {ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => void handleSelect(item.key)}
            disabled={busyStep !== null}
            className={[
              "h-8 px-3 text-xs font-bold transition-colors disabled:cursor-wait disabled:opacity-70",
              current === item.key
                ? "bg-amber-600 text-white"
                : "text-amber-900 hover:bg-amber-200/70 dark:text-amber-100 dark:hover:bg-amber-800/70",
            ].join(" ")}
          >
            {busyStep === item.key ? "준비" : item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
