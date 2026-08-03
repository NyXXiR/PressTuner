import OpenAI from "openai";
import { CareerGroundingOperation } from "@prisma/client";
import { z } from "zod";

import { buildTrustedCareerGenerationContext as serializeTrustedCareerContext } from "@/domain/career-memory/careerTrustedGeneration";
import {
  collectGroundableCareerFactIds,
  validateGroundingSelection,
} from "@/domain/career-memory/retrievalPolicy";
import { AI_MODELS } from "@/lib/constants/ai";
import { consumeTeamQuota } from "@/lib/services/usageService";
import { serviceError } from "@/lib/services/serviceError";
import {
  getCareerGrounding,
  persistCareerGrounding,
} from "./careerGroundingService";
import {
  CAREER_RETRIEVAL_VERSION,
  retrieveCareerMemory,
} from "./careerRetrievalService";
import { getCareerMemoryReadiness } from "./careerMemoryReadinessService";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GroundedAnswerSchema = z.object({
  answer: z.string().trim().min(1),
  usedExperienceIds: z.array(z.string()),
  usedFactIds: z.array(z.string()),
});

export function buildTrustedCareerGenerationContext(
  memory: Awaited<ReturnType<typeof retrieveCareerMemory>>,
) {
  return serializeTrustedCareerContext(memory);
}

export async function writeGroundedCareerAnswer(input: {
  questionId: string;
  userId: string;
  teamId: string;
  operation: CareerGroundingOperation;
  instruction?: string;
  currentAnswer?: string;
  charLimit?: number;
}) {
  const memory = await retrieveCareerMemory({
    questionId: input.questionId,
    userId: input.userId,
    instruction: input.instruction,
  });
  if (memory.facts.length === 0) {
    const memoryReadiness = await getCareerMemoryReadiness(input.userId);
    throw serviceError(
      422,
      "CAREER_MEMORY_NOT_INDEXED",
      "No confirmed indexed career memory is available yet",
      { memoryReadiness, manualWritingAllowed: true },
    );
  }
  await consumeTeamQuota({
    teamId: input.teamId,
    userId: input.userId,
    targetId: input.questionId,
    type: "RESUME",
    action:
      input.operation === CareerGroundingOperation.GENERATE
        ? "resume_generate"
        : "resume_repolish",
  });
  const model = AI_MODELS.RESUME_REPOLISH;
  const retrievedExperienceIds = memory.experiences.map((item) => item.id);
  const retrievedFactIds = collectGroundableCareerFactIds(memory);
  let parsed: z.infer<typeof GroundedAnswerSchema> | null = null;
  let retryInstruction = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: [
            "Write a Korean cover-letter answer using only the supplied trusted career facts.",
            "Do not invent numbers, dates, organizations, or titles.",
            "Return JSON with answer, usedExperienceIds, and usedFactIds.",
            "Copy every used ID exactly from the explicit allowed ID lists.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            memory.query,
            input.currentAnswer ? `Current answer:\n${input.currentAnswer}` : "",
            `Target length: ${input.charLimit ?? memory.question.charLimit ?? 1000}`,
            `Allowed experience IDs: ${JSON.stringify(retrievedExperienceIds)}`,
            `Allowed fact IDs: ${JSON.stringify(retrievedFactIds)}`,
            `Trusted memory:\n${buildTrustedCareerGenerationContext(memory)}`,
            retryInstruction,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    const raw = completion.choices[0]?.message.content;
    try {
      const candidate = GroundedAnswerSchema.parse(JSON.parse(raw ?? ""));
      validateGroundingSelection({
        usedExperienceIds: candidate.usedExperienceIds,
        usedFactIds: candidate.usedFactIds,
        retrievedExperienceIds,
        retrievedFactIds,
      });
      parsed = candidate;
      break;
    } catch (error) {
      retryInstruction = [
        "The previous JSON was invalid.",
        "Return corrected JSON and use only IDs copied exactly from the allowed lists.",
        `Validation error: ${error instanceof Error ? error.message : "unknown"}`,
      ].join("\n");
    }
  }
  if (!parsed) {
    throw serviceError(
      502,
      "CAREER_GROUNDED_OUTPUT_INVALID",
      "Grounded output was invalid after a bounded retry",
    );
  }
  const grounding = await persistCareerGrounding({
    questionId: input.questionId,
    userId: input.userId,
    operation: input.operation,
    answer: parsed.answer,
    query: memory.query,
    modelVersion: model,
    retrievalVersion: CAREER_RETRIEVAL_VERSION,
    usedExperienceIds: parsed.usedExperienceIds,
    usedFactIds: parsed.usedFactIds,
    preferredExperienceIds: memory.preferredExperienceIds,
    retrievedExperienceIds,
    retrievedFactIds,
    memoryVersion: memory.memoryVersion,
  });
  const presentedGrounding = await getCareerGrounding({
    questionId: input.questionId,
    userId: input.userId,
    answer: parsed.answer,
  });
  return {
    text: parsed.answer,
    grounding:
      presentedGrounding ?? {
        id: grounding.id,
        experienceIds: grounding.experiences.map((item) => item.experienceId),
        factIds: grounding.facts.map((item) => item.factId),
        experiences: [],
        facts: [],
        preferredExperienceIds: memory.preferredExperienceIds,
        retrievedExperienceIds,
        usedExperienceIds: grounding.experiences.map(
          (item) => item.experienceId,
        ),
        usedFactIds: grounding.facts.map((item) => item.factId),
        fallbackUsed: parsed.usedExperienceIds.some(
          (id) => !memory.preferredExperienceIds.includes(id),
        ),
        memoryVersion: memory.memoryVersion,
        retrievalVersion: CAREER_RETRIEVAL_VERSION,
      },
  };
}
