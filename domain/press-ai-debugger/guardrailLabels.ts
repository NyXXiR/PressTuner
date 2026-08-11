export type BilingualLabel = Readonly<{ ko: string; en: string }>;

const labels = {
  requirement: {
    "article-team-ownership": { ko: "문서 팀 소유권", en: "Article team ownership" },
    "fresh-press-release": { ko: "새 보도자료 문서", en: "Fresh press release" },
    "memo-brief-grounding": { ko: "메모-브리프 근거 일치", en: "Memo-to-brief grounding" },
    "critical-fact-preservation": { ko: "핵심 사실 보존", en: "Critical fact preservation" },
    "brief-draft-grounding": { ko: "브리프-초안 근거 일치", en: "Brief-to-draft grounding" },
    "press-structure": { ko: "보도자료 구조", en: "Press release structure" },
    "review-note-selection": { ko: "리뷰 노트 선택 검증", en: "Review note selection" },
    "rewrite-instruction-bounds": { ko: "수정 지침 범위", en: "Rewrite instruction bounds" },
    "review-checkpoint-lineage": { ko: "리뷰 체크포인트 계보", en: "Review checkpoint lineage" },
    "fixed-evidence-claim-support-v1": { ko: "고정 문서 주장 근거", en: "Fixed-document claim support" },
  },
  stage: {
    "article-initialization": { ko: "문서 초기화", en: "Article initialization" },
    "brief-normalization": { ko: "브리프 정규화", en: "Brief normalization" },
    "draft-generation": { ko: "초안 생성", en: "Draft generation" },
    "draft-review": { ko: "초안 리뷰", en: "Draft review" },
  },
  edge: {
    "initialization-brief": { ko: "초기화에서 브리프로", en: "Initialization to brief" },
    "brief-draft": { ko: "브리프에서 초안으로", en: "Brief to draft" },
    "draft-review": { ko: "초안에서 리뷰로", en: "Draft to review" },
    "review-rewrite": { ko: "리뷰에서 수정으로", en: "Review to rewrite" },
  },
} as const;

const GUARDRAIL_LABELS_KO: Record<string, string> = Object.fromEntries(
  Object.entries(labels.requirement).map(([id, label]) => [id, label.ko]),
);

export function guardrailLabelKo(guardrailId: string): string {
  return GUARDRAIL_LABELS_KO[guardrailId] ?? guardrailId;
}

export function requirementDisplayLabels(args: { requirementId: keyof typeof labels.requirement; stageId: keyof typeof labels.stage; edgeId: keyof typeof labels.edge }) {
  return {
    label: labels.requirement[args.requirementId],
    stageLabel: labels.stage[args.stageId],
    edgeLabel: labels.edge[args.edgeId],
  } satisfies Readonly<{ label: BilingualLabel; stageLabel: BilingualLabel; edgeLabel: BilingualLabel }>;
}
