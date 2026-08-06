import { pressCreationProcess } from "./processRegistry";

export type GuardrailVerdict = "PASS" | "WARN" | "BLOCK";
export type GuardrailObservation = Readonly<{ guardrailId: string; origin: "MANDATORY" | "CASE_EXPECTATION"; expected: string; observed: string; reason: string; evidence: unknown; verdict: GuardrailVerdict; displayOrder: number }>;
export type CaseExpectation = Readonly<{ id: string; field: "contains" | "notContains"; value: string; verdict?: "WARN" | "BLOCK" }>;

const criticalTokenPattern = /\b\d+(?:[.,]\d+)?(?:%|분|곳|명|원|년|월|일)?\b|[“\"'][^”\"']+[”\"']/g;
const stringValue = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value ?? "");
function observation(id: string, verdict: GuardrailVerdict, expected: string, observed: string, reason: string, evidence: unknown, displayOrder: number, origin: GuardrailObservation["origin"] = "MANDATORY"): GuardrailObservation { return { guardrailId: id, origin, expected, observed, reason, evidence, verdict, displayOrder }; }

export function rollUpGuardrailVerdict(items: readonly Pick<GuardrailObservation, "verdict">[]): GuardrailVerdict { return items.some((item) => item.verdict === "BLOCK") ? "BLOCK" : items.some((item) => item.verdict === "WARN") ? "WARN" : "PASS"; }

export function evaluatePressTransitionGuardrails(args: { edgeId: string; sourceInput: unknown; sourceOutput: unknown; targetPayload: unknown; attempt: { teamId: string; articleId: string }; article?: { id: string; teamId: string | null; type: string; createdAt?: Date }; expectations?: readonly CaseExpectation[] }): { verdict: GuardrailVerdict; observations: GuardrailObservation[] } {
  const edge = pressCreationProcess.edges.find((item) => item.id === args.edgeId);
  if (!edge) throw new Error("PRESS_AI_PROCESS_EDGE_INVALID");
  const source = stringValue(args.sourceInput); const output = stringValue(args.sourceOutput); const target = stringValue(args.targetPayload);
  const observations: GuardrailObservation[] = [];
  edge.mandatoryGuardrailIds.forEach((id, index) => {
    let verdict: GuardrailVerdict = "PASS"; let reason = "필수 조건을 충족했습니다."; let expected = id; let observed = "satisfied"; let evidence: unknown = { edgeId: edge.id };
    if (id === "article-team-ownership" || id === "fresh-press-release") {
      const valid = args.article?.id === args.attempt.articleId && args.article.teamId === args.attempt.teamId && args.article.type === "PRESS_RELEASE";
      verdict = valid ? "PASS" : "BLOCK"; expected = "attempt team 소유의 새 PRESS_RELEASE Article"; observed = args.article ? `${args.article.teamId}/${args.article.type}` : "missing"; reason = valid ? reason : "Article 소유권 또는 유형이 시도와 일치하지 않습니다."; evidence = args.article ?? null;
    } else if (id.includes("grounding") || id.includes("preservation")) {
      const tokens = [...new Set(source.match(criticalTokenPattern) ?? [])]; const missing = tokens.filter((token) => !output.includes(token));
      verdict = missing.length ? (id.includes("critical") && missing.length === tokens.length ? "BLOCK" : "WARN") : "PASS"; expected = "입력의 수치·날짜·인용·제한 보존"; observed = missing.length ? `누락: ${missing.join(", ")}` : "critical facts preserved"; reason = missing.length ? "입력의 중요 토큰 일부가 출력에서 확인되지 않습니다." : reason; evidence = { checked: tokens, missing };
    } else if (id === "press-structure") {
      const value = args.sourceOutput as Record<string, unknown>; const valid = Boolean(value && typeof value.title === "string" && value.title.trim() && target.includes("plain") && /\S/.test(target));
      verdict = valid ? "PASS" : "WARN"; expected = "비어 있지 않은 제목과 본문 구조"; observed = valid ? "title/plain present" : "title 또는 plain 부족"; reason = valid ? reason : "복구 가능한 보도자료 구조 결함입니다."; evidence = { title: value?.title ?? null };
    } else if (id === "review-note-selection") {
      const selected = (args.targetPayload as Record<string, unknown>)?.selectedNoteIds; const ids = Array.isArray(selected) ? selected.filter((item): item is string => typeof item === "string") : []; const notes = (args.sourceOutput as Record<string, unknown>)?.notes; const available = new Set(Array.isArray(notes) ? notes.map((item) => (item as { id?: unknown })?.id).filter((item): item is string => typeof item === "string") : []); const valid = ids.length > 0 && ids.length === new Set(ids).size && ids.every((item) => available.has(item));
      verdict = valid ? "PASS" : "BLOCK"; expected = "저장된 리뷰 출력에 존재하는 고유 노트 ID"; observed = ids.join(", ") || "none"; reason = valid ? reason : "선택이 비었거나 오래되었거나 중복되었습니다."; evidence = { selected: ids, available: [...available] };
    } else if (id === "rewrite-instruction-bounds") {
      const instruction = (args.targetPayload as Record<string, unknown>)?.userInstruction; const valid = typeof instruction === "string" && instruction.trim().length > 0 && instruction.length <= 1000; verdict = valid ? "PASS" : "BLOCK"; expected = "1..1000자 수정 지침"; observed = typeof instruction === "string" ? `${instruction.length} chars` : "missing"; reason = valid ? reason : "수정 지침 범위를 벗어났습니다."; evidence = { length: typeof instruction === "string" ? instruction.length : null };
    } else if (id === "review-checkpoint-lineage") {
      const valid = edge.source === "draft-review"; verdict = valid ? "PASS" : "BLOCK"; expected = "동일 리뷰 체크포인트에서 파생"; observed = edge.source; reason = valid ? reason : "리뷰 체크포인트 계보가 일치하지 않습니다.";
    }
    observations.push(observation(id, verdict, expected, observed, reason, evidence, index));
  });
  [...(args.expectations ?? [])].sort((a, b) => a.id.localeCompare(b.id)).forEach((item, index) => { const haystack = `${output}\n${target}`; const pass = item.field === "contains" ? haystack.includes(item.value) : !haystack.includes(item.value); observations.push(observation(item.id, pass ? "PASS" : item.verdict ?? "WARN", `${item.field} ${item.value}`, pass ? "matched" : "not matched", pass ? "케이스 기대값을 충족했습니다." : "케이스 기대값을 충족하지 못했습니다.", { value: item.value }, edge.mandatoryGuardrailIds.length + index, "CASE_EXPECTATION")); });
  return { verdict: rollUpGuardrailVerdict(observations), observations };
}
