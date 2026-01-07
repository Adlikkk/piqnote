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
  const subjectLimit = config.commit?.maxSubjectLength || 72;
  const bulletLimit = config.commit?.maxBullets || 2;
  const bulletPrefix = config.commit?.bulletPrefix || "-";
  const baseSubject = truncate(payload.subject, subjectLimit);
  const desiredScope = config.scope || payload.insightsScope || "core";
  const withScopeFix = baseSubject.replace(/^(feat|fix)(!?:)/, `$1(${desiredScope})$2`);
  const scoped =
    config.commit?.style === "conventional"
      ? ensureConventional(withScopeFix, desiredScope)
      : baseSubject;
  const bullets = (payload.bullets || [])
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, bulletLimit)
    .map((b) => `${bulletPrefix} ${b}`);
  return [scoped, ...bullets].join("\n");
}
