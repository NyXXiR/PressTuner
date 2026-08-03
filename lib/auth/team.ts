// lib/team.ts
import type { NextRequest } from "next/server";

/**
 * ✅ 팀 선택 확장
 * 우선순위: 헤더(X-Team-Id) > 쿼리(?teamId=)
 * (POST body.teamId는 라우트에서 req.json() 후 별도로 병합)
 */
export function extractTeamIdFromRequest(req: NextRequest): string | null {
  const h = req.headers.get("x-team-id")?.trim();
  if (h) return h;

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("teamId")?.trim();
    if (q) return q;
  } catch {
    // ignore
  }

  return null;
}
