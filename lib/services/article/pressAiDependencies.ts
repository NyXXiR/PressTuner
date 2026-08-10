export type PressAiCompletionRequest = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  responseFormat: { type: "json_object" };
  temperature?: number;
};

export type PressAiDependencies = {
  completeJson: (request: PressAiCompletionRequest) => Promise<string>;
  searchKnowledge: (input: any) => Promise<any>;
  loadKnowledgeContexts: (input: any) => Promise<any>;
  now: () => Date;
  createId: () => string;
};

export type PressAiDependencyOverrides = Partial<PressAiDependencies>;

export function resolvePressAiDependencies(overrides: PressAiDependencyOverrides | undefined, production: PressAiDependencies): PressAiDependencies {
  return { ...production, ...overrides };
}
