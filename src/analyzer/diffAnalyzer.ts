export interface DiffInsights {
  scope?: string;
  topics: string[];
  bulletPoints: string[];
  summary: string;
  isFrontend: boolean;
  filesTouched: number;
  fileKinds: string[];
}

function extractFilePaths(diff: string): string[] {
  return diff
    .split("\n")
    .filter((line) => line.startsWith("+++ b/") || line.startsWith("--- a/"))
    .map((line) => line.replace("+++ b/", "").replace("--- a/", ""))
    .filter(Boolean);
}

function detectScopeFromPaths(paths: string[]): string | undefined {
  const frontendExtensions = [".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".sass", ".vue"];
  const apiIndicators = ["api", "server", "backend", "routes", "controllers"];
  const configIndicators = ["config", "settings", "env", "build", "webpack", "vite"];

  for (const file of paths) {
    const lower = file.toLowerCase();
    if (frontendExtensions.some((ext) => lower.endsWith(ext))) {
      if (lower.includes("component") || lower.includes("ui")) {
        return "ui";
      }
      return "front";
    }
    if (apiIndicators.some((keyword) => lower.includes(keyword))) {
      return "api";
    }
    if (configIndicators.some((keyword) => lower.includes(keyword))) {
      return "build";
    }
  }
  return undefined;
}

function extractAddedRemovedLines(diff: string): string[] {
  return diff
    .split("\n")
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .filter((line) => !line.startsWith("+++"))
    .filter((line) => !line.startsWith("---"))
    .map((line) => line.substring(1).trim())
    .filter(Boolean);
}

function pickTopTopics(lines: string[], limit: number = 3): string[] {
  const keywordCount = new Map<string, number>();
  for (const line of lines) {
    const words = line
      .replace(/[^a-zA-Z0-9_ ]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 3 && w.length < 30);
    for (const word of words) {
      keywordCount.set(word, (keywordCount.get(word) || 0) + 1);
    }
  }
  return Array.from(keywordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function buildSummary(topics: string[], scope?: string): string {
  const topicText = topics.length ? topics.join(", ") : "changes";
  if (scope) {
    return `${scope} updates: ${topicText}`;
  }
  return `Updates around ${topicText}`;
}

export function analyzeDiff(diff: string): DiffInsights {
  const files = extractFilePaths(diff);
  const scope = detectScopeFromPaths(files);
  const lines = extractAddedRemovedLines(diff);
  const topics = pickTopTopics(lines, 4);
  const bulletPoints = lines.slice(0, 5).map((line) => line.slice(0, 80));
  const summary = buildSummary(topics, scope);
  const frontendExtensions = [".tsx", ".jsx", ".css", ".scss", ".sass", ".vue"];
  const isFrontend = files.some((file) => frontendExtensions.some((ext) => file.toLowerCase().endsWith(ext)));
  const fileKinds = Array.from(
    new Set(
      files.map((f) => {
        const parts = f.split(".");
        return parts.length > 1 ? parts.pop() || "" : "";
      }).filter(Boolean)
    )
  );

  return {
    scope,
    topics,
    bulletPoints,
    summary,
    isFrontend,
    filesTouched: files.length,
    fileKinds,
  };
}
