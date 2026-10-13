// Browser projection only. Runtime domain/statistics stay on the server.
import type { studySummary } from "../../../lib/services/press-workflow/evaluation/studyService";
import type { experimentReport } from "../../../domain/press-workflow/evaluation/study-experiment";
import type { studyReport } from "../../../domain/press-workflow/evaluation/study-analysis";
import type { Choice, Exposure, StudyCommand } from "../../../domain/press-workflow/evaluation/study-contracts";

export type StudySummary = ReturnType<typeof studySummary> & { resultRef?: string | null; replayed?: boolean };
export type Batch = StudySummary["batches"][number];
export type ReviewItem = Batch["items"][number];
export type PairPacket = StudySummary["pairs"][number];
export type ExperimentReport = ReturnType<typeof experimentReport>;
export type ReportResponse = { id: string; revision: number; report: ReturnType<typeof studyReport>; experiments: ExperimentReport[] };
type WithoutEnvelope<T> = T extends unknown ? Omit<T, "expectedRevision" | "idempotencyKey"> : never;
export type Command = WithoutEnvelope<StudyCommand>;
export const criterionLabels: Record<string, string> = {
  FACTUAL_SUPPORT: "사실과 근거", PROMOTIONAL_CLAIMS: "과장 표현", REQUIRED_FACTS: "필수 내용",
  STYLE_LEAKAGE: "예시의 사실 혼입", REQUESTED_STYLE: "요청한 문체", RAGAS: "주장을 뒷받침하는 근거", DEEPEVAL: "근거와 다른 내용",
};
export const choiceLabels: Record<Choice, string> = { APPLY: "수정 필요", KEEP: "현재 내용 유지", DEFER: "나중에 판단", PASS: "기준 충족", FAIL: "문제 있음", UNCERTAIN: "판단 어려움", SKIP: "건너뛰기" };
export const pairLabels = { A: "A가 더 나아요", B: "B가 더 나아요", TIE: "차이 없음", UNCERTAIN: "판단 어려움", SKIP: "건너뛰기" };

