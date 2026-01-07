import { DiffInsights } from "./diffAnalyzer";

export interface ScoreDetail {
  label: string;
  points: number;
  reason: string;
}

export interface CommitScore {
  total: number;
  details: ScoreDetail[];
}

function isImperative(subject: string): boolean {
  const firstWord = subject.trim().split(/\s+/)[0]?.toLowerCase();
  if (!firstWord) return false;
  const blacklist = ["fixes", "fixed", "fixing", "adds", "added", "adding", "updates", "updated"];
  return !blacklist.includes(firstWord) && !subject.toLowerCase().includes("please");
}

export function scoreCommit(message: string, insights: DiffInsights): CommitScore {
  const details: ScoreDetail[] = [];
  const subject = message.split("\n")[0];

  if (subject.length <= 72) {
    details.push({ label: "Subject length", points: 20, reason: "Within 72 characters" });
  } else {
    details.push({ label: "Subject length", points: 5, reason: "Too long" });
  }

  if (isImperative(subject)) {
    details.push({ label: "Imperative mood", points: 15, reason: "Starts with a verb" });
  } else {
    details.push({ label: "Imperative mood", points: 5, reason: "Consider imperative verb" });
  }

  if (message.includes("feat:") || message.includes("fix:") || message.includes("chore:") || message.includes("refactor:")) {
    details.push({ label: "Conventional style", points: 15, reason: "Uses Conventional Commits" });
  } else {
    details.push({ label: "Conventional style", points: 5, reason: "Add a type prefix" });
  }

  const bulletLines = message.split("\n").filter((line) => line.trim().startsWith("-"));
  if (bulletLines.length > 0) {
    details.push({ label: "Bullets", points: 15, reason: "Includes bullet points" });
  } else {
    details.push({ label: "Bullets", points: 5, reason: "Add bullets for clarity" });
  }

  if (insights.isFrontend) {
    details.push({ label: "Frontend awareness", points: 10, reason: "Mentions UI-related changes" });
  } else {
    details.push({ label: "Frontend awareness", points: 8, reason: "General changes" });
  }

  if (insights.filesTouched > 3) {
    details.push({ label: "Scope breadth", points: 8, reason: "Multiple files" });
  } else {
    details.push({ label: "Scope breadth", points: 6, reason: "Focused change" });
  }

  const total = Math.min(
    100,
    details.reduce((sum, item) => sum + item.points, 0)
  );

  return { total, details };
}
