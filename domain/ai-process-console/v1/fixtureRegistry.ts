import type { ArtifactReferenceV1 } from "./contracts";
import { canonicalJson } from "./canonicalJson";
import { sha256Text } from "./canonicalJson";
import { z } from "zod";

export const SyntheticFixtureSchema = z.strictObject({
  schemaVersion: z.literal("1.0"), fixtureId: z.string().min(1).max(128), processId: z.literal("press-creation"), processVersion: z.literal("2.1.0"),
  scenario: z.enum(["SUCCESS", "GUARDRAIL_BLOCK", "NODE_FAILURE"]), memoText: z.string().min(1).max(12_000), tone: z.enum(["formal", "neutral", "friendly"]),
  reviewInstruction: z.string().max(1_000), rewriteInstruction: z.string().min(1).max(1_000), selectedNoteIds: z.array(z.string().min(1).max(128)).max(100), failureNodeId: z.string().min(1).max(128).optional(),
}).superRefine((fixture, context) => {
  if (fixture.scenario === "NODE_FAILURE" && !fixture.failureNodeId) context.addIssue({ code: "custom", message: "NODE_FAILURE requires failureNodeId", path: ["failureNodeId"] });
  if (fixture.scenario !== "NODE_FAILURE" && fixture.failureNodeId) context.addIssue({ code: "custom", message: "Only NODE_FAILURE may set failureNodeId", path: ["failureNodeId"] });
});

export type SyntheticFixture = Readonly<z.infer<typeof SyntheticFixtureSchema>>;

export const syntheticFixtures = Object.freeze([
  Object.freeze({ schemaVersion: "1.0", fixtureId: "success-v1", processId: "press-creation", processVersion: "2.1.0", scenario: "SUCCESS", memoText: "가상 서비스 알파가 2030년 1월 공개된다. 모든 이름과 수치는 합성 데이터다.", tone: "formal", reviewInstruction: "명료성을 확인한다.", rewriteInstruction: "선택한 합성 제안만 반영한다.", selectedNoteIds: ["note_synthetic-session_0"] }),
  Object.freeze({ schemaVersion: "1.0", fixtureId: "guardrail-block-v1", processId: "press-creation", processVersion: "2.1.0", scenario: "GUARDRAIL_BLOCK", memoText: "가상 서비스 베타는 2042년 9월 공개되는 합성 서비스다.", tone: "neutral", reviewInstruction: "근거 불일치를 재현한다.", rewriteInstruction: "사용되지 않는다.", selectedNoteIds: ["note_synthetic-session_0"] }),
  Object.freeze({ schemaVersion: "1.0", fixtureId: "node-failure-v1", processId: "press-creation", processVersion: "2.1.0", scenario: "NODE_FAILURE", memoText: "가상 서비스 감마의 합성 메모다.", tone: "friendly", reviewInstruction: "결정적 실패를 재현한다.", rewriteInstruction: "사용되지 않는다.", selectedNoteIds: ["note_synthetic-session_0"], failureNodeId: "draft-generation" }),
].map((fixture) => Object.freeze(SyntheticFixtureSchema.parse(fixture))));

export function fixtureArtifactReference(fixture: SyntheticFixture): ArtifactReferenceV1 {
  const bytes = canonicalJson(fixture);
  return {
    artifactId: `presstuner-fixture-${fixture.fixtureId}`,
    schemaVersion: "1.0",
    sha256: sha256Text(bytes),
    mediaType: "application/json",
    sizeBytes: Buffer.byteLength(bytes),
    locator: `ref:fixtures/presstuner/press-creation/2.1.0/${fixture.fixtureId}`,
  };
}

export const fixtureRegistry = Object.freeze(syntheticFixtures.map((fixture) => Object.freeze({ fixture, artifact: Object.freeze(fixtureArtifactReference(fixture)) })));

export function resolveSyntheticFixture(reference: ArtifactReferenceV1): SyntheticFixture | null {
  const match = fixtureRegistry.find(({ artifact }) => artifact.artifactId === reference.artifactId && artifact.locator === reference.locator);
  if (!match || canonicalJson(match.artifact) !== canonicalJson(reference)) return null;
  return match.fixture;
}
