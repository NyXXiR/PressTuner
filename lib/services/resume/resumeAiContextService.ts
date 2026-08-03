import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import { parseResumeBrief } from "@/lib/services/resume/resumeBrief";

export type ResumeAiContext = {
  viewer: {
    userId: string;
    teamId: string;
  };
  application: {
    id: string;
    companyName: string;
    jobTitle: string;
    jdText: string;
    questionCount: number;
    questions: Array<{
      id: string;
      order: number;
      questionText: string;
      charLimit: number | null;
      hasAnswer: boolean;
      selectedBrickCount: number;
    }>;
  };
  currentQuestion: null | {
    id: string;
    order: number;
    questionText: string;
    charLimit: number | null;
    answer: string;
    aiAdvice: string | null;
    selectedBricks: Array<{
      id: string;
      title: string;
      content: string;
      originalText: string | null;
      tags: string[];
    }>;
  };
  conversation: {
    recentMessages: Array<{
      role: "user" | "assistant";
      body: string;
    }>;
    selectedFeedbackNotes: Array<{
      quote: string;
      note: string;
      type?: string;
    }>;
  };
};

function throwErr(code: string, status: number, message?: string): never {
  throw new ServiceError(code, status, message);
}

export async function buildResumeAiContext(input: {
  userId: string;
  teamId: string;
  applicationId: string;
  questionId?: string;
  selectedFeedbackNotes?: Array<{
    quote: string;
    note: string;
    type?: string;
  }>;
  recentMessages?: Array<{
    role: "user" | "assistant";
    body: string;
  }>;
}): Promise<ResumeAiContext> {
  const app = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: {
          relatedBricks: {
            where: {
              brick: {
                userId: input.userId,
                memoryStatus: "CONFIRMED",
              },
            },
            include: {
              brick: {
                include: {
                  careerFacts: {
                    where: {
                      userId: input.userId,
                      active: true,
                      trustStatus: "TRUSTED",
                    },
                    select: {
                      fieldPath: true,
                      value: true,
                    },
                    orderBy: [{ fieldPath: "asc" }, { id: "asc" }],
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!app) {
    throwErr("APPLICATION_NOT_FOUND", 404, "Application not found");
  }

  if (app.userId !== input.userId) {
    throwErr("FORBIDDEN", 403, "Unauthorized");
  }

  if (app.teamId && app.teamId !== input.teamId) {
    throwErr("FORBIDDEN", 403, "Team access denied");
  }

  const currentQuestion =
    app.questions.find((question) => question.id === input.questionId) ?? null;
  const parsedBrief = parseResumeBrief(app.jdText);

  return {
    viewer: {
      userId: input.userId,
      teamId: input.teamId,
    },
    application: {
      id: app.id,
      companyName: app.companyName,
      jobTitle: app.jobTitle,
      jdText: parsedBrief.summary,
      questionCount: app.questions.length,
      questions: app.questions.map((question) => ({
        id: question.id,
        order: question.order,
        questionText: question.questionText,
        charLimit: question.charLimit,
        hasAnswer: !!question.answer?.trim(),
        selectedBrickCount: question.relatedBricks.filter(
          (link) => link.isSelected && link.brick.careerFacts.length > 0,
        ).length,
      })),
    },
    currentQuestion: currentQuestion
      ? {
          id: currentQuestion.id,
          order: currentQuestion.order,
          questionText: currentQuestion.questionText,
          charLimit: currentQuestion.charLimit,
          answer: currentQuestion.answer ?? "",
          aiAdvice: currentQuestion.aiAdvice,
          selectedBricks: currentQuestion.relatedBricks
            .filter(
              (link) => link.isSelected && link.brick.careerFacts.length > 0,
            )
            .map((link) => ({
              id: link.brick.id,
              title: "Trusted career facts",
              content: link.brick.careerFacts
                .map((fact) => `${fact.fieldPath}: ${fact.value}`)
                .join("\n"),
              originalText: null,
              tags: link.brick.careerFacts
                .filter((fact) => fact.fieldPath.startsWith("tags["))
                .map((fact) => fact.value),
            })),
        }
      : null,
    conversation: {
      recentMessages: input.recentMessages ?? [],
      selectedFeedbackNotes: input.selectedFeedbackNotes ?? [],
    },
  };
}
