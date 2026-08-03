import { prisma } from "@/lib/prisma";
import { compileStyleGuide, type CompileMode, getOrCreateTeamGuide } from "@/lib/styleCompiler";
import { serviceError } from "@/lib/services/serviceError";

export async function compileGuideForUser(input: {
  guideId: string;
  userId: string;
  mode: CompileMode;
}) {
  const guide = await prisma.styleGuide.findUnique({
    where: { id: input.guideId },
    select: { id: true, teamId: true, isCompiling: true },
  });

  if (!guide) {
    throw serviceError(404, "NOT_FOUND", "가이드를 찾을 수 없습니다.");
  }

  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: guide.teamId, userId: input.userId } },
    select: { role: true },
  });

  if (!member) {
    throw serviceError(403, "FORBIDDEN", "권한이 없습니다.");
  }

  if (guide.isCompiling) {
    throw serviceError(409, "ALREADY_COMPILING", "이미 컴파일 중입니다.", {
      details: { skipped: true },
    });
  }

  return compileStyleGuide(input.guideId, input.mode);
}

export async function compileGuideByIdForMember(input: {
  guideId: string;
  userId: string;
  mode: CompileMode;
}) {
  const guide = await prisma.styleGuide.findUnique({
    where: { id: input.guideId },
    select: { id: true, teamId: true },
  });
  if (!guide) {
    throw serviceError(404, "NOT_FOUND", "NOT_FOUND");
  }

  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: guide.teamId, userId: input.userId } },
    select: { role: true },
  });
  if (!member) {
    throw serviceError(403, "FORBIDDEN", "FORBIDDEN");
  }

  await compileStyleGuide(input.guideId, input.mode);
  return { ok: true, mode: input.mode };
}

export async function getCompiledGuideForTeam(teamId: string) {
  const guide = await getOrCreateTeamGuide(teamId);
  const compiled = await prisma.guideCompiled.findUnique({
    where: { guideId: guide.id },
    select: { rulesJson: true, version: true, updatedAt: true },
  });

  return {
    rules: compiled?.rulesJson ?? {},
    version: compiled?.version ?? 0,
    updatedAt: compiled?.updatedAt ?? null,
  };
}

export async function updateCompiledGuideForTeam(teamId: string, rules: any) {
  const guide = await getOrCreateTeamGuide(teamId);
  const currentCompiled = await prisma.guideCompiled.findUnique({
    where: { guideId: guide.id },
    select: { version: true },
  });

  const nextVersion = (currentCompiled?.version ?? 0) + 1;

  const updated = await prisma.guideCompiled.upsert({
    where: { guideId: guide.id },
    create: {
      guideId: guide.id,
      rulesJson: rules,
      version: 1,
    },
    update: {
      rulesJson: rules,
      version: nextVersion,
      updatedAt: new Date(),
    },
  });

  return {
    version: updated.version,
    updatedAt: updated.updatedAt,
  };
}

export async function getActiveGuideForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { include: { team: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!user || user.memberships.length === 0) {
    throw serviceError(401, "NO_TEAM", "팀에 속해있지 않습니다.");
  }

  const teamId = user.memberships[0].team.id;
  let guide = await prisma.styleGuide.findFirst({
    where: { teamId, isDefault: true, isArchived: false },
    include: { compiled: true },
  });
  if (!guide) {
    guide = await prisma.styleGuide.create({
      data: {
        teamId,
        name: "기본 가이드",
        description: "",
        isDefault: true,
        isArchived: false,
        basePrompt: "",
        config: {},
      },
      include: { compiled: true },
    });
  }

  return {
    id: guide.id,
    name: guide.name,
    compiled: guide.compiled?.rulesJson ?? {
      vocabulary: [],
      banList: [],
      tone: [],
    },
    version: guide.compiled?.version ?? 1,
  };
}
