import { PressDomainError } from "@/domain/press/pressProcess";

const FINALIZATION_CONFLICTS = {
  PRESS_TRANSITION_INVALID: "요청한 상태 전환을 수행할 수 없습니다.",
  PRESS_FINALIZED_IMMUTABLE: "최종 확정된 문서는 변경할 수 없습니다.",
  ARTICLE_VERIFICATION_REQUIRED:
    "최종 확정 전에 현재 초안을 검증해야 합니다.",
  ARTICLE_VERIFICATION_STALE:
    "초안이나 근거가 변경되었습니다. 다시 검증해 주세요.",
  ARTICLE_VERIFICATION_BLOCKED:
    "차단된 사실 오류를 수정하고 다시 검증해 주세요.",
} as const;

export function mapPressFinalizationConflict(error: unknown) {
  const domainConflict = mapPressDomainConflict(error);
  if (domainConflict) return domainConflict;
  const code = error instanceof Error ? error.message : "";
  const message =
    FINALIZATION_CONFLICTS[code as keyof typeof FINALIZATION_CONFLICTS];
  return message ? { status: 409, code, message } : null;
}

export function mapPressDomainConflict(error: unknown) {
  return error instanceof PressDomainError
    ? { status: error.status, code: error.code, message: error.message }
    : null;
}
