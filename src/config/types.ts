export type CommitStyle = "conventional" | "plain";

export interface PiqnoteConfig {
  style: CommitStyle;
  scope?: string;
  maxSubjectLength: number;
  language: string;
  bulletPrefix: string;
  provider: "mock" | "local" | "openai";
  offline?: boolean;
}
