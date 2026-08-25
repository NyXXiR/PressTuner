import { z } from "zod";
import { isSuperAdminEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const ProjectTestDebugAuthorizationRequestSchema = z.strictObject({
  schemaVersion: z.literal("2.0"),
  sessionCredential: z.string().min(1).max(512),
  projectId: z.literal("presstuner"),
  environment: z.literal("conformance"),
});

export const ProjectTestDebugAuthorizationResponseSchema = z.discriminatedUnion("authorized", [
  z.strictObject({ schemaVersion: z.literal("2.0"), authorized: z.literal(false) }),
  z.strictObject({ schemaVersion: z.literal("2.0"), authorized: z.literal(true), operatorSubject: z.string().min(1).max(128), decisionCode: z.literal("OPERATOR_AUTHORIZED") }),
]);

type SessionRecord = { userId: string; expiresAt: Date; user: { id: string; email: string | null; isActive: boolean; deleteScheduledAt: Date | null } };

export async function authorizeProjectTestDebugSession(
  input: unknown,
  dependencies: { loadSession?: (credential: string) => Promise<SessionRecord | null>; now?: () => Date; superAdmin?: typeof isSuperAdminEmail } = {},
) {
  const parsed = ProjectTestDebugAuthorizationRequestSchema.safeParse(input);
  if (!parsed.success) return ProjectTestDebugAuthorizationResponseSchema.parse({ schemaVersion: "2.0", authorized: false });
  const session = await (dependencies.loadSession ?? ((credential) => prisma.session.findUnique({
    where: { id: credential }, select: { userId: true, expiresAt: true, user: { select: { id: true, email: true, isActive: true, deleteScheduledAt: true } } },
  })))(parsed.data.sessionCredential);
  if (!session || session.expiresAt.getTime() <= (dependencies.now ?? (() => new Date()))().getTime()
    || !session.user.isActive || session.user.deleteScheduledAt || session.user.id !== session.userId || !(dependencies.superAdmin ?? isSuperAdminEmail)(session.user.email)) {
    return ProjectTestDebugAuthorizationResponseSchema.parse({ schemaVersion: "2.0", authorized: false });
  }
  return ProjectTestDebugAuthorizationResponseSchema.parse({ schemaVersion: "2.0", authorized: true, operatorSubject: session.user.id, decisionCode: "OPERATOR_AUTHORIZED" });
}
