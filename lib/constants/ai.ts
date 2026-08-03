// lib/constants/ai.ts

/**
 * 프로젝트 전반에서 사용하는 AI 모델 정의
 */
export const AI_MODELS = {
  // 기본 생성 및 분석용 (비용 대비 성능 최적)
  DEFAULT: "gpt-4o",

  // 가격대비 균형이 좋은 생성용
  SMART_MINI: "gpt-4.1-mini",
  
  // 가벼운 작업용
  MINI: "gpt-4o-mini",
  
  // 고성능/복잡한 작업용
  PRO: "gpt-4o",

  // 자소서 첨삭/재작성용
  RESUME_REPOLISH: "gpt-4.1",
  
  // 임베딩용
  EMBEDDING: "text-embedding-3-small",
} as const;

export type AiModel = typeof AI_MODELS[keyof typeof AI_MODELS];
