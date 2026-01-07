import { AiProvider, AiRequest, AiResponse } from "./provider";

export class LocalAiProvider implements AiProvider {
  public name = "local";

  async generate(request: AiRequest): Promise<AiResponse> {
    const { insights } = request;
    const prefix = insights.scope ? `${insights.scope}: ` : "";
    const subject = `${prefix}${insights.summary}`.slice(0, 72).trim();

    const bullets = insights.bulletPoints.slice(0, 5).map((line) => line.replace(/^[+-]/, "").trim());

    return {
      subject,
      bullets,
      rationale: [
        "Generated locally using diff insights and heuristics.",
        `Scope: ${insights.scope || "n/a"}.`,
      ],
    };
  }
}
