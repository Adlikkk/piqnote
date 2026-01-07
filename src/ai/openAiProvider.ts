import { AiProvider, AiRequest, AiResponse } from "./provider";
import { LocalAiProvider } from "./localProvider";

interface OpenAiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAiChoice {
  message: OpenAiChatMessage;
}

interface OpenAiResponse {
  choices: OpenAiChoice[];
}

export class OpenAiProvider implements AiProvider {
  public name = "openai";
  private endpoint: string;
  private apiKey: string;
  private model: string;
  private fallback = new LocalAiProvider();

  constructor() {
    this.endpoint = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions";
    this.apiKey = process.env.OPENAI_API_KEY || "";
    this.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    if (!this.apiKey) {
      return this.fallback.generate(request);
    }

    const prompt = this.buildPrompt(request);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.4,
          messages: prompt,
        }),
      });

      if (!response.ok) {
        return this.fallback.generate(request);
      }

      const data = (await response.json()) as OpenAiResponse;
      const content = data.choices?.[0]?.message?.content || "";
      if (!content) {
        return this.fallback.generate(request);
      }

      const parsed = this.parseContent(content);
      return parsed || this.fallback.generate(request);
    } catch {
      return this.fallback.generate(request);
    }
  }

  private buildPrompt(request: AiRequest): OpenAiChatMessage[] {
    const { diff, insights, language, style } = request;
    const scopeText = insights.scope ? `Scope: ${insights.scope}` : "";
    return [
      {
        role: "system",
        content:
          "You are a commit message assistant. Generate a concise Git commit message with subject <=72 characters. Include optional bullet points. Use Conventional Commits if style=conventional. Be frontend-aware for React/CSS/UI changes.",
      },
      {
        role: "user",
        content: [
          `Language: ${language}`,
          `Style: ${style}`,
          scopeText,
          "Diff:",
          diff.slice(0, 6000),
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];
  }

  private parseContent(content: string): AiResponse | null {
    const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return null;

    const subject = lines[0].replace(/^subject[:\-]\s*/i, "").slice(0, 72).trim();
    const bullets = lines
      .slice(1)
      .filter((line) => /^[-*•]/.test(line))
      .map((line) => line.replace(/^[-*•]\s*/, "").trim())
      .slice(0, 5);

    return {
      subject: subject || lines[0].slice(0, 72),
      bullets,
      rationale: ["Generated via OpenAI"],
    };
  }
}
