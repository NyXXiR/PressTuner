/**
 * Korean display labels for guardrail ids. Presentation-only: the registry
 * topology and its hash stay untouched, so stored attempts keep replaying.
 */
const GUARDRAIL_LABELS_KO: Record<string, string> = {
  "article-team-ownership": "문서 팀 소유권",
  "fresh-press-release": "새 보도자료 문서",
  "memo-brief-grounding": "메모-브리프 근거 일치",
  "critical-fact-preservation": "핵심 사실 보존",
  "brief-draft-grounding": "브리프-초안 근거 일치",
  "press-structure": "보도자료 구조",
  "review-note-selection": "리뷰 노트 선택 검증",
  "rewrite-instruction-bounds": "수정 지침 범위",
  "review-checkpoint-lineage": "리뷰 체크포인트 계보",
  "rewrite-review-lineage": "수정본 리뷰 계보",
};

export function guardrailLabelKo(guardrailId: string): string {
  return GUARDRAIL_LABELS_KO[guardrailId] ?? guardrailId;
}
