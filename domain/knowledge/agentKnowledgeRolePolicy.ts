import { KnowledgeChunkRole } from "@prisma/client";

export function resolveAgentKnowledgeRoles(args: Readonly<{
  query: string;
  requestedRoles?: readonly KnowledgeChunkRole[];
}>) {
  if (args.requestedRoles?.length) {
    return [...new Set(args.requestedRoles)];
  }
  if (/PT-CAREER|이력서|경력|자기소개서|\bresume\b|\bcareer\b/i.test(args.query)) {
    return [KnowledgeChunkRole.CAREER];
  }
  return [KnowledgeChunkRole.FACT];
}
