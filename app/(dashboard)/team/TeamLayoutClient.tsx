// app/team/TeamLayoutClient.tsx
"use client";

import { useEffect } from "react";
import { useTeamStore } from "@/stores/useTeamStore";

export default function TeamLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const selectedTeamId = useTeamStore((s) => s.selectedTeamId);
  const hydrateFromStorage = useTeamStore((s) => s.hydrateFromStorage);

  // /team에 진입했을 때도 스토어를 즉시 복구(사이드바보다 먼저 실행될 수 있음)
  useEffect(() => {
    hydrateFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ teamId가 바뀌면 /team 하위 전체가 remount → 팀 화면들이 확실히 초기화/재조회됨
  return <div key={selectedTeamId ?? "no-team"}>{children}</div>;
}
