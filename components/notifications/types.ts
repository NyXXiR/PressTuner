// components/notifications/types.ts
export type NotificationType = "INVITATION" | "NOTICE" | "INFO" | "LINK";

export type NotificationBase = {
  id: string;
  type: NotificationType;
  createdAt: string; // ISO
  isRead: boolean;
  readAt?: string | null;

  // 서버에서 isActive=true만 내려주더라도, 클라 안정성 위해 optional 유지
  isActive?: boolean;
};

export type InvitationNotification = NotificationBase & {
  type: "INVITATION";
  invitationId: string;
  teamName: string;
  inviterLabel: string;
  message?: string | null;
};

export type NoticeNotification = NotificationBase & {
  type: "NOTICE";
  title: string;
  href: string;
  body?: string | null;
  bannerText?: string | null;
};

export type InfoNotification = NotificationBase & {
  type: "INFO";
  title: string;
  body?: string | null;
};

export type LinkNotification = NotificationBase & {
  type: "LINK";
  title: string;
  href: string;
  body?: string | null;
};

export type AppNotification =
  | InvitationNotification
  | NoticeNotification
  | InfoNotification
  | LinkNotification;
