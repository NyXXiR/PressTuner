"use client";

import { useEffect } from "react";
import { recordRecentPressHistory } from "@/lib/recentPressHistory";
import { useMeStore } from "@/stores/useMeStore";
import { useTeamStore } from "@/stores/useTeamStore";

type Status = "DRAFT" | "IN_PROGRESS" | "FINAL";

export default function RecordRecentPress({
  article,
}: {
  article: {
    id: string;
    title: string;
    status: Status;
    updatedAt: string; // ISO
  };
}) {
  const me = useMeStore((s) => s.me);
  const selectedTeamId = useTeamStore((s) => s.selectedTeamId);

  useEffect(() => {
    const userId = me?.userId;
    const teamId = selectedTeamId ?? me?.teamId; // 팀 화면이면 selectedTeamId가 들어가고, 아니면 세션 teamId fallback

    if (!userId || !teamId) return;
    if (!article?.id) return;

    recordRecentPressHistory(userId, teamId, {
      id: article.id,
      title: article.title || "(제목 없음)",
      status: article.status,
      updatedAt: article.updatedAt,
    });
  }, [
    me?.userId,
    me?.teamId,
    selectedTeamId,
    article.id,
    article.title,
    article.status,
    article.updatedAt,
  ]);

  return null;
}
