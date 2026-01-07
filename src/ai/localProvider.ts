import { AiProvider, AiRequest, AiResponse } from "./provider";

function sanitizeBullets(lines: string[]): string[] {
  const blocked = [/node_modules/i, /dist\//i, /build\//i];
  return lines
    .map((line) => line.replace(/^[+-]/, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => !blocked.some((re) => re.test(line)))
    .slice(0, 2);
}

export class LocalAiProvider implements AiProvider {
  public name = "local";

  async generate(request: AiRequest): Promise<AiResponse> {
    const { insights } = request;
    const prefix = insights.scope ? `${insights.scope}: ` : "";
    const subject = `${prefix}${insights.summary}`.slice(0, 72).trim();
    const bullets = sanitizeBullets(insights.bulletPoints);

    return {
      subject,
      bullets,
    };
  }

  async generateMany(request: AiRequest, count: number): Promise<AiResponse[]> {
    const list: AiResponse[] = [];
    for (let i = 0; i < count; i += 1) {
      const lead = request.insights.topics[i] || request.insights.summary;
      const prefix = request.insights.scope ? `${request.insights.scope}: ` : "";
      const subject = `${prefix}${lead}`.slice(0, 72).trim();
      const bullets = sanitizeBullets(request.insights.bulletPoints.slice(i));
      list.push({ subject, bullets });
    }
    return list.slice(0, count);
  }
}
