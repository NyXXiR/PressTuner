export type ServiceError = Error & {
  status: number;
  code?: string;
  details?: unknown;
};

export function serviceError(
  status: number,
  code: string,
  message: string,
  details?: unknown
): ServiceError {
  const err = new Error(message) as ServiceError;
  err.status = status;
  err.code = code;
  err.details = details;
  return err;
}
