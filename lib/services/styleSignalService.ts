import { Prisma, SignalSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { compileStyleGuide, getOrCreateTeamGuide } from "@/lib/styleCompiler";
import { serviceError } from "@/lib/services/serviceError";

// Signal count threshold for fast compile trigger.
const FAST_COMPILE_THRESHOLD = 5;

function extractBodyText(json: Prisma.JsonValue | null | undefined): string {
  if (!json || typeof json !== "object") return "";
  const body = json as { paragraphs?: Array<{ text?: string | null }> };
  return (body.paragraphs || []).map((p) => p.text ?? "").join("\n");
}

function getDiff(oldText?: string | null, newText?: string | null) {
  const v1 = (oldText || "").trim();
  const v2 = (newText || "").trim();
  if (v1 === v2) return null;
  return { from: v1, to: v2 };
}

export async function createStyleSignal(
  tx: Prisma.TransactionClient,
  params: {
    teamId: string;
    articleId: string;
    guideId?: string | null;
    source: SignalSource;
    payload?: Prisma.InputJsonValue | null;
    weight?: number;
  },
) {
  const { teamId, articleId, source, payload, weight = 1.0 } = params;

  // 1. Resolve guide id
  let targetGuideId = params.guideId ?? null;
  if (!targetGuideId) {
    const defaultGuide = await tx.styleGuide.findFirst({
      where: { teamId, isDefault: true, isArchived: false },
      select: { id: true },
    });
    targetGuideId = defaultGuide?.id ?? null;
  }

  if (!targetGuideId) {
    return { signal: null, triggerGuideId: null };
  }

  // 2. Save signal
  const signal = await tx.styleSignal.create({
    data: {
      guideId: targetGuideId,
      articleId,
      source,
      weight,
      payload: (payload ?? {}) as Prisma.InputJsonValue,
    },
  });

  // 3. Increment pending count
  const updatedGuide = await tx.styleGuide.update({
    where: { id: targetGuideId },
    data: { pendingSignalCount: { increment: 1 } },
    select: { id: true, pendingSignalCount: true, isCompiling: true },
  });

  // 4. Return trigger guide id if threshold reached
  let triggerGuideId: string | null = null;
  if (
    updatedGuide.pendingSignalCount >= FAST_COMPILE_THRESHOLD &&
    !updatedGuide.isCompiling
  ) {
    triggerGuideId = updatedGuide.id;
  }

  return { signal, triggerGuideId };
}

export async function recordManualEditSignal(
  tx: Prisma.TransactionClient,
  args: {
    teamId: string;
    articleId: string;
    guideId?: string | null;
    oldData: {
      title?: string | null;
      bodyJson?: Prisma.JsonValue | null;
      pressExtra?: { lead?: string | null } | null;
    };
    newData: {
      title?: string | null;
      bodyJson?: Prisma.JsonValue | null;
      pressExtra?: { lead?: string | null } | null;
    };
  },
) {
  const { oldData, newData } = args;
  const diffs: Array<{ field: string; from: string; to: string }> = [];

  if (newData.title !== undefined) {
    const d = getDiff(oldData.title, newData.title);
    if (d) diffs.push({ field: "title", ...d });
  }

  if (oldData.pressExtra || newData.pressExtra) {
    const oldLead = oldData.pressExtra?.lead ?? null;
    const newLead = newData.pressExtra?.lead ?? null;
    if (newData.pressExtra !== undefined) {
      const d = getDiff(oldLead, newLead);
      if (d) diffs.push({ field: "lead", ...d });
    }
  }

  if (newData.bodyJson !== undefined) {
    const oldBody = extractBodyText(oldData.bodyJson);
    const newBody = extractBodyText(newData.bodyJson);
    const d = getDiff(oldBody, newBody);
    if (d) diffs.push({ field: "body", ...d });
  }

  if (diffs.length === 0) return null;

  return createStyleSignal(tx, {
    teamId: args.teamId,
    articleId: args.articleId,
    guideId: args.guideId ?? null,
    source: SignalSource.MANUAL_EDIT,
    weight: 1.0,
    payload: {
      kind: "manual_edit_diff",
      diffs,
    },
  });
}

export async function createStyleSignalFromArticle(input: {
  articleId: string;
  userId: string;
  source: SignalSource;
  payload?: unknown;
  weight?: number;
}) {
  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true, teamId: true, userId: true },
  });
  if (!article) {
    throw serviceError(404, "NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  let allowed = false;
  if (article.teamId) {
    const mem = await prisma.teamMember.findFirst({
      where: { teamId: article.teamId, userId: input.userId },
      select: { userId: true },
    });
    allowed = !!mem;
  } else {
    allowed = article.userId === input.userId;
  }
  if (!allowed) {
    throw serviceError(403, "FORBIDDEN", "권한이 없습니다.");
  }

  if (!article.teamId) {
    throw serviceError(
      400,
      "TEAM_ONLY",
      "팀 문서에서만 신호를 적재할 수 있습니다."
    );
  }

  const guide = await getOrCreateTeamGuide(article.teamId);

  await prisma.styleSignal.create({
    data: {
      guideId: guide.id,
      articleId: article.id,
      source: input.source,
      weight: typeof input.weight === "number" ? input.weight : 1.0,
      payload: input.payload ?? {},
    },
  });

  compileStyleGuide(guide.id, "FAST").catch(() => {});

  return { ok: true };
}
