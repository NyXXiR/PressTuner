import { AI_MODELS, type AiModel } from "@/lib/constants/ai";

export const AI_FEATURE_MODELS = {
  "resume.generate": AI_MODELS.SMART_MINI,
  "resume.polish": AI_MODELS.SMART_MINI,
  "resume.repolish": "gpt-4.1",
  "resume.intake.compose": AI_MODELS.DEFAULT,
  "resume.intake.questions": AI_MODELS.MINI,
  "resume.brick.organize": AI_MODELS.MINI,
  "resume.document.quick-fill": AI_MODELS.SMART_MINI,
} as const satisfies Record<string, AiModel>;

export type AiFeature = keyof typeof AI_FEATURE_MODELS;

export function resolveModel(feature: AiFeature): AiModel {
  return AI_FEATURE_MODELS[feature];
}
