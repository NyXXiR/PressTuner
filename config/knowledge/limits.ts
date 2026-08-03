export type KnowledgeLimits = {
  maxFileBytes: number;
  maxDocumentsPerTeam: number;
  maxStoredBytesPerTeam: number;
  uploadRateLimit: number;
  uploadRateWindowSeconds: number;
};

const DEFAULTS = {
  KNOWLEDGE_MAX_FILE_BYTES: 20 * 1024 * 1024,
  KNOWLEDGE_MAX_DOCUMENTS_PER_TEAM: 25,
  KNOWLEDGE_MAX_STORED_BYTES_PER_TEAM: 250 * 1024 * 1024,
  KNOWLEDGE_UPLOAD_RATE_LIMIT: 10,
  KNOWLEDGE_UPLOAD_RATE_WINDOW_SECONDS: 3600,
} as const;

function positiveSafeInteger(
  env: Record<string, string | undefined>,
  name: keyof typeof DEFAULTS,
) {
  const raw = env[name];
  if (raw === undefined || raw === "") return DEFAULTS[name];
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`KNOWLEDGE_LIMIT_INVALID:${name}`);
  }
  return value;
}

export function loadKnowledgeLimits(
  env: Record<string, string | undefined> = process.env,
): KnowledgeLimits {
  return {
    maxFileBytes: positiveSafeInteger(env, "KNOWLEDGE_MAX_FILE_BYTES"),
    maxDocumentsPerTeam: positiveSafeInteger(
      env,
      "KNOWLEDGE_MAX_DOCUMENTS_PER_TEAM",
    ),
    maxStoredBytesPerTeam: positiveSafeInteger(
      env,
      "KNOWLEDGE_MAX_STORED_BYTES_PER_TEAM",
    ),
    uploadRateLimit: positiveSafeInteger(env, "KNOWLEDGE_UPLOAD_RATE_LIMIT"),
    uploadRateWindowSeconds: positiveSafeInteger(
      env,
      "KNOWLEDGE_UPLOAD_RATE_WINDOW_SECONDS",
    ),
  };
}

export const knowledgeLimits = loadKnowledgeLimits();
