export const BLOCKING_RISK_CATEGORIES = [
  "NUMBER",
  "PERIOD",
  "DATE",
  "PERSON",
  "TITLE",
  "DIRECT_QUOTE",
] as const;

export type VerificationRiskCategory =
  | (typeof BLOCKING_RISK_CATEGORIES)[number]
  | "OTHER";
export type VerificationResult = "PASS" | "WARN" | "BLOCK";
export type VerificationFindingKind =
  | "CONTRADICTION"
  | "UNSUPPORTED"
  | "OMISSION"
  | "STYLE_POLICY";

export function classifyVerificationFinding(args: {
  kind: VerificationFindingKind;
  riskCategory: VerificationRiskCategory;
  factOrigin?: "RAG" | "USER" | null;
  hasRagEvidence: boolean;
  verifierResult?: "PASS" | "WARN";
}): VerificationResult {
  if (
    args.kind === "CONTRADICTION" &&
    args.factOrigin === "RAG" &&
    args.hasRagEvidence &&
    BLOCKING_RISK_CATEGORIES.includes(
      args.riskCategory as (typeof BLOCKING_RISK_CATEGORIES)[number],
    )
  ) {
    return "BLOCK";
  }
  if (args.kind === "STYLE_POLICY") return "WARN";
  if (args.kind === "OMISSION") return "WARN";
  if (
    args.kind === "UNSUPPORTED" &&
    args.factOrigin === "USER" &&
    args.riskCategory !== "OTHER"
  ) {
    return "WARN";
  }
  return args.verifierResult ?? "WARN";
}

export function aggregateVerificationResult(
  findings: readonly VerificationResult[],
): VerificationResult {
  if (findings.includes("BLOCK")) return "BLOCK";
  if (findings.includes("WARN")) return "WARN";
  return "PASS";
}

export function isVerificationCurrent(
  verification: {
    draftHash: string;
    groundingRevision: number;
    corpusVersion: number;
  },
  current: {
    draftHash: string;
    groundingRevision: number;
    corpusVersion: number;
  },
): boolean {
  return (
    verification.draftHash === current.draftHash &&
    verification.groundingRevision === current.groundingRevision &&
    verification.corpusVersion === current.corpusVersion
  );
}
