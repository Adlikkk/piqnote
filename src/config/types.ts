export type CommitStyle = "conventional" | "plain";

export type AiProviderName = "mock" | "local" | "openai" | "github";

export interface AiConfig {
  provider: AiProviderName;
  model?: string;
  apiKey?: string;
  endpoint?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CommitConfig {
  style: CommitStyle;
  maxSubjectLength: number;
  maxBullets?: number;
  bulletPrefix?: string;
}

export interface PiqnoteConfig {
  ai: AiConfig;
  commit: CommitConfig;
  scope?: string;
  language: string;
  offline?: boolean;
  baseBranch?: string;
}
