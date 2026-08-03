"use client";

import { JSX, useEffect, useMemo, useState, useRef } from "react";
import clsx from "clsx";
import StatusPanel from "@/components/article/StatusPanel";
import FloatingActionBar from "@/components/article/FloatingActionBar";
import { usePressEditStore, Note } from "@/stores/usePressEditStore";
import { useMeStore } from "@/stores/useMeStore";
import { useRightPanelStore } from "@/stores/rightPanelStore";
import {
  X,
  Sparkles,
  Send,
  CheckCircle2,
  Save,
  Users,
  Search,
  LayoutTemplate,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createPortal } from "react-dom";
import {
  PressVerificationPanel,
  type PressVerificationState,
} from "./PressVerificationPanel";

// Diff 하이라이팅 함수
function highlightDiff(original: string, revised: string) {
  if (!original) return revised;
  const originalWordSet = new Set(
    original.split(/\s+/).map((w) => w.replace(/[.,]/g, "")),
  );
  const revisedWords = revised.split(/\s+/);
  return revisedWords.map((word, i) => {
    const cleanWord = word.replace(/[.,]/g, "");
    const isNew = !originalWordSet.has(cleanWord);
    return (
      <span
        key={i}
        className={clsx(
          "transition-all duration-300",
          isNew &&
            "font-bold text-emerald-600 dark:text-emerald-400 decoration-2 underline decoration-emerald-400/50 underline-offset-4",
        )}
      >
        {word}{" "}
      </span>
    );
  });
}

// Spans 생성 헬퍼 함수 (Legacy Fallback용)
function generateSpansFromNotes(plain: string, notes: Note[]) {
  if (!plain || !notes || notes.length === 0) return [];

  return notes
    .map((note) => {
      if (!note.quote) return null;
      const start = plain.indexOf(note.quote);
      if (start === -1) return null;

      return {
        id: note.id,
        note: note.note,
        type: note.type,
        start: start,
        end: start + note.quote.length,
      };
    })
    .filter((span): span is NonNullable<typeof span> => span !== null);
}

