import {
  ResumeWritingLabStateSchema,
  type ResumeWritingLabState,
} from "./labTypes";

export const RESUME_WRITING_LAB_STORAGE_KEY =
  "presstuner.resume-writing-lab.v2";

export function serializeResumeWritingLabState(
  state: ResumeWritingLabState,
): string {
  return JSON.stringify(state);
}

export function parseResumeWritingLabState(
  serialized: string,
): ResumeWritingLabState | null {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }

  const parsed = ResumeWritingLabStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
