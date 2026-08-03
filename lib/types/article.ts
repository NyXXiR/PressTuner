// lib/types/article.ts
export type Paragraph = {
  text: string;
  importance: number;
};

export type ArticleResult = {
  title: string;
  lead: string;
  fact: string;
  paragraphs: { text: string; importance: number }[];
  closing: string;
  usedFactIds?: string[];
  appliedStyleRules?: {
    vocabulary?: { from: string; to: string; explanation?: string }[];
    toneHints?: { pattern: string; recommendation: string }[];
    boilerplates?: {
      slot: "lead" | "body" | "closing";
      text: string;
      usageHint?: string;
    }[];
    banList?: string[];
    keywords?: {
      key: string;
      kind?: "tone" | "topic" | "structure" | "other";
      weight?: number;
    }[];
  };
};

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};