function mentionedExcerpt(output: string, reason: string | null) {
  if (!reason) return null;
  // Navigation aid, never a new judge: only exact quotes or numeric/unit strings
  // from the explanation that also occur in the actual draft can select a span.
  const quoted = [...reason.matchAll(/["“‘'`「]([^"”’'`」\n]{6,160})["”’'`」]/g)].map(m => m[1]);
  const numbers = reason.match(/\d[\d,]*(?:\.\d+)?\s*(?:원|명|%|년|월|일|개)/g) ?? [];
  const needles = [...quoted, ...numbers].filter(s => output.includes(s));
  const matches = output.split(/(?<=[.!?。])\s+|\n+/).filter(s => needles.some(n => s.includes(n)));
  return matches.length ? matches.slice(0, 2).join("\n") : null;
}

export function reviewCard(batch: Batch, item: ReviewItem) {
  const assisted = batch.purpose === "PRODUCT" && batch.presentation === "ASSISTED";
  const automatic = assisted ? item.automatic ?? null : null;
  return { id: item.id, title: criterionLabels[item.criterion] ?? "내용 확인", instruction: item.instruction,
    output: item.output, facts: item.facts, request: item.request, automatic, excerpt: mentionedExcerpt(item.output, automatic?.reason ?? null),
    status: !assisted ? "직접 확인" : !automatic || automatic.state !== "COMPLETED" ? "자동 평가 미완료" : automatic.thresholdPassed === false ? "우선 확인" : "근거를 보고 확인",
    choices: item.choices.filter(c => assisted ? ["APPLY", "KEEP", "DEFER"].includes(c) : ["PASS", "FAIL", "UNCERTAIN", "SKIP"].includes(c)).map(c => ({ value: c as Choice, label: choiceLabels[c as Choice] })),
    effect: assisted ? "선택은 검토 의견으로 저장됩니다. 원고는 자동으로 바뀌지 않습니다." : "이 기준에 대한 판단만 저장합니다. 판단하기 어렵거나 지금 검토할 수 없다면 그대로 선택해 주세요.",
    saved: item.choice ? choiceLabels[item.choice] : null };
}

export function reviewCommand(batch: Batch, item: ReviewItem, choice: Choice, exposure: Exposure | null): Extract<Command, { action: "SUBMIT_REVIEW" }> {
  if (!reviewCard(batch, item).choices.some(x => x.value === choice)) throw new Error("INVALID_CHOICE");
  if (batch.purpose !== "PRODUCT" && exposure === null) throw new Error("EXPOSURE_REQUIRED");
  return { action: "SUBMIT_REVIEW", review: { batchId: batch.id, itemId: item.id, expectedRevision: item.revision, choice, priorExposure: batch.purpose === "PRODUCT" ? "SEEN_JUDGE" : exposure! } };
}

const reasonLabels: Record<string, string> = {
  INCOMPLETE_EXECUTION: "생성 또는 평가가 아직 완료되지 않았습니다.", REGRESSION_EVIDENCE_NOT_PASSING: "알려진 문제를 다시 검사한 결과가 충분하지 않습니다.",
  INDEPENDENT_AUDIT_INSUFFICIENT: "별도 사례에서 평가기가 얼마나 정확한지 확인이 더 필요합니다.", INDEPENDENT_EFFECT_INSUFFICIENT: "새 사례에서도 개선되는지 확인이 더 필요합니다.",
  PAIRWISE_EVIDENCE_INSUFFICIENT: "두 초안에 대한 사람의 비교가 더 필요합니다.",
};
export function decisionView(report: { state: string; regression: { state: string }; reasons: string[]; adoption: unknown }) {
  return { title: report.state === "REGRESSION" ? "기존보다 나빠진 항목이 있습니다" : report.state === "READY_FOR_OPERATOR" ? "개선안 채택을 검토할 수 있습니다" : "아직 개선안을 채택할 근거가 부족합니다",
    reasons: report.reasons.map(r => reasonLabels[r] ?? "추가 확인이 필요합니다."),
    regression: report.regression.state === "UNKNOWN" ? "재발 여부를 판단할 근거가 부족합니다." : report.regression.state === "REGRESSION" ? "확인된 문제가 다시 나타났습니다." : "등록된 문제의 재검사를 통과했습니다.",
    canSelect: report.state === "READY_FOR_OPERATOR" && report.regression.state === "PASS" && !report.adoption };
}

export function errorCopy(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (/REVISION_CONFLICT/.test(code)) return "다른 변경이 먼저 저장되어 최신 상태를 불러왔습니다. 내용을 확인하고 다시 선택해 주세요.";
  if (/NO_REVIEW_ITEMS/.test(code)) return "이 검토에서 확인할 항목을 모두 마쳤습니다.";
  if (/OPERATOR_REQUIRED/.test(code)) return "새 검토 준비와 개선안 실행은 팀 관리자가 할 수 있습니다. 배정된 검토는 계속할 수 있습니다.";
  if (/EXPOSURE_REQUIRED/.test(code)) return "자동 평가나 비교 결과를 본 적이 있는지 먼저 선택해 주세요.";
  if (/CALIBRATION_POLICY_REQUIRED|CALIBRATION_POLICY_FROZEN/.test(code)) return "검증 기준을 준비 중이거나 이미 고정했습니다. 담당자에게 현재 검토 단계를 확인해 주세요.";
  if (/NO_DEVELOPMENT|HYPOTHES|FAILURE|PROFILE|IDENTITY|RUNTIME|RECIPE/.test(code)) return "현재 평가와 연결할 개선 비교를 준비하지 못했습니다. 평가 설정과 실패 사례를 확인해 주세요.";
  if (/401|UNAUTHORIZED|AUTHENTICATED/.test(code)) return "로그인이 필요합니다. 다시 로그인한 뒤 이어서 검토해 주세요.";
  if (/403|404|NOT_FOUND|REVOKED|FORBIDDEN|OWNER_REQUIRED/.test(code)) return "이 검토에 접근할 수 없습니다. 현재 팀과 접근 권한을 확인해 주세요.";
  if (/PENDING_REQUEST|AMBIGUOUS/.test(code)) return "저장 결과를 확인하지 못했습니다. 같은 요청으로 결과를 확인해 주세요.";
  return "작업을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.";
}
