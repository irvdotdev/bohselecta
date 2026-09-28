export type Provider = 'codex' | 'claude';
export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
export type Feedback = 'good' | 'stronger' | 'cheaper' | 'unsure';
export type Model = {
  id: string; name: string; provider: Provider; resolvedId?: string;
  capability: number; costRank: number; priority: number; efforts: Effort[];
  defaultEffort?: Effort; description?: string;
};
export type Analysis = {
  category: string; difficulty: number; confidence: number; reasons: string[];
  contextDependent: boolean; source: 'rules' | 'classifier';
};
export type Choice = { model: Model; effort?: Effort; reason: string };
export type Recommendation = {
  analysis: Analysis; choices: Choice[]; source: 'rules' | 'history' | 'classifier' | 'override';
  catalogVersion: string; elapsedMs: number; matchedTaskId?: string;
};
export type Usage = { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number;
  cacheWriteInputTokens?: number; estimatedCostUsd?: number; basis?: string };
export type RunResult = {
  status: 'completed' | 'failed' | 'interrupted'; sessionId: string;
  actualModels: string[]; modelEvidence: 'execution' | 'configuration' | 'unavailable';
  configuredModel?: string; clientState?: { codexTokens?: { inputTokens: number; outputTokens: number; cachedInputTokens: number; cacheWriteInputTokens: number } }; text: string; usage: Usage; error?: string;
};
export type IO = {
  text(text: string): void; notice(text: string): void;
  ask(prompt: string, signal?: AbortSignal): Promise<string>;
};
export type Adapter = {
  sessionId?: string;
  connect(): Promise<Model[]>;
  run(prompt: string, choice: Choice, signal: AbortSignal): Promise<RunResult>;
  close(): Promise<void>;
};
