"use client";

import { useState, useEffect, useRef } from "react";
import { Share2, Link as LinkIcon, MessageCircle, X } from "lucide-react";
import { toast } from "@/stores/toastStore"; // ✅ 헬퍼 객체 import

interface ShareModalProps {
  articleId: string;
  initialIsShared: boolean;
  initialToken: string | null;
  title: string;
  description?: string;
}

declare global {
  interface Window {
    Kakao: any;
  }
}

export default function ShareModal({
  articleId,
  initialIsShared,
  initialToken,
  title,
  description = "보도자료 작성이 완료되었습니다.",
}: ShareModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isShared, setIsShared] = useState(initialIsShared);
  const [shareToken, setShareToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);

  // 카카오 SDK 초기화
  useEffect(() => {
    if (typeof window !== "undefined" && window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        window.Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JS_KEY);
      }
    }
  }, []);

  // 모달 외부 클릭 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // ESC 키 닫기
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen]);

  const shareUrl =
    typeof window !== "undefined" && shareToken
      ? `${window.location.origin}/share/${shareToken}`
      : "";

  const handleToggle = async () => {
    if (loading) return;
    const nextState = !isShared;

    setLoading(true);
    try {
      const res = await fetch(`/api/articles/${articleId}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable: nextState }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "설정 변경 실패");
      }

      const data = await res.json();
      setIsShared(data.isShared);
      setShareToken(data.shareToken);

      // ✅ toast 헬퍼 사용 (위치 기본값 top-center)
      if (nextState) {
        toast.success("공유 링크가 생성되었습니다.");
      } else {
        toast.info("공유가 비활성화되었습니다.");
      }
    } catch (e: any) {
      toast.error(e.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    toast.success("링크가 복사되었습니다.");
  };

  const shareKakao = () => {
    if (!window.Kakao || !isShared || !shareUrl) {
      toast.error("카카오톡 공유를 사용할 수 없습니다.");
      return;
    }

    window.Kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: `[보도자료] ${title}`,
        description: description.slice(0, 100),
        imageUrl: "https://your-domain.com/og-image.png",
        link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
      },
      buttons: [
        {
          title: "문서 확인하기",
          link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
        },
      ],
    });
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted active:scale-95"
      >
        <Share2 size={14} />
        공유하기
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={modalRef}
            className="w-full max-w-md overflow-hidden pt-surface animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-semibold">결과물 공유 설정</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-6 p-6">
              <div className="flex items-center justify-between border border-border bg-muted/20 p-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium leading-none">
                    공유 링크 활성화
                  </label>
                  <p className="text-xs text-muted-foreground">
                    활성화 시 링크를 가진 누구나 문서를 볼 수 있습니다.
                  </p>
                </div>

                <button
                  onClick={handleToggle}
                  disabled={loading}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50 ${
                    isShared ? "bg-primary" : "bg-input"
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                      isShared ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {isShared && shareUrl && (
                <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-muted px-3 py-2 text-xs font-mono text-muted-foreground">
                      {shareUrl}
                    </code>
                    <button
                      onClick={copyLink}
                      className="flex h-9 w-9 items-center justify-center border border-border bg-background hover:bg-muted text-muted-foreground transition-colors"
                      title="복사"
                    >
                      <LinkIcon size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <button
                      onClick={copyLink}
                      className="inline-flex h-10 items-center justify-center gap-2 bg-secondary text-secondary-foreground px-4 text-sm font-medium hover:bg-secondary/80 transition-colors"
                    >
                      <LinkIcon size={16} />
                      링크 복사
                    </button>
                    <button
                      onClick={shareKakao}
                      className="inline-flex h-10 items-center justify-center gap-2 bg-[#FEE500] text-[#000000] px-4 text-sm font-medium hover:bg-[#FEE500]/90 transition-colors"
                    >
                      <MessageCircle
                        size={16}
                        className="fill-black border-none"
                      />
                      카카오톡
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
