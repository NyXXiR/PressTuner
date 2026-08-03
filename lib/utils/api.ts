export type ApiErrorBody = {
  ok: false;
  code: string;
  message: string;
  fields?: unknown;
  details?: unknown;
};

export function buildApiError(
  code: string,
  message: string,
  extra?: { fields?: unknown; details?: unknown }
): ApiErrorBody {
  return {
    ok: false,
    code,
    message,
    ...(extra?.fields ? { fields: extra.fields } : {}),
    ...(extra?.details ? { details: extra.details } : {}),
  };
}

export function apiError(
  code: string,
  message: string,
  status = 400,
  extra?: { fields?: unknown; details?: unknown }
) {
  return { status, body: buildApiError(code, message, extra) };
}
