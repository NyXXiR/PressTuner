import { z } from "zod";
import { buildApiError, type ApiErrorBody } from "@/lib/utils/api";

/**
 * 1. [실행기] Zod 스키마 검증 함수 (기존 코드 유지 + Issues 타입 수정)
 */
export function validate<T>(schema: z.Schema<T>, data: unknown) {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }

  const errors: Record<string, string> = {};
  result.error.issues.forEach((err) => {
    const path = err.path.join(".");
    if (!errors[path]) {
      errors[path] = err.message;
    }
  });

  return { success: false, data: null, errors };
}

type ValidationResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      body: ApiErrorBody;
    };

export function validateBody<T>(
  schema: z.Schema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    status: 400,
    body: buildApiError("INVALID_REQUEST", "Invalid request", {
      fields: result.error.format(),
    }),
  };
}

export function validateQuery<T>(
  schema: z.Schema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    status: 400,
    body: buildApiError("INVALID_REQUEST", "Invalid request", {
      fields: result.error.format(),
    }),
  };
}

/**
 * 2. [규칙 생성기] 자주 쓰는 유효성 규칙 모음 (공통 기능)
 * 매번 .min(1, "메시지") 치기 귀찮을 때 사용
 */
export const V = {
  // 필수 입력 (문자열)
  required: (label: string) =>
    z.string().min(1, `${label}을(를) 입력해주세요.`),

  // 글자 수 제한 (최소)
  minLen: (label: string, min: number) =>
    z.string().min(min, `${label}은(는) 최소 ${min}자 이상이어야 합니다.`),

  // 글자 수 제한 (최대)
  maxLen: (label: string, max: number) =>
    z.string().max(max, `${label}은(는) 최대 ${max}자까지 입력 가능합니다.`),

  // 범위 제한 (최소 ~ 최대)
  range: (label: string, min: number, max: number) =>
    z
      .string()
      .min(min, `${label}은(는) 최소 ${min}자 이상이어야 합니다.`)
      .max(max, `${label}은(는) 최대 ${max}자까지 입력 가능합니다.`),

  // 숫자 필수 (문자열로 들어온 숫자 처리 포함 원할 시 커스텀 가능)
  number: (label: string, min = 0) =>
    z.number().min(min, `${label}은(는) ${min} 이상의 숫자여야 합니다.`),
};
