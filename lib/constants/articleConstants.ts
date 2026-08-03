// lib/constants/articleConstants.ts
import { ArticleStatus, ArticleType } from "@prisma/client";

// 공용 상태 라벨
export const STATUS_LABEL: Record<ArticleStatus, string> = {
  BRIEF: "요약",
  DRAFT: "초안",
  IN_PROGRESS: "검토 중",
  DECLINED: "반려됨",
  FINAL: "발행 완료",
};

// 공용 타입 라벨
export const TYPE_LABEL: Record<ArticleType, string> = {
  PRESS_RELEASE: "보도자료",
  BLOG_POST: "블로그",
  ANNOUNCEMENT: "공지",
  OTHER: "기타",
};

// 드롭다운/필터에서 사용할 옵션 리스트
export const STATUS_OPTIONS: Array<{ value: ArticleStatus; label: string }> = [
  { value: "DRAFT", label: STATUS_LABEL.DRAFT },
  { value: "IN_PROGRESS", label: STATUS_LABEL.IN_PROGRESS },
  { value: "DECLINED", label: STATUS_LABEL.DECLINED },
  { value: "FINAL", label: STATUS_LABEL.FINAL },
];

export const TYPE_OPTIONS: Array<{ value: ArticleType; label: string }> = [
  { value: "PRESS_RELEASE", label: TYPE_LABEL.PRESS_RELEASE },
  { value: "BLOG_POST", label: TYPE_LABEL.BLOG_POST },
  { value: "ANNOUNCEMENT", label: TYPE_LABEL.ANNOUNCEMENT },
  { value: "OTHER", label: TYPE_LABEL.OTHER },
];
