// lib/notices.ts
import { prisma } from "@/lib/prisma";

export type NoticeListItem = {
  id: string;
  title: string;
  preview: string;
  createdAt: string; // ISO
  sendAsNotification: boolean;
};

function toItem(n: {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  sendAsNotification: boolean;
}): NoticeListItem {
  return {
    id: n.id,
    title: n.title,
    preview: (n.content ?? "").slice(0, 160),
    createdAt: n.createdAt.toISOString(),
    sendAsNotification: n.sendAsNotification,
  };
}

/**
 * ✅ 전역 공지사항
 * - scope = GLOBAL 인 것만
 * - (권한/작성자 제한은 API에서 처리)
 */
export async function getGlobalNoticesList(
  take = 50
): Promise<NoticeListItem[]> {
  const rows = await prisma.notice.findMany({
    where: {
      scope: "GLOBAL",
      isDraft: false,
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      sendAsNotification: true,
    },
  });

  return rows.map(toItem);
}

/**
 * ✅ 팀 공지사항
 * - scope = TEAM + teamId = 현재 팀
 */
export async function getTeamNoticesList(
  teamId: string,
  take = 50
): Promise<NoticeListItem[]> {
  const rows = await prisma.notice.findMany({
    where: {
      scope: "TEAM",
      teamId,
      isDraft: false,
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      sendAsNotification: true,
    },
  });

  return rows.map(toItem);
}
