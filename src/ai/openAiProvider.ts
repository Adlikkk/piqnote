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

export interface OpenAiProviderConfig {
  providerName?: string;
  endpoint?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  warnOnMissingKey?: boolean;
  fallback?: AiProvider;
}

export class OpenAiProvider implements AiProvider {
  public name: string;
  private endpoint: string;
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens?: number;
  private fallback: AiProvider;
  private warnOnMissingKey: boolean;

  constructor(config: OpenAiProviderConfig = {}) {
    this.name = config.providerName || "openai";
    this.endpoint = config.endpoint || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions";
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
    this.temperature = config.temperature ?? 0.4;
    this.maxTokens = config.maxTokens;
    this.warnOnMissingKey = config.warnOnMissingKey ?? false;
    this.fallback = config.fallback || new LocalAiProvider();
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    if (!this.apiKey) {
      if (this.warnOnMissingKey) {
        console.warn(`Piqnote: Missing API key for ${this.name} provider; falling back to heuristic mode.`);
      }
      return this.fallback.generate(request);
    }

    const prompt = this.buildPrompt(request);

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        temperature: this.temperature,
        messages: prompt,
      };

      if (this.maxTokens !== undefined) {
        body.max_tokens = this.maxTokens;
      }

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (this.warnOnMissingKey) {
          console.warn(`Piqnote: ${this.name} request failed (${response.status}); using heuristic mode.`);
        }
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

  async generateMany(request: AiRequest, count: number): Promise<AiResponse[]> {
    const first = await this.generate(request);
    if (this.fallback.generateMany) {
      const extras = await this.fallback.generateMany(request, count - 1);
      return [first, ...extras].slice(0, count);
    }

    const extras: AiResponse[] = [];
    for (let i = 1; i < count; i += 1) {
      extras.push(await this.fallback.generate(request));
    }
    return [first, ...extras].slice(0, count);
  }

  private buildPrompt(request: AiRequest): OpenAiChatMessage[] {
    const { insights, language, style } = request;
    const scopeText = insights.scope ? `Scope: ${insights.scope}` : "";
    return [
      {
        role: "system",
        content:
          "You are a commit message assistant. Produce a disciplined, short Git commit message (<=72 chars subject, max 2 bullets). Use Conventional Commits when style=conventional. Avoid file paths and build artifacts.",
      },
      {
        role: "user",
        content: [
          `Language: ${language}`,
          `Style: ${style}`,
          scopeText,
          `Topics: ${insights.topics.join(", ")}`,
          `Summary: ${insights.summary}`,
          `File types: ${insights.fileKinds.join(", ")}`,
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