export function PressEditClient({
  articleId,
  teamId,
  initialTitle,
  initialPlain,
  initialSpans,
  initialNotes,
  finalPathForArticle = (targetArticleId: string) =>
    `/press/${targetArticleId}/final`,
}: {
  articleId: string;
  teamId: string | null;
  initialTitle: string;
  initialPlain: string;
  initialSpans?: any[];
  initialNotes?: any[];
  finalPathForArticle?: (articleId: string) => string;
}) {
  const {
    title,
    plain,
    spans,
    notes,
    selectedNoteIds,
    reviewing,
    saveState,
    pendingResult,
    usage,
    fetchUsage,
    init,
    setTitle,
    setPlain,
    toggleNoteSelection,
    runReview,
    runRePolish,
    applyPendingResult,
    setPendingResult,
    saveDraft,
    completeWriting,
    teamMembers,
    fetchTeamMembers,
    sendApprovalRequest,
  } = usePressEditStore();

  const me = useMeStore((s) => s.me);
  const fetchMe = useMeStore((s) => s.fetchMe);
  const router = useRouter();
  const rightPanelOpen = useRightPanelStore((state) => state.isOpen);

  const [hoverData, setHoverData] = useState<{
    note: string;
    x: number;
    y: number;
  } | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState("");
  const [selectedApproverId, setSelectedApproverId] = useState<string | null>(
    null,
  );
  const [verificationState, setVerificationState] =
    useState<PressVerificationState | null>(null);
  const verificationFinalizable =
    (saveState === "idle" || saveState === "saved") &&
    verificationState?.freshness === "CURRENT" &&
    verificationState.verification?.result !== "BLOCK";
  const [approvalSearch, setApprovalSearch] = useState("");
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isResizing, setIsResizing] = useState(false);
  const [repolishInstruction, setRepolishInstruction] = useState("");

  const previewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const repolishDragControls = useDragControls();

  // 초기화 Effect
  useEffect(() => {
    if (articleId) {
    init({
      articleId,
      teamId,
      initialTitle,
      initialPlain,
      initialSpans: initialSpans || [],
      initialNotes: initialNotes || [],
    });
  }
}, [
  articleId,
  teamId,
  initialTitle,
  initialPlain,
  initialSpans,
  initialNotes,
  init,
]);

  // 사용량 조회 Effect
  useEffect(() => {
    if (articleId) {
      fetchUsage();
    }
  }, [articleId, fetchUsage]);

  useEffect(() => {
    if (!me) fetchMe();
  }, [me, fetchMe]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (saveState === "dirty") {
        saveDraft({ silent: true });
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [title, plain, saveState, saveDraft]);

  useEffect(() => {
    if (showApprovalModal) {
      fetchTeamMembers();
    }
  }, [showApprovalModal, fetchTeamMembers]);

  // Resizer Logic
  useEffect(() => {
    if (!isResizing || !containerRef.current) return;
    const handleDrag = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth < 768;
      let newRatio;
      if (isMobile) {
        const clientY =
          "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
        newRatio = (clientY - rect.top) / rect.height;
      } else {
        const clientX =
          "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        newRatio = (clientX - rect.left) / rect.width;
      }
      if (newRatio > 0.15 && newRatio < 0.85) setSplitRatio(newRatio);
    };
    const stopDrag = () => setIsResizing(false);
    window.addEventListener("mousemove", handleDrag);
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchmove", handleDrag, { passive: false });
    window.addEventListener("touchend", stopDrag);
    const isMobile = window.innerWidth < 768;
    document.body.style.cursor = isMobile ? "row-resize" : "col-resize";
    return () => {
      window.removeEventListener("mousemove", handleDrag);
      window.removeEventListener("mouseup", stopDrag);
      window.removeEventListener("touchmove", handleDrag);
      window.removeEventListener("touchend", stopDrag);
      document.body.style.cursor = "default";
    };
  }, [isResizing]);

  const startDrag = () => setIsResizing(true);

  const handleRunReview = async () => {
    await runReview();
    fetchUsage();
    if (window.innerWidth < 1024 && previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleRunRePolish = async () => {
    await runRePolish(repolishInstruction.trim() || undefined);
    fetchUsage();
  };

  const handleComplete = async () => {
    const success = await completeWriting();
    if (success) router.push(finalPathForArticle(articleId));
  };

  const handleApply = async () => {
    await applyPendingResult();
    toggleNoteSelection("");
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const handleSendApproval = async () => {
    if (!selectedApproverId) return;
    const success = await sendApprovalRequest(
      selectedApproverId,
      approvalMessage,
    );
    if (success) {
      setShowApprovalModal(false);
      setApprovalMessage("");
      setSelectedApproverId(null);
      alert("검토 요청이 전송되었습니다.");
    }
  };

  // [핵심 변경] 단순해진 매핑 로직
  // 서비스가 span.id와 note.id의 일치를 보장하므로 복잡한 검색 로직 불필요
  const activeSpans = useMemo(() => {
    // 1. API(서비스)로부터 받은 spans가 있다면 우선 사용
    if (spans && spans.length > 0) {
      return spans.map((span) => {
        // ID로 대응되는 Note 찾기
        const matchingNote = notes?.find((n) => n.id === span.id);

        return {
          ...span,
          // note: span 자체에 들어있거나, 매칭된 note 객체에서 가져옴.
          // 절대 quote(원문)를 note로 쓰지 않음.
          note: span.note || matchingNote?.note || "",
          quote: matchingNote?.quote || "",
          type: span.type || matchingNote?.type || "HINT",
        };
      });
    }
    // 2. Legacy/Fallback: spans가 없고 notes만 있는 경우
    if (notes && notes.length > 0) {
      return generateSpansFromNotes(plain, notes);
    }
    return [];
  }, [spans, notes, plain]);

  const filteredMembers = useMemo(() => {
    return teamMembers.filter((m) => {
      if (me && m.userId === me.userId) return false;
      const searchLower = approvalSearch.toLowerCase();
      return (
        m.user.label.toLowerCase().includes(searchLower) ||
        (m.user.email && m.user.email.toLowerCase().includes(searchLower))
      );
    });
  }, [teamMembers, approvalSearch, me]);

  const renderPreview = useMemo(() => {
    if (!activeSpans || activeSpans.length === 0) {
      return (
        <div className="text-[17px] leading-[1.8] opacity-80 whitespace-pre-wrap break-words font-sans text-muted-foreground">
          {plain || "내용을 입력하면 분석 결과가 여기에 표시됩니다."}
        </div>
      );
    }
    const sortedSpans = [...activeSpans]
      .filter((s) => s.start >= 0)
      .sort((a, b) => a.start - b.start);

    const nodes: JSX.Element[] = [];
    let lastPos = 0;

    sortedSpans.forEach((s) => {
      if (s.start > lastPos)
        nodes.push(
          <span key={`text-${lastPos}`}>{plain.slice(lastPos, s.start)}</span>,
        );
      const isSelected = selectedNoteIds.includes(s.id);

      const highlightClass =
        {
          HINT: "pt-hl-hint",
          TERM: "pt-hl-term",
          TONE: "pt-hl-tone",
          RISK: "pt-hl-risk",
        }[s.type as string] || "pt-hl-hint";

      nodes.push(
        <span
          key={s.id}
          onClick={() => toggleNoteSelection(s.id)}
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const padding = 12;
            const desiredX = rect.left + rect.width / 2;
            const desiredY = rect.top - 12;
            const x = Math.min(
              Math.max(desiredX, padding),
              window.innerWidth - padding,
            );
            const y = Math.max(desiredY, padding);

            // [중요] Note 내용이 있을 때만 툴팁 데이터 설정
            if (s.note) {
              setHoverData({ note: s.note, x, y });
            }
          }}
          onMouseLeave={() => setHoverData(null)}
          className={clsx(
            "cursor-pointer transition-all border-b-2 py-0.5 px-0.5 rounded-t-sm relative inline-block break-words pt-hl",
            highlightClass,
            isSelected
              ? "ring-2 ring-primary bg-primary/10 border-b-transparent z-10"
              : "hover:bg-primary/5 border-b-current/40",
          )}
        >
          {plain.slice(s.start, s.end)}
        </span>,
      );
      lastPos = s.end;
    });
    if (lastPos < plain.length)
      nodes.push(<span key="tail">{plain.slice(lastPos)}</span>);
    return (
      <div className="text-[17px] leading-[1.8] tracking-tight text-foreground/90 break-words font-sans">
        {nodes}
      </div>
    );
  }, [plain, activeSpans, selectedNoteIds, toggleNoteSelection]);

  const hasSpans = activeSpans.length > 0;

  return (
    <div className="relative min-h-screen space-y-8 pb-32 bg-background text-foreground font-sans">
      {/* Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="fixed top-24 left-1/2 z-[200]"
          >
            <div className="bg-emerald-600 text-white px-6 py-2 shadow-2xl font-bold flex items-center gap-2">
              <CheckCircle2 size={16} /> 수정 내용이 원고에 반영되었습니다.
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-[50] -mx-4 px-4 py-4 lg:-mx-8 lg:px-8 bg-background/80 backdrop-blur-md border-b border-border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="w-full max-w-sm shrink-0">
          <StatusPanel initialStatus="IN_PROGRESS" compact />
        </div>

        <div className="flex items-center justify-end h-8">
          <AnimatePresence mode="wait">
            {reviewing ? (
              <motion.div
                key="reviewing"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 px-4 py-2 pt-badge pt-badge--primary text-xs font-bold"
              >
                <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                AI가 원고를 분석하고 있습니다...
              </motion.div>
            ) : hasSpans && selectedNoteIds.length === 0 ? (
              <motion.div
                key="analysis-done"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 px-4 py-2 pt-badge pt-badge--success text-xs font-bold"
              >
                <Sparkles size={14} className="text-emerald-500" />
                분석 완료! 오른쪽 패널에서 수정 계획을 이어서 실행할 수 있습니다.
              </motion.div>
            ) : !hasSpans && plain.length >= 30 ? (
              <motion.div
                key="ready"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 px-4 py-2 pt-badge pt-badge--primary text-xs font-bold animate-pulse"
              >
                <Sparkles size={14} />
                분석할 준비가 되었습니다. 오른쪽 패널에 요청을 입력해 주세요.
              </motion.div>
            ) : (!hasSpans && plain.length < 30) ||
              selectedNoteIds.length > 0 ? (
              <motion.div
                key="saving-status"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 px-4 py-2 pt-badge pt-badge--neutral text-[11px] font-bold transition-all"
              >
                {saveState === "saving" ? (
                  <span className="flex items-center gap-2 text-primary font-black italic">
                    <Save size={14} className="animate-bounce" /> Saving...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    {selectedNoteIds.length > 0 ? (
                      <>
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-primary">
                          {selectedNoteIds.length}개 구간 수정 대기 중
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        {plain.trim().length < 30
                          ? "초안 작성 중"
                          : "모든 변경사항 저장됨"}
                      </>
                    )}
                  </span>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      <PressVerificationPanel
        articleId={articleId}
        teamId={teamId}
        refreshKey={saveState}
        onStateChange={setVerificationState}
      />

      {/* Main Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start">
        {/* Editor */}
        <section className="space-y-6 min-w-0">
          <div className="flex items-center justify-between opacity-50 px-1 border-b border-border pb-2">
            <span className="text-[10px] font-black tracking-widest uppercase text-muted-foreground flex items-center gap-1">
              <LayoutTemplate size={12} /> 원고 작성
            </span>
            <span className="text-[10px] font-mono font-bold text-foreground">
              {plain.length}자
            </span>
          </div>
          <div className="flex flex-col gap-6">
            <textarea
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 text-foreground tracking-tight break-words resize-none overflow-hidden p-0"
              placeholder="제목을 입력하세요"
            />
            <textarea
              value={plain}
              onChange={(e) => setPlain(e.target.value)}
              className="w-full min-h-[600px] text-[18px] leading-[1.9] bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground/30 text-foreground overflow-x-hidden p-0 custom-textarea-cursor font-sans"
              placeholder="보도자료 내용을 이곳에 입력하세요..."
            />
          </div>
        </section>

        {/* AI Preview */}
        <section
          ref={previewRef}
          className="lg:sticky lg:top-24 space-y-6 min-w-0 pt-4 lg:pt-0"
        >
          <div className="flex items-center justify-between px-1 border-b border-border pb-2">
            <span className="text-[10px] font-black tracking-widest text-primary flex items-center gap-2 uppercase">
              <Sparkles size={12} /> AI 첨삭 미리보기
            </span>
          </div>
          <div className="p-8 md:p-10 pt-surface border border-border min-h-[500px] relative overflow-hidden transition-all">
            <div className="space-y-6 break-words">
              <h3 className="text-2xl font-bold tracking-tight text-foreground leading-tight">
                {title || "제목 없음"}
              </h3>
              {renderPreview}
            </div>
          </div>
        </section>
      </div>

      <FloatingActionBar
        reviewing={reviewing}
        usage={usage}
        onReview={handleRunReview}
        onComplete={handleComplete}
        onRequestApproval={() => setShowApprovalModal(true)}
        completeDisabled={!verificationFinalizable}
      />

      {!pendingResult && selectedNoteIds.length > 0 && (
        <div
          className={clsx(
            "pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4 lg:pl-24",
            rightPanelOpen ? "lg:pr-[404px]" : "lg:pr-24",
          )}
        >
          <motion.div
            drag
            dragControls={repolishDragControls}
            dragListener={false}
            dragMomentum={false}
            className="pointer-events-auto w-full max-w-xl border border-ai/20 bg-background/95 p-4 shadow-2xl shadow-ai/10 backdrop-blur-xl"
          >
            <div
              className="flex items-start justify-between gap-4 cursor-grab active:cursor-grabbing"
              onPointerDown={(event) => repolishDragControls.start(event)}
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Sparkles className="h-4 w-4 text-ai" />
                  {selectedNoteIds.length}개 선택 지점으로 수정안 만들기
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  선택한 첨삭 포인트만 반영해서 새 수정안을 만듭니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleNoteSelection("")}
                className="inline-flex items-center justify-center border border-border bg-background p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="선택 해제"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={repolishInstruction}
              onChange={(event) => setRepolishInstruction(event.target.value)}
              placeholder="예: 광고성 표현만 줄이고, 문장을 더 간결하게 정리해줘"
                className="mt-3 h-24 w-full resize-none border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                선택을 유지한 채 수정안을 만들고, 이후 비교 모달에서 반영할 수 있습니다.
              </p>
              <button
                type="button"
                onClick={() => void handleRunRePolish()}
                disabled={reviewing || selectedNoteIds.length === 0}
                className="inline-flex shrink-0 items-center gap-2 bg-ai px-4 py-2.5 text-sm font-semibold text-ai-foreground transition hover:bg-ai/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles className={clsx("h-4 w-4", reviewing && "animate-pulse")} />
                {reviewing ? "수정안 생성 중" : "수정안 만들기"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Review Modal */}
      {pendingResult && (
        <div
          className={clsx(
            "fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300 lg:pl-24",
            rightPanelOpen ? "lg:pr-[404px]" : "lg:pr-24",
          )}
        >
          <div className="bg-background w-full max-w-7xl h-full max-h-[90vh] md:h-auto md:min-h-[700px] shadow-2xl flex flex-col overflow-hidden border border-border ring-1 ring-black/5">
            <div className="shrink-0 p-6 md:p-8 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-6 bg-card/50">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                  <Sparkles size={28} />
                </div>
                <div>
                  <h3 className="text-xl md:text-2xl font-bold tracking-tight text-foreground italic uppercase">
                    AI Polish Review
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 font-medium">
                    하이라이트된 지점이 새롭게 제안된 수정 내용입니다.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingResult(null)}
                  className="flex-1 md:flex-none px-6 py-3.5 border border-border font-bold text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                >
                  취소
                </button>
                <button
                  onClick={handleApply}
                  className="flex-1 md:flex-none px-10 py-3.5 bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-all active:scale-95"
                >
                  반영하기
                </button>
              </div>
            </div>

            <div
              ref={containerRef}
              className="flex-1 overflow-hidden flex flex-col md:flex-row relative bg-card"
            >
              {/* Revised */}
              <div
                style={{
                  flex: splitRatio,
                  ...(typeof window !== "undefined" && window.innerWidth < 768
                    ? { height: `${splitRatio * 100}%` }
                    : { width: `${splitRatio * 100}%` }),
                }}
                className="flex flex-col bg-emerald-500/5 min-h-0 min-w-0"
              >
                <div className="shrink-0 px-8 py-4 bg-emerald-500/10 border-b border-emerald-500/20 flex justify-between items-center">
                  <span className="text-[11px] font-black tracking-[0.2em] text-emerald-600 dark:text-emerald-400 uppercase">
                    Revised (AI 수정안)
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar">
                  <div className="max-w-2xl mx-auto space-y-6 text-left">
                    <h4 className="text-2xl font-bold text-foreground tracking-tight leading-snug">
                      {highlightDiff(title, pendingResult.title)}
                    </h4>
                    <div className="text-[17px] md:text-[19px] leading-[1.8] text-foreground/90 whitespace-pre-wrap font-medium">
                      {highlightDiff(plain, pendingResult.plain)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Handle */}
              <div
                onMouseDown={startDrag}
                onTouchStart={startDrag}
                className={clsx(
                  "shrink-0 z-30 transition-colors group flex items-center justify-center bg-border hover:bg-primary/50 active:bg-primary",
                  "md:w-1.5 md:h-full md:cursor-col-resize",
                  "h-1.5 w-full cursor-row-resize",
                )}
              >
                <div className="bg-muted-foreground/30 group-hover:bg-primary-foreground rounded-full md:w-[2px] md:h-8 w-8 h-[2px]" />
              </div>

              {/* Original */}
              <div
                style={{
                  flex: 1 - splitRatio,
                  ...(typeof window !== "undefined" && window.innerWidth < 768
                    ? { height: `${(1 - splitRatio) * 100}%` }
                    : { width: `${(1 - splitRatio) * 100}%` }),
                }}
                className="flex flex-col bg-muted/30 min-h-0 min-w-0"
              >
                <div className="shrink-0 px-8 py-4 bg-muted/50 text-[11px] font-black tracking-[0.2em] text-muted-foreground uppercase border-b border-border">
                  Original (원본)
                </div>
                <div className="flex-1 overflow-y-auto p-8 text-left opacity-70 hover:opacity-100 transition-opacity">
                  <div className="max-w-md mx-auto space-y-4">
                    <h4 className="text-lg font-bold text-muted-foreground">
                      {title}
                    </h4>
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {plain}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {hoverData && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed z-[1000] px-4 py-3 bg-slate-900 text-white text-[12px] shadow-2xl pointer-events-none -translate-x-1/2 -translate-y-full mb-3 leading-relaxed max-w-xs border border-slate-700 ring-1 ring-black/50"
                style={{ top: hoverData.y, left: hoverData.x }}
              >
                <div className="flex items-center gap-1.5 text-blue-400 font-black tracking-widest text-[9px] mb-1.5 uppercase italic">
                  AI Analysis Insight
                </div>
                {hoverData.note}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45 border-r border-b border-slate-700" />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-[150] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/30">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Users size={16} className="text-primary" />
                검토/결재 요청
              </h3>
              <button
                onClick={() => setShowApprovalModal(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  요청 대상 선택
                </label>
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    size={14}
                  />
                  <input
                    type="text"
                    placeholder="팀원 검색..."
                    value={approvalSearch}
                    onChange={(e) => setApprovalSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-sm pt-input"
                  />
                </div>
                <div className="h-40 overflow-y-auto bg-muted/30 border border-border p-2 space-y-1 custom-scrollbar">
                  {filteredMembers.length > 0 ? (
                    filteredMembers.map((m) => (
                      <button
                        key={m.userId}
                        onClick={() => setSelectedApproverId(m.userId)}
                        className={clsx(
                          "w-full flex items-center gap-3 p-2 text-left transition-all",
                          selectedApproverId === m.userId
                            ? "bg-primary/10 border border-primary/30"
                            : "hover:bg-muted/80 border border-transparent",
                        )}
                      >
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden border border-border shrink-0">
                          {m.user.avatarUrl ? (
                            <Image
                              src={m.user.avatarUrl}
                              alt={m.user.label}
                              width={32}
                              height={32}
                              className="object-cover rounded-full"
                            />
                          ) : (
                            <span className="text-xs">👤</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div
                            className={clsx(
                              "text-sm font-bold truncate",
                              selectedApproverId === m.userId
                                ? "text-primary"
                                : "text-foreground",
                            )}
                          >
                            {m.user.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {m.role} • {m.user.email || "이메일 없음"}
                          </div>
                        </div>
                        {selectedApproverId === m.userId && (
                          <CheckCircle2
                            size={16}
                            className="text-primary ml-auto"
                          />
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs gap-2">
                      <AlertCircle size={20} className="opacity-50" />
                      <span>
                        {teamMembers.length > 0
                          ? "검색된 팀원이 없습니다."
                          : "팀원이 없습니다."}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  요청 메시지 (선택)
                </label>
                <textarea
                  value={approvalMessage}
                  onChange={(e) => setApprovalMessage(e.target.value)}
                  placeholder="검토 요청 사항을 간단히 적어주세요."
                  className="w-full h-24 p-4 text-sm resize-none pt-input"
                />
              </div>
            </div>

            <div className="p-5 border-t border-border bg-muted/30 flex gap-3">
              <button
                onClick={() => setShowApprovalModal(false)}
                className="flex-1 py-3 border border-border hover:bg-muted text-muted-foreground text-sm font-bold transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSendApproval}
                disabled={!selectedApproverId || reviewing}
                className="flex-1 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground text-sm font-bold transition-all flex items-center justify-center gap-2"
              >
                {reviewing ? (
                  <>전송 중...</>
                ) : (
                  <>
                    <Send size={14} /> 요청 보내기
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
