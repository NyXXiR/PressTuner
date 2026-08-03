import { prisma } from "@/lib/prisma";
import { NotificationType, Notification } from "@prisma/client";
import { ServiceError } from "../errors";

/**
 * 서비스에서 반환할 알림 데이터 타입 (Prisma 결과 + 계산된 필드)
 */
export type NotificationItem = Notification & {
  isRead: boolean;
  readAt: Date | null;
  // 필요하다면 sender, invitee 등 relation 정보 추가
};

/**
 * 알림 목록 조회 (Inbox / Popover)
 */
export async function getNotifications({
  userId,
  teamId,
  scope = "popover",
  take = 12,
  cursor,
}: {
  userId: string;
  teamId: string | null;
  scope?: "popover" | "all";
  take?: number;
  cursor?: string | null;
}) {
  // 1. 쿼리 조건 구성
  // - 내 유저 ID로 온 알림
  // - OR (현재 팀 ID로 온 알림)
  // - OR (전역 공지: userId null AND teamId null)
 const whereCondition = {
    isActive: true,
    OR: [
      // 1. 나에게 직접 온 알림 (팀 무관, 가장 우선)
      { userId },

      // 2. 내 팀에 온 알림 중, "수신자가 특정되지 않은(전체 공지)" 것만
      //    (userId가 다른 사람인 알림은 제외됨)
      ...(teamId
        ? [{
            teamId,
            userId: null // ✅ [수정] userId가 null인 것만 팀 공지로 인정
          }]
        : []
      ),

      // 3. 전역 공지 (마찬가지로 수신자가 없어야 함)
      { userId: null, teamId: null },
    ],
  };


  // 2. Prisma 조회
  const rawItems = await prisma.notification.findMany({
    where: whereCondition,
    take: take + 1, // 다음 페이지 존재 여부 확인용 +1
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      // 읽음 여부 확인을 위해 relation 조회
      reads: {
        where: { userId },
        select: { readAt: true },
      },
    },
  });

  // 3. 데이터 가공 (isRead 필드 주입)
  const hasNextPage = rawItems.length > take;
  const itemsToReturn = hasNextPage ? rawItems.slice(0, -1) : rawItems;

  const notifications: NotificationItem[] = itemsToReturn.map((item) => {
    const readRecord = item.reads[0]; // unique 조건이므로 0번째 혹은 없음
    // 구조 분해로 reads 배열은 제외하고 반환
    const { reads, ...rest } = item;
    return {
      ...rest,
      isRead: !!readRecord,
      readAt: readRecord?.readAt ?? null,
    };
  });

  // scope가 'popover'라면 읽지 않은 것만 필터링하거나,
  // 기획에 따라 다르게 처리할 수 있음.
  // 여기서는 API 로직을 그대로 따르되, 필요시 filter 로직 추가 가능.

  return {
    items: notifications,
    nextCursor: hasNextPage ? itemsToReturn[itemsToReturn.length - 1].id : null,
  };
}

/**
 * 알림 읽음 처리
 */
export async function markNotificationAsRead({
  notificationId,
  userId,
}: {
  notificationId: string;
  userId: string;
}) {
  // 1. 알림 존재 여부 및 메타데이터 조회
  const n = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true, teamId: true },
  });

  if (!n) {
    throw new ServiceError("NOT_FOUND", 404, "알림을 찾을 수 없습니다.");
  }

  // 2. 접근 권한 체크 로직 (API에 있던 로직 이관)
  let canAccess = false;

  // 2-1. 특정 유저 타겟
  if (n.userId && n.userId === userId) {
    canAccess = true;
  }

  // 2-2. 팀 타겟이면: 멤버십 확인
  if (!canAccess && n.teamId) {
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: n.teamId, userId } },
      select: { teamId: true },
    });
    if (member) canAccess = true;
  }

  // 2-3. 전역 알림
  if (!canAccess && !n.teamId && !n.userId) {
    canAccess = true;
  }

  if (!canAccess) {
    throw new ServiceError("FORBIDDEN", 403, "알림에 접근할 권한이 없습니다.");
  }

  // 3. 읽음 처리 (Upsert)
  await prisma.notificationRead.upsert({
    where: { notificationId_userId: { notificationId, userId } },
    create: { notificationId, userId },
    update: { readAt: new Date() },
  });

  return true;
}

/**
 * (선택) 알림 생성 - 추후 사용성을 위해 추가
 */
export async function createNotification({
  type,
  userId,
  teamId,
  title,
  body,
  href,
  bannerText,
}: {
  type: NotificationType;
  userId?: string;
  teamId?: string;
  title: string;
  body?: string;
  href?: string;
  bannerText?: string;
}) {
  return prisma.notification.create({
    data: {
      type,
      userId,
      teamId,
      title,
      body,
      href,
      bannerText,
      isActive: true,
    },
  });
}
