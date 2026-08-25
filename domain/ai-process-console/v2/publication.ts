import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { sha256Canonical } from "../v1/canonicalJson";
import { ProcessDefinitionV2Schema, type ComponentRevisionV2, type ProcessDefinitionV2 } from "./contracts";

export const PRESS_CREATION_V2_VERSION = "3.0.0";
export const PRESS_CREATION_V2_COMPATIBILITY_VERSION = "3.1.0";
export const PRESS_CREATION_V2_CANONICAL_SHA256 = "5d4c1c643439e7d55ebe452e7b7b8d1623a6fc0740fbde5e169940d13f1eff17";

const revision = (componentId: string, version = "1.0.0"): ComponentRevisionV2 => ({
  componentId,
  version,
  sha256: sha256Canonical({ componentId, version }),
});

const requirementLabels: Record<string, string> = {
  "article-team-ownership": "문서 팀 소유권",
  "fresh-press-release": "새 보도자료 문서",
  "memo-brief-grounding": "메모-브리프 근거 일치",
  "critical-fact-preservation": "핵심 사실 보존",
  "brief-draft-grounding": "브리프-초안 근거 일치",
  "press-structure": "보도자료 구조",
  "evidence-fact-consistency": "근거-사실 일관성",
  "review-note-selection": "리뷰 노트 선택",
  "rewrite-instruction-bounds": "수정 지침 범위",
  "review-checkpoint-lineage": "리뷰 체크포인트 계보",
};

export function buildProcessDefinitionV2(): ProcessDefinitionV2 {
  const base = {
    schemaVersion: "2.0" as const,
    processId: pressCreationProcess.id,
    version: PRESS_CREATION_V2_VERSION,
    entryNodeIds: [pressCreationProcess.nodes[0].id],
    nodes: pressCreationProcess.nodes.map((node, index) => ({
      nodeId: node.id,
      label: node.id === "selected-rewrite" ? "선택 수정 및 완성" : node.label,
      kind: index === pressCreationProcess.nodes.length - 1 ? "TERMINAL" as const : node.id === "draft-review" ? "DECISION" as const : "ACTION" as const,
      handler: revision(`presstuner:handler:${node.operationKey}`, PRESS_CREATION_V2_VERSION),
      evidencePolicy: node.id === "draft-generation"
        ? { kind: "EXTERNAL_VERIFICATION" as const, verifier: revision("presstuner:verifier:evidence-fact-consistency") }
        : { kind: "NONE" as const },
    })),
    transitions: pressCreationProcess.edges.map((edge) => ({
      transitionId: edge.id, sourceNodeId: edge.source, targetNodeId: edge.target,
      decision: revision(`presstuner:decision:${edge.id}`, PRESS_CREATION_V2_VERSION), maxTraversalsPerAttempt: 1,
    })),
    requirements: [
      ...pressCreationProcess.edges.flatMap((edge) => edge.mandatoryGuardrailIds.map((requirementId) => ({
        requirementId, version: "1.0.0", label: requirementLabels[requirementId] ?? requirementId,
        evaluator: revision(`presstuner:guardrail:${requirementId}`),
        location: { kind: "TRANSITION" as const, transitionId: edge.id, stageId: edge.source },
        evaluation: { kind: "BOOLEAN" as const },
      }))),
      {
        requirementId: "final-output-quality", version: "1.0.0", label: "완성본 제목·본문 품질",
        description: "완성 노드가 비어 있지 않은 제목과 본문을 생성했는지 검사합니다.",
        evaluator: revision("presstuner:guardrail:final-output-quality"),
        location: { kind: "NODE" as const, nodeId: "selected-rewrite" }, evaluation: { kind: "BOOLEAN" as const },
      },
    ],
  };
  return ProcessDefinitionV2Schema.parse({ ...base, canonicalSha256: sha256Canonical(base) });
}

export function buildProcessDefinitionV2Compatibility(): ProcessDefinitionV2 {
  const version = PRESS_CREATION_V2_COMPATIBILITY_VERSION;
  const base = {
    schemaVersion: "2.0" as const,
    processId: pressCreationProcess.id,
    version,
    entryNodeIds: [pressCreationProcess.nodes[0].id],
    nodes: pressCreationProcess.nodes.map((node, index) => ({
      nodeId: node.id,
      label: node.id === "selected-rewrite" ? "선택 수정 및 완성" : node.label,
      kind: index === pressCreationProcess.nodes.length - 1 ? "TERMINAL" as const : node.id === "draft-review" ? "DECISION" as const : "ACTION" as const,
      handler: revision(`presstuner:handler:${node.operationKey}`, version),
      evidencePolicy: node.id === "draft-generation"
        ? { kind: "EXTERNAL_VERIFICATION" as const, verifier: revision("presstuner:verifier:evidence-fact-consistency") }
        : { kind: "NONE" as const },
    })),
    transitions: pressCreationProcess.edges.map((edge) => ({
      transitionId: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      decision: revision(`presstuner:decision:${edge.id}`, version),
      maxTraversalsPerAttempt: 1,
      ...(edge.id === "brief-draft" ? { testApi: {
        snapshotInspect: true as const,
        isolatedReplay: true as const,
        compatibleDefinitions: [{ processVersion: PRESS_CREATION_V2_VERSION, processDefinitionHash: PRESS_CREATION_V2_CANONICAL_SHA256 }],
      } } : {}),
    })),
    requirements: buildProcessDefinitionV2().requirements,
  };
  return ProcessDefinitionV2Schema.parse({ ...base, canonicalSha256: sha256Canonical(base) });
}

export const componentRevisionForNode = (nodeId: string, version = PRESS_CREATION_V2_VERSION) => {
  const node = pressCreationProcess.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error("PRESS_AI_PROCESS_NODE_INVALID");
  return revision(`presstuner:handler:${node.operationKey}`, version);
};
export const componentRevisionForTransition = (transitionId: string, version = PRESS_CREATION_V2_VERSION) => revision(`presstuner:decision:${transitionId}`, version);
export const componentRevisionForRequirement = (requirementId: string) => revision(`presstuner:guardrail:${requirementId}`);
