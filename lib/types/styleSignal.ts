// lib/types/styleSignal.ts
import type { ArticleStatus, ArticleType } from "@prisma/client";

/**
 * 1. AI 수정 지시 (rePolishUseCase)
 * 사용자가 "건조하게 바꿔줘"라고 했을 때의 의도와 전후 결과
 */
export interface SignalPayloadRefinement {
  kind: "ai_refinement_instruction";
  instruction: string; // 사용자 프롬프트 (예: "더 건조하게")
  targetNotes: Array<{
    id: string;
    quote: string;
    note: string;
  }>; // AI가 지적했던 구간들
  beforeSnippet: string; // 변경 전 텍스트 일부
  afterSnippet: string; // 변경 후 텍스트 일부
}

/**
 * 2. 수동 편집 Diff (saveDraftUseCase)
 * 사용자가 에디터에서 직접 고친 내역
 */
export interface SignalPayloadManualEdit {
  kind: "manual_edit_diff";
  diffs: Array<{
    field: string; // "title", "lead", "body" 등
    from: string;
    to: string;
  }>;
}

/**
 * 3. 상태 스냅샷 (updateStatusUseCase)
 * 문서가 Final/In_Progress 등 주요 단계에 도달했을 때의 모습
 */
export interface SignalPayloadSnapshot {
  kind: "status_snapshot";
  status: ArticleStatus;
  snapshot: {
    title: string;
    lead?: string | null;
    bodyJson: any; // 전체 구조 파악용
  };
}

/**
 * 4. 피드백 (submitArticleFeedbackUseCase)
 * 사용자가 좋아요/싫어요 및 코멘트
 */
export interface SignalPayloadFeedback {
  kind: "feedback_vote";
  vote: "LIKE" | "DISLIKE";
  hasComment: boolean;
  commentSnippet?: string | null;
  articleType?: ArticleType | null;
}

/**
 * ✅ [Main Union Type]
 * DB에 저장될 때는 JSON이지만, 코드 레벨에서는 이 타입을 강제합니다.
 */
export type StyleSignalPayload =
  | SignalPayloadRefinement
  | SignalPayloadManualEdit
  | SignalPayloadSnapshot
  | SignalPayloadFeedback;
