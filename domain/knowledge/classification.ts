export const KNOWLEDGE_CHUNK_ROLES = [
  "FACT",
  "STYLE_POLICY",
  "STYLE_EXAMPLE",
  "IGNORE",
] as const;

export type KnowledgeChunkRole = (typeof KNOWLEDGE_CHUNK_ROLES)[number];

export function effectiveKnowledgeRole(args: {
  automaticRole: KnowledgeChunkRole | null;
  documentOverride: KnowledgeChunkRole | null;
}): KnowledgeChunkRole | null {
  return args.documentOverride ?? args.automaticRole;
}

export function isKnowledgeRoleSearchable(args: {
  automaticRole: KnowledgeChunkRole | null;
  documentOverride: KnowledgeChunkRole | null;
  requestedRoles: readonly KnowledgeChunkRole[];
}): boolean {
  const role = effectiveKnowledgeRole(args);
  return role !== null && args.requestedRoles.includes(role);
}
