// src/lib/errors.ts

export class ServiceError extends Error {
  status: number;
  code: string;
  data?: unknown;

  constructor(code: string, status: number, message?: string, data?: unknown) {
    super(message ?? code);
    this.code = code;
    this.status = status;
    this.data = data;
    // TypeScript 컴파일 타겟(ES5) 이슈 방지를 위해 프로토타입 설정
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}
