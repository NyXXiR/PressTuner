// lib/notifications.ts
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AppNotification } from "@/components/notifications/types";

export type InboxScope = "popover" | "all";

export type GetInboxPageArgs = {
  userId: string;
  teamId: string | null;
  scope: InboxScope;
  take: number;
  cursor: string | null; // notification.id
};

type DbRow = Prisma.NotificationGetPayload<{
  include: {
    reads: { select: { readAt: true } };
    invitation: {
      select: {
        id: true;
        message: true;
        status: true;
        team: { select: { name: true } };
        inviter: { select: { label: true } };
      };
    };
    notice: { select: { id: true } };
  };
}>;

/** ---------------------------------------------------------------
 * Where builder
 * -------------------------------------------------------------- */
function buildInboxWhere(args: {
  userId: string;
  teamId: string | null;
  scope: InboxScope;
}): Prisma.NotificationWhereInput {
  const { userId, teamId, scope } = args;

  // ✅ 타겟: (1) user 지정, (2) 현재 팀, (3) 전역 공지(= teamId/userId null)
  const targetOr: Prisma.NotificationWhereInput[] = [{ userId }];

  if (teamId) targetOr.push({ teamId });

  // 전역 공지 알림을 노출하고 싶다면 포함
  targetOr.push({ userId: null, teamId: null, type: "NOTICE" });

  const and: Prisma.NotificationWhereInput[] = [
    { isActive: true },
    { OR: targetOr },
  ];

  if (scope === "popover") {
    // ✅ popover 규칙:
    // - INVITATION: 처리 전까지 유지(읽었어도 계속)
    // - 그 외: unread만
    and.push({
      OR: [{ type: "INVITATION" }, { reads: { none: { userId } } }],
    });
  }

  return { AND: and };
}

/** ---------------------------------------------------------------
 * Fetch
 * -------------------------------------------------------------- */
async function fetchInboxRows(args: GetInboxPageArgs): Promise<DbRow[]> {
  const { userId, teamId, scope, take, cursor } = args;

  return prisma.notification.findMany({
    where: buildInboxWhere({ userId, teamId, scope }),
    orderBy: { createdAt: "desc" },
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      reads: {
        where: { userId },
        select: { readAt: true },
        take: 1,
      },
      invitation: {
        select: {
          id: true,
          message: true,
          status: true,
          team: { select: { name: true } },
          inviter: { select: { label: true } },
        },
      },
      notice: { select: { id: true } },
    },
  });
}

/** ---------------------------------------------------------------
 * Mapper
 * -------------------------------------------------------------- */
function mapToAppNotification(row: DbRow): AppNotification {
  const readAt = row.reads?.[0]?.readAt ?? null;

  const base = {
    id: row.id,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
    isActive: row.isActive,
    isRead: !!readAt,
    readAt: readAt ? readAt.toISOString() : null,
  } as const;

  if (row.type === "INVITATION") {
    const invitationId = row.invitationId ?? row.invitation?.id ?? "";
    return {
      ...base,
      type: "INVITATION",
      invitationId,
      teamName: row.invitation?.team?.name ?? "팀",
      inviterLabel: row.invitation?.inviter?.label ?? "Unknown",
      message: row.invitation?.message ?? null,
    };
  }

  if (row.type === "NOTICE") {
    const href =
      row.href ?? (row.noticeId ? `/notices/${row.noticeId}` : "/notices");
    return {
      ...base,
      type: "NOTICE",
      title: row.title,
      href,
      body: row.body ?? null,
      bannerText: row.bannerText ?? null,
    };
  }

  if (row.type === "INFO") {
    return {
      ...base,
      type: "INFO",
      title: row.title,
      body: row.body ?? null,
    };
  }

  // LINK
  return {
    ...base,
    type: "LINK",
    title: row.title,
    href: row.href ?? "/my/notifications",
    body: row.body ?? null,
  };
}

/** ---------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------- */
export async function getNotificationsInboxPage(args: GetInboxPageArgs) {
  const rows = await fetchInboxRows(args);
  const items = rows.map(mapToAppNotification);

  const nextCursor =
    rows.length === args.take ? rows[rows.length - 1]!.id : null;

  return { items, nextCursor };
}
