import { PiqnoteConfig } from "../config/types";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3).trimEnd() + "...";
}

function ensureConventional(subject: string, scope?: string): string {
  const conventionalRegex = /^(feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert)(\(.+\))?:/;
  if (conventionalRegex.test(subject)) {
    return subject;
  }

  const scoped = scope ? `chore(${scope}): ${subject}` : `chore: ${subject}`;
  return scoped;
}

export interface CommitMessagePayload {
  subject: string;
  bullets: string[];
  insightsScope?: string;
}

export function formatCommit(
  payload: CommitMessagePayload,
  config: PiqnoteConfig
): string {
  const baseSubject = truncate(payload.subject, config.maxSubjectLength || 72);
  const scoped =
    config.style === "conventional"
      ? ensureConventional(baseSubject, config.scope || payload.insightsScope)
      : baseSubject;
  const bullets = payload.bullets?.length
    ? payload.bullets.map((b) => `${config.bulletPrefix} ${b.trim()}`)
    : [];
  return [scoped, ...bullets].join("\n");
}
