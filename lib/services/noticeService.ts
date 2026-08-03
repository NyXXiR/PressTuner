import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";

export type NoticeScope = "GLOBAL" | "TEAM";

export async function getNoticeMeta(id: string) {
  const notice = await prisma.notice.findUnique({
    where: { id },
    select: { id: true, scope: true, teamId: true },
  });

  if (!notice) {
    throw new ServiceError("NOT_FOUND", 404, "NOT_FOUND");
  }

  return {
    id: notice.id,
    scope: ((notice as any).scope ?? "TEAM") as NoticeScope,
    teamId: notice.teamId ?? null,
  };
}

export async function createNotice(input: {
  teamId: string;
  userId: string;
  title: string;
  content: string;
  sendAsNotification: boolean;
}) {
  const notice = await prisma.notice.create({
    data: {
      teamId: input.teamId,
      title: input.title,
      content: input.content,
      sendAsNotification: input.sendAsNotification,
      isDraft: false,
      createdById: input.userId,
    },
  });

  if (input.sendAsNotification) {
    await prisma.notification.upsert({
      where: { noticeId: notice.id },
      create: {
        type: "NOTICE",
        teamId: input.teamId,
        title: notice.title,
        body: null,
        href: `/notices/${notice.id}`,
        bannerText: notice.title,
        noticeId: notice.id,
        isActive: true,
      },
      update: {
        title: notice.title,
        href: `/notices/${notice.id}`,
        bannerText: notice.title,
        isActive: true,
      },
    });
  }

  return notice;
}

export async function updateNotice(input: {
  scope: NoticeScope;
  noticeId: string;
  teamId: string | null;
  title: string;
  content: string;
  sendAsNotification: boolean;
  href: string;
}) {
  const updateWhere =
    input.scope === "TEAM"
      ? { id: input.noticeId, teamId: input.teamId }
      : { id: input.noticeId, teamId: null };

  const r = await prisma.notice.updateMany({
    where: updateWhere as any,
    data: {
      title: input.title,
      content: input.content,
      sendAsNotification: input.sendAsNotification,
    },
  });

  if (r.count === 0) {
    throw new ServiceError("NOT_FOUND", 404, "NOT_FOUND");
  }

  const updated = await prisma.notice.findFirst({
    where: updateWhere as any,
    select: {
      id: true,
      title: true,
      sendAsNotification: true,
      scope: true,
      teamId: true,
    },
  });

  if (!updated) {
    throw new ServiceError("NOT_FOUND", 404, "NOT_FOUND");
  }

  if (updated.sendAsNotification) {
    await prisma.notification.upsert({
      where: { noticeId: updated.id },
      create: {
        type: "NOTICE",
        teamId: input.scope === "TEAM" ? input.teamId : null,
        userId: null,
        title: updated.title,
        body: null,
        href: input.href,
        bannerText: updated.title,
        noticeId: updated.id,
        isActive: true,
      },
      update: {
        title: updated.title,
        href: input.href,
        bannerText: updated.title,
        isActive: true,
        teamId: input.scope === "TEAM" ? input.teamId : null,
        userId: null,
      },
    });
  } else {
    await prisma.notification.updateMany({
      where: {
        type: "NOTICE",
        noticeId: updated.id,
        ...(input.scope === "TEAM" ? { teamId: input.teamId } : { teamId: null }),
      },
      data: { isActive: false },
    });
  }

  return updated;
}

export async function deleteNotice(input: {
  scope: NoticeScope;
  noticeId: string;
  teamId: string | null;
}) {
  const deleteWhere =
    input.scope === "TEAM"
      ? { id: input.noticeId, teamId: input.teamId }
      : { id: input.noticeId, teamId: null };

  const notice = await prisma.notice.findFirst({
    where: deleteWhere as any,
    select: { id: true },
  });

  if (!notice) {
    throw new ServiceError("NOT_FOUND", 404, "NOT_FOUND");
  }

  await prisma.$transaction([
    prisma.notification.updateMany({
      where: {
        type: "NOTICE",
        noticeId: input.noticeId,
        ...(input.scope === "TEAM" ? { teamId: input.teamId } : { teamId: null }),
      },
      data: { isActive: false },
    }),
    prisma.notice.deleteMany({
      where: deleteWhere as any,
    }),
  ]);
}
