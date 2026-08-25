import { z } from "zod";
import { canonicalJson, sha256Text } from "../v1/canonicalJson";
import type { ArtifactReferenceV1 } from "../v1/contracts";

export const SyntheticFixtureV2Schema = z.strictObject({
  schemaVersion: z.literal("2.0"), fixtureId: z.string().min(1).max(128), processId: z.literal("press-creation"), processVersion: z.literal("3.0.0"),
  scenario: z.enum(["SUCCESS", "QUALITY_BLOCK", "TRANSITION_WARN", "TRANSITION_BLOCK"]), memoText: z.string().min(1).max(12_000), normalizedBriefText: z.string().min(1).max(12_000).optional(), tone: z.enum(["formal", "neutral", "friendly"]),
  reviewInstruction: z.string().max(1_000), rewriteInstruction: z.string().min(1).max(1_000), selectedNoteIds: z.array(z.string().min(1).max(128)).min(1).max(100),
});
export type SyntheticFixtureV2 = Readonly<z.infer<typeof SyntheticFixtureV2Schema>>;

export const syntheticFixturesV2 = Object.freeze([
  { schemaVersion: "2.0", fixtureId: "success-v2", processId: "press-creation", processVersion: "3.0.0", scenario: "SUCCESS", memoText: "가상 서비스 알파가 2030년 1월 공개된다. 모든 이름과 수치는 합성 데이터다.", tone: "formal", reviewInstruction: "명료성을 확인한다.", rewriteInstruction: "선택한 합성 제안만 반영한다.", selectedNoteIds: ["note_synthetic-session_0"] },
  { schemaVersion: "2.0", fixtureId: "final-quality-block-v2", processId: "press-creation", processVersion: "3.0.0", scenario: "QUALITY_BLOCK", memoText: "가상 서비스 델타의 완성본 품질 결함을 재현하는 합성 메모다.", tone: "neutral", reviewInstruction: "완성본 품질을 확인한다.", rewriteInstruction: "빈 완성본 결함을 재현한다.", selectedNoteIds: ["note_synthetic-session_0"] },
  { schemaVersion: "2.0", fixtureId: "brief-draft-warn-v2", processId: "press-creation", processVersion: "3.0.0", scenario: "TRANSITION_WARN", memoText: "가상 서비스 베타는 2030년 공개된다. 제공 지역 수는 12곳.", normalizedBriefText: "가상 서비스 베타는 2030년 공개된다.", tone: "neutral", reviewInstruction: "브리프의 경고를 확인한다.", rewriteInstruction: "선택한 합성 제안만 반영한다.", selectedNoteIds: ["note_synthetic-session_0"] },
  { schemaVersion: "2.0", fixtureId: "brief-draft-block-v2", processId: "press-creation", processVersion: "3.0.0", scenario: "TRANSITION_BLOCK", memoText: "가상 서비스 감마는 2042년 공개되며 9곳에 제공된다.", normalizedBriefText: "가상 서비스 감마 공개를 준비한다.", tone: "neutral", reviewInstruction: "브리프의 차단을 확인한다.", rewriteInstruction: "선택한 합성 제안만 반영한다.", selectedNoteIds: ["note_synthetic-session_0"] },
].map((fixture) => Object.freeze(SyntheticFixtureV2Schema.parse(fixture))));

const reference = (fixture: SyntheticFixtureV2): ArtifactReferenceV1 => {
  const content = canonicalJson(fixture);
  return { artifactId: `presstuner-fixture-${fixture.fixtureId}`, schemaVersion: "2.0", sha256: sha256Text(content), mediaType: "application/json", sizeBytes: Buffer.byteLength(content), locator: `ref:fixtures/presstuner/press-creation/3.0.0/${fixture.fixtureId}` };
};
export const fixtureRegistryV2 = Object.freeze(syntheticFixturesV2.map((fixture) => Object.freeze({ fixture, artifact: Object.freeze(reference(fixture)) })));
export function resolveSyntheticFixtureV2(reference: ArtifactReferenceV1): SyntheticFixtureV2 | null {
  const match = fixtureRegistryV2.find(({ artifact }) => artifact.artifactId === reference.artifactId && artifact.locator === reference.locator);
  return match && canonicalJson(match.artifact) === canonicalJson(reference) ? match.fixture : null;
}
