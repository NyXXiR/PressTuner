export type LoadingCtl = {
  getLoading?: () => boolean; // 이미 로딩이면 중복 실행 방지
  setLoading: (v: boolean) => void;
  setError?: (msg: string | null) => void;
  onFinally?: () => void;
};

function toMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "알 수 없는 오류";
  }
}

/**
 * 공통 비동기 실행기
 * - 로딩 토글
 * - 에러 초기화/세팅
 * - 중복 실행 방지(옵션)
 */
export async function runWithLoading<T>(
  ctl: LoadingCtl,
  fn: () => Promise<T>
): Promise<T | undefined> {
  if (ctl.getLoading?.()) return;

  ctl.setLoading(true);
  ctl.setError?.(null);

  try {
    return await fn();
  } catch (e) {
    ctl.setError?.(toMessage(e));
    throw e;
  } finally {
    ctl.setLoading(false);
    ctl.onFinally?.();
  }
}
