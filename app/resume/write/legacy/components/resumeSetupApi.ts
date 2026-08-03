import type { QuestionState, TargetInfo } from "@/stores/useResumeWriteStore";
import type { ParsedBrick } from "@/app/resume/write/legacy/components/resumeStartTypes";

type IntakeResponse = {
  companyName: string | null;
  jobTitle: string | null;
  deadline: string | null;
  employmentType: string | null;
  location: string | null;
  jdSummary: string;
  coreResponsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  keySignals: string[];
  writingGuidance: string[];
  questions: Array<{
    questionText: string;
    charLimit: number | null;
  }>;
};

export type ParsedIntake = {
  readonly targetInfo: TargetInfo;
  readonly questions: QuestionState[];
};

function toQuestionState(
  question: IntakeResponse["questions"][number],
  index: number,
): QuestionState {
  return {
    id: `intake-${Date.now()}-${index}`,
    questionText: question.questionText,
    charLimit: question.charLimit ?? 700,
    answer: "",
    relatedBricks: [],
    isSaved: false,
    isCompleted: false,
  };
}

export async function parseResumeIntake(input: {
  readonly rawText: string;
  readonly urlInput: string;
}): Promise<ParsedIntake> {
  const res = await fetch("/api/resume/intake/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: input.rawText,
      url: input.urlInput,
    }),
  });

  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json?.message ?? json?.error ?? "채용정보 정리에 실패했습니다.");
  }

  const data = json.data as IntakeResponse;
  return {
    targetInfo: {
      company: data.companyName ?? "",
      job: data.jobTitle ?? "",
      brief: {
        summary: data.jdSummary ?? "",
        deadline: data.deadline,
        employmentType: data.employmentType,
        location: data.location,
        coreResponsibilities: data.coreResponsibilities ?? [],
        requirements: data.requirements ?? [],
        preferredQualifications: data.preferredQualifications ?? [],
        keySignals: data.keySignals ?? [],
        writingGuidance: data.writingGuidance ?? [],
      },
    },
    questions: data.questions.map(toQuestionState),
  };
}

export async function parseExperiencePdf(file: File): Promise<ParsedBrick[]> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/resume/parse", {
    method: "POST",
    body: formData,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json?.message ?? json?.error ?? "PDF 분석에 실패했습니다.");
  }

  return Array.isArray(json.items) ? (json.items as ParsedBrick[]) : [];
}

export async function saveParsedBricks(
  bricks: readonly ParsedBrick[],
): Promise<void> {
  const res = await fetch("/api/resume/bricks/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: bricks.map((brick) => ({
        title: brick.title,
        content: brick.content,
        originalText: brick.originalText || brick.content,
        period: brick.period ?? null,
        tags: brick.tags ?? [],
        source: "FILE_PARSE",
      })),
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json?.message ?? json?.error ?? "브릭 저장에 실패했습니다.");
  }
}
