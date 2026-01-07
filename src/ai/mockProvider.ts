import { AiProvider, AiRequest, AiResponse } from "./provider";

const verbs = ["refine", "fix", "add", "improve", "update", "tune", "adjust", "harden"];

function pickVerb(): string {
  return verbs[Math.floor(Math.random() * verbs.length)];
}

export class MockAiProvider implements AiProvider {
  public name = "mock";

  async generate(request: AiRequest): Promise<AiResponse> {
    const { insights } = request;
    const primaryTopic = insights.topics[0] || "changes";
    const verb = pickVerb();
    const scopeHint = insights.scope ? `${insights.scope}: ` : "";
    const subject = `${verb} ${scopeHint}${primaryTopic}`.trim();

    const bullets = insights.bulletPoints.slice(0, 5).map((point) => {
      return point.replace(/^[+\-]/, "").trim();
    });

    const rationale = [
      `Used mock provider with heuristic verb '${verb}'.`,
      `Scope hint: ${insights.scope || "none"}.`,
    ];

    return { subject, bullets, rationale };
  }
}
