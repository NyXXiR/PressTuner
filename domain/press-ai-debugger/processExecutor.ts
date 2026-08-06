import { pressCreationProcess } from "./processRegistry";

type GeneratedArticleLike = { lead?: unknown; fact?: unknown; paragraphs?: unknown; closing?: unknown };

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export function buildGeneratedPlain(value: GeneratedArticleLike) {
  const paragraphs = Array.isArray(value.paragraphs)
    ? value.paragraphs.map((item) => item && typeof item === "object" && "text" in item ? text((item as { text?: unknown }).text) : "").filter(Boolean)
    : [];
  return [text(value.lead), text(value.fact), ...paragraphs, text(value.closing)].filter(Boolean).join("\n\n");
}

export function derivePressCreationHandoff(nodeId: string, output: Record<string, unknown>) {
  const node = pressCreationProcess.nodes.find((entry) => entry.id === nodeId);
  if (!node) throw new Error("PRESS_AI_PROCESS_NODE_INVALID");
  node.outputSchema.parse(output);
  switch (nodeId) {
    case "article-initialization": return { articleId: output.articleId };
    case "brief-normalization": return { confirmedBrief: output };
    case "draft-generation": return { articleId: output.articleId, title: output.title, plain: output.plain };
    case "draft-review": return { availableNoteIds: Array.isArray(output.notes) ? output.notes.map((note) => (note as { id?: unknown }).id).filter((id): id is string => typeof id === "string") : [] };
    case "selected-rewrite": return { title: output.title, plain: output.plain };
    default: throw new Error("PRESS_AI_PROCESS_NODE_INVALID");
  }
}

export function validateSelectedReviewNotes(selectedNoteIds: readonly string[], notes: readonly { id: string }[]) {
  const unique = [...new Set(selectedNoteIds)];
  if (unique.length === 0) throw new Error("PRESS_AI_REVIEW_NOTE_REQUIRED");
  const available = new Set(notes.map((note) => note.id));
  if (unique.some((id) => !available.has(id))) throw new Error("PRESS_AI_REVIEW_NOTE_INVALID");
  return unique;
}

export type PressAiQualityCheck = { id: string; label: string; pass: boolean; detail: string };

export function evaluatePressDraftQuality(plain: string): PressAiQualityCheck[] {
  const requiredPhrases = ["20곳", "150분", "50분", "단순 평균", "대조군"];
  return [...requiredPhrases.map((phrase) => ({ id: `contains-${phrase}`, label: `‘${phrase}’ 보존`, pass: plain.includes(phrase), detail: plain.includes(phrase) ? "본문에 있음" : "본문에서 찾지 못함" })), { id: "external-verification", label: "외부 검증 제한 보존", pass: /외부.*검증|검증.*않/.test(plain), detail: /외부.*검증|검증.*않/.test(plain) ? "제한 문구가 있음" : "제한 문구를 찾지 못함" }, { id: "no-seoul-hq", label: "‘서울 기반’을 ‘서울 본사’로 강화하지 않음", pass: !plain.includes("서울 본사"), detail: plain.includes("서울 본사") ? "근거 없는 ‘서울 본사’ 표현 발견" : "강화 표현 없음" }];
}

export function derivePressPlaygroundHandoff(nodeId: string, responseValue: unknown, priorInput: unknown) {
  const output = responseValue && typeof responseValue === "object" && !Array.isArray(responseValue) ? responseValue as Record<string, any> : {};
  const prior = priorInput && typeof priorInput === "object" && !Array.isArray(priorInput) ? priorInput as Record<string, any> : {};
  if (nodeId === "article-initialization") return { articleId: String(output.articleId || output.id || "") };
  if (nodeId === "brief-normalization") return { nextStepId: "generate" as const, body: { serviceName: output.serviceName || "", announceType: output.announceType, oneLiner: output.oneLiner || "", points: Array.isArray(output.points) ? output.points : [], quoteWho: output.quoteWho || "", quoteMessage: output.quoteMessage || "", ...(output.eventAt ? { eventAt: output.eventAt } : {}), ...(output.publishAt ? { publishAt: output.publishAt } : {}), tone: prior.tone || "formal", rawText: prior.rawText || "", quotaMode: "simplified" } };
  if (nodeId === "draft-generation") return { nextStepId: "polish" as const, body: { title: output.title || "", plain: buildGeneratedPlain(output), userInstruction: "수치의 측정 기준과 제한사항 누락, 근거보다 강해진 표현, 기사체를 점검해줘.", quotaMode: "simplified" } };
  if (nodeId === "draft-review") return { nextStepId: "repolish" as const, body: { selectedNoteIds: Array.isArray(output.notes) ? output.notes.slice(0, 2).map((note: Record<string, any>) => note.id).filter(Boolean) : [], userInstruction: "확정 사실과 모든 조건을 유지하며 선택한 제안만 반영해줘.", quotaMode: "simplified" } };
  if (nodeId === "selected-rewrite") return { nextStepId: "save" as const, body: { title: output.revisedTitle || output.title || "", plain: output.revisedPlain || output.plain || "", harnessAction: { type: "apply_pending_rewrite", appliedAt: new Date().toISOString() } } };
  throw new Error("PRESS_AI_PROCESS_NODE_INVALID");
}
