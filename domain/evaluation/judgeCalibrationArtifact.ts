import { createHash } from "node:crypto";

import { buildJudgeCalibration } from "./controlledLiveEvaluation";

export const PRESS_RAG_JUDGE_CALIBRATION_GATE = Object.freeze({
  minimumLabels: 30,
  minimumSupported: 10,
  minimumUnsupportedOrContradictory: 10,
  minimumAgreement: 0.8,
  maximumFalseSupportedRate: 0.1,
});

export type JudgeCalibrationRecord = Readonly<{
  claimId: string;
  blinded: true;
  humanLabel: "SUPPORTED" | "UNSUPPORTED" | "CONTRADICTORY";
  judgeLabel: "SUPPORTED" | "UNSUPPORTED" | "CONTRADICTORY";
  rawJudgment: unknown;
  rationale: string;
  reviewer: Readonly<{ type: "HUMAN"; id: string }>;
  costMicros: number;
}>;

export function buildJudgeCalibrationArtifact(input: Readonly<{
  model: string;
  temperature: 0;
  prompt: string;
  schema: unknown;
  records: readonly JudgeCalibrationRecord[];
}>) {
  if (!input.model.trim()) throw new Error("JUDGE_CALIBRATION_MODEL_REQUIRED");
  const ids = input.records.map(({ claimId }) => claimId);
  if (new Set(ids).size !== ids.length) throw new Error("JUDGE_CALIBRATION_DUPLICATE_CLAIM");
  if (
    input.records.some(
      (record) =>
        record.blinded !== true ||
        record.reviewer.type !== "HUMAN" ||
        !record.reviewer.id.trim() ||
        !record.rationale.trim() ||
        !Number.isFinite(record.costMicros) ||
        record.costMicros < 0,
    )
  ) {
    throw new Error("JUDGE_CALIBRATION_HUMAN_PROVENANCE_REQUIRED");
  }
  const supportedCount = input.records.filter(({ humanLabel }) => humanLabel === "SUPPORTED").length;
  const unsupportedOrContradictoryCount = input.records.length - supportedCount;
  const calibration = buildJudgeCalibration({
    labels: input.records.map((record) => ({
      id: record.claimId,
      human: record.humanLabel === "SUPPORTED",
      judge: record.judgeLabel === "SUPPORTED",
    })),
    minimumLabels: PRESS_RAG_JUDGE_CALIBRATION_GATE.minimumLabels,
    minimumAgreement: PRESS_RAG_JUDGE_CALIBRATION_GATE.minimumAgreement,
  });
  const insufficiencyReasons = [
    ...(supportedCount < PRESS_RAG_JUDGE_CALIBRATION_GATE.minimumSupported
      ? ["INSUFFICIENT_SUPPORTED_LABELS" as const]
      : []),
    ...(unsupportedOrContradictoryCount < PRESS_RAG_JUDGE_CALIBRATION_GATE.minimumUnsupportedOrContradictory
      ? ["INSUFFICIENT_UNSUPPORTED_LABELS" as const]
      : []),
    ...(calibration.status !== "CALIBRATED"
      ? calibration.insufficiencyReasons
      : []),
    ...(calibration.falsePositiveRate > PRESS_RAG_JUDGE_CALIBRATION_GATE.maximumFalseSupportedRate
      ? ["FALSE_SUPPORTED_RATE_ABOVE_GATE" as const]
      : []),
  ];
  return Object.freeze({
    version: "press-rag-semantic-judge-calibration/v1" as const,
    model: input.model,
    temperature: input.temperature,
    promptHash: createHash("sha256").update(input.prompt).digest("hex"),
    schemaHash: createHash("sha256").update(JSON.stringify(input.schema)).digest("hex"),
    reviewerIds: [...new Set(input.records.map(({ reviewer }) => reviewer.id))].sort(),
    records: input.records,
    supportedCount,
    unsupportedOrContradictoryCount,
    confusionMatrix: calibration.confusion,
    agreement: calibration.agreement,
    falseSupportedRate: calibration.falsePositiveRate,
    totalCostMicros: input.records.reduce((sum, record) => sum + record.costMicros, 0),
    gate: PRESS_RAG_JUDGE_CALIBRATION_GATE,
    status: insufficiencyReasons.length === 0 ? ("PASS" as const) : ("FAIL" as const),
    insufficiencyReasons,
  });
}

export type JudgeCalibrationArtifact = ReturnType<typeof buildJudgeCalibrationArtifact>;
