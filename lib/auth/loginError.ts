const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  oauth_database_unavailable:
    "데이터베이스 연결이 불안정합니다. 잠시 후 Google 로그인을 다시 시도해 주세요.",
  oauth_failed: "Google 로그인 처리에 실패했습니다. 다시 시도해 주세요.",
  oauth_state: "로그인 요청이 만료되었습니다. Google 로그인을 다시 시작해 주세요.",
};

export function getLoginErrorMessage(code: string | null) {
  return code ? LOGIN_ERROR_MESSAGES[code] ?? null : null;
}
