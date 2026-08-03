export type ResumeStructuredBrief = {
  summary: string;
  deadline: string | null;
  employmentType: string | null;
  location: string | null;
  coreResponsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  keySignals: string[];
  writingGuidance: string[];
};

export type ResumeBriefDocument = {
  version: 1;
  summary: string;
  deadline: string | null;
  employmentType: string | null;
  location: string | null;
  coreResponsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  keySignals: string[];
  writingGuidance: string[];
};

export function createEmptyResumeBrief(): ResumeStructuredBrief {
  return {
    summary: "",
    deadline: null,
    employmentType: null,
    location: null,
    coreResponsibilities: [],
    requirements: [],
    preferredQualifications: [],
    keySignals: [],
    writingGuidance: [],
  };
}

export function serializeResumeBrief(
  brief: ResumeStructuredBrief,
): string {
  const payload: ResumeBriefDocument = {
    version: 1,
    summary: brief.summary,
    deadline: brief.deadline,
    employmentType: brief.employmentType,
    location: brief.location,
    coreResponsibilities: brief.coreResponsibilities,
    requirements: brief.requirements,
    preferredQualifications: brief.preferredQualifications,
    keySignals: brief.keySignals,
    writingGuidance: brief.writingGuidance,
  };

  return JSON.stringify(payload);
}

export function parseResumeBrief(raw: string | null | undefined): ResumeStructuredBrief {
  if (!raw) return createEmptyResumeBrief();

  try {
    const parsed = JSON.parse(raw) as Partial<ResumeBriefDocument>;
    if (parsed && typeof parsed === "object" && parsed.version === 1) {
      return {
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
        deadline: typeof parsed.deadline === "string" ? parsed.deadline : null,
        employmentType:
          typeof parsed.employmentType === "string" ? parsed.employmentType : null,
        location: typeof parsed.location === "string" ? parsed.location : null,
        coreResponsibilities: Array.isArray(parsed.coreResponsibilities)
          ? parsed.coreResponsibilities.map(String)
          : [],
        requirements: Array.isArray(parsed.requirements)
          ? parsed.requirements.map(String)
          : [],
        preferredQualifications: Array.isArray(parsed.preferredQualifications)
          ? parsed.preferredQualifications.map(String)
          : [],
        keySignals: Array.isArray(parsed.keySignals)
          ? parsed.keySignals.map(String)
          : [],
        writingGuidance: Array.isArray(parsed.writingGuidance)
          ? parsed.writingGuidance.map(String)
          : [],
      };
    }
  } catch {
    // fall through to plain text handling
  }

  return {
    ...createEmptyResumeBrief(),
    summary: raw,
  };
}

export function buildResumeBriefContext(brief: ResumeStructuredBrief) {
  return [
    brief.summary ? `공고 요약: ${brief.summary}` : null,
    brief.deadline ? `마감일: ${brief.deadline}` : null,
    brief.employmentType ? `고용형태: ${brief.employmentType}` : null,
    brief.location ? `근무지: ${brief.location}` : null,
    brief.coreResponsibilities.length > 0
      ? `주요 업무:\n- ${brief.coreResponsibilities.join("\n- ")}`
      : null,
    brief.requirements.length > 0
      ? `필수 요건:\n- ${brief.requirements.join("\n- ")}`
      : null,
    brief.preferredQualifications.length > 0
      ? `우대 사항:\n- ${brief.preferredQualifications.join("\n- ")}`
      : null,
    brief.keySignals.length > 0
      ? `중요 평가 포인트:\n- ${brief.keySignals.join("\n- ")}`
      : null,
    brief.writingGuidance.length > 0
      ? `작성 가이드:\n- ${brief.writingGuidance.join("\n- ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
