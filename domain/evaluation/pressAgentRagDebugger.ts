import { z } from "zod";

export const PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS = {
  "baseline-v1": {
    id: "baseline-v1",
    label: "기본 하이브리드 검색",
    description: "벡터와 키워드를 결정론적으로 결합하는 표준 검색입니다.",
  },
  "candidate-v3": {
    id: "candidate-v3",
    label: "식별자 인식 검색",
    description: "문서 코드, 날짜, 고유명사를 보존해 찾는 결정론적 검색입니다.",
  },
} as const;

export const PRESS_AGENT_RAG_DEBUGGER_PROMPT_PRESETS = {
  "fact-summary": {
    id: "fact-summary",
    label: "핵심 사실 요약",
    prompt: "선택한 문서에서 보도자료에 사용할 핵심 사실을 근거와 함께 요약해 주세요.",
  },
  "metrics-and-dates": {
    id: "metrics-and-dates",
    label: "수치와 날짜 확인",
    prompt: "선택한 문서의 주요 수치, 날짜, 문서 코드를 근거와 함께 정리해 주세요.",
  },
  "answerability-check": {
    id: "answerability-check",
    label: "답변 가능성 확인",
    prompt: "선택한 문서만으로 질문에 답할 수 있는지 판단하고, 부족하면 답변을 유보해 주세요.",
  },
} as const;

export type PressAgentRagDebuggerRetrievalConfigurationId = keyof typeof PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS;
export type PressAgentRagDebuggerPromptPresetId = keyof typeof PRESS_AGENT_RAG_DEBUGGER_PROMPT_PRESETS;

const uniqueDocumentIds = z.array(z.string().min(1)).min(1).max(50).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "DOCUMENT_IDS_MUST_BE_UNIQUE" });
  }
});

export const StartRagDebuggerRunRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(12_000),
  promptPresetId: z.enum(["fact-summary", "metrics-and-dates", "answerability-check"]).nullable(),
  retrievalConfigurationId: z.enum(["baseline-v1", "candidate-v3"]),
  documentIds: uniqueDocumentIds,
  articleId: z.string().min(1).nullable().optional(),
}).strict();

export type StartRagDebuggerRunRequest = z.infer<typeof StartRagDebuggerRunRequestSchema>;

export type PressAgentRagDebuggerDocumentSnapshot = {
  id: string;
  name: string;
  readiness: "READY";
  pageCount: number | null;
  chunkCount: number;
};

export type PressAgentRagDebuggerDocument = {
  id: string;
  name: string;
  status: string;
  pageCount: number | null;
  chunkCount: number;
  selectable: boolean;
  readinessReason: string | null;
};

export function parseStartRagDebuggerRunRequest(value: unknown): StartRagDebuggerRunRequest {
  return StartRagDebuggerRunRequestSchema.parse(value);
}
