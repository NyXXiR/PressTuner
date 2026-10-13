import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin, requireTeamContext } from "../../../auth";
import { serviceError } from "../../serviceError";
import type { StudyActor } from "./studyService";

export async function studyActor(): Promise<StudyActor> { const { user, team, role } = await requireTeamContext(); return { userId: user.id, teamId: team.id, operator: isAdmin(role) }; }
export function studyJson(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } }); }
export async function studyBody(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin || !request.headers.get("content-type")?.startsWith("application/json")) throw serviceError(403, "SAME_ORIGIN_REQUIRED", "같은 사이트에서 실행해 주세요.");
  const reader = request.body?.getReader(); if (!reader) throw serviceError(422, "INVALID_REQUEST", "요청이 없습니다.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 65536) { await reader.cancel(); throw serviceError(413, "REQUEST_TOO_LARGE", "요청이 너무 큽니다."); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw serviceError(422, "INVALID_REQUEST", "요청 형식을 확인해 주세요."); }
}
export function studyFailure(error: unknown) {
  const e = error as { status?: number; code?: string; message?: string };
  const domain = /^[A-Z][A-Z0-9_]{2,100}$/.test(e.message ?? "") ? e.message : null;
  const code = error instanceof z.ZodError ? "INVALID_REQUEST" : e.code ?? domain ?? "QUALITY_STUDY_FAILED";
  const status = error instanceof z.ZodError ? 422 : e.status ?? (domain ? /REVOKED|OWNER_REQUIRED/.test(domain) ? 403 : /NOT_FOUND/.test(domain) ? 404 : 409 : 500);
  return studyJson({ ok: false, code, message: status === 500 ? "평가 연구 작업을 완료하지 못했습니다." : code }, status);
}
