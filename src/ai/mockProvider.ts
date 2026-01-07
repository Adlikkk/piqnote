import { AiProvider, AiRequest, AiResponse } from "./provider";

const verbs = ["refine", "fix", "add", "improve", "update", "tune", "adjust", "harden", "align", "streamline"];

function pickVerb(seed: number): string {
  return verbs[seed % verbs.length];
}

function buildSubject(insights: AiRequest["insights"], seed: number): string {
  const verb = pickVerb(seed);
  const topic = insights.topics[seed % insights.topics.length] || insights.topics[0] || insights.summary || "changes";
  const scope = insights.scope ? `${insights.scope}: ` : "";
  return `${verb} ${scope}${topic}`.trim();
}

function sanitizeBullets(lines: string[]): string[] {
  const blocked = [/node_modules/i, /dist\//i, /build\//i];
  return lines
    .map((line) => line.replace(/^[+-]/, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !blocked.some((re) => re.test(line)))
    .slice(0, 2);
}

export class MockAiProvider implements AiProvider {
  public name = "mock";

  async generate(request: AiRequest): Promise<AiResponse> {
    const subject = buildSubject(request.insights, 0).slice(0, 72);
    const bullets = sanitizeBullets(request.insights.bulletPoints);
    return { subject, bullets };
  }

  async generateMany(request: AiRequest, count: number): Promise<AiResponse[]> {
    const results: AiResponse[] = [];
    for (let i = 0; i < count; i += 1) {
      const subject = buildSubject(request.insights, i).slice(0, 72);
      const bullets = sanitizeBullets(request.insights.bulletPoints.slice(i));
      results.push({ subject, bullets });
    }
    return results.slice(0, count);
  }
}
