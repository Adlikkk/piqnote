import { PiqnoteConfig } from "../config/types";
import { AiProvider, AiRequest } from "./provider";
import { MockAiProvider } from "./mockProvider";
import { LocalAiProvider } from "./localProvider";
import { OpenAiProvider } from "./openAiProvider";

export interface ProviderOptions {
  offline?: boolean;
  apiKey?: string;
}

function resolveApiKey(token?: string): string {
  if (!token) return "";
  if (token.startsWith("env:")) {
    const envKey = token.slice(4);
    return process.env[envKey] || "";
  }
  return token;
}

export const GITHUB_AI_ENV_VARS = [
  "PIQNOTE_GITHUB_TOKEN",
  "GITHUB_MODELS_TOKEN",
  "GITHUB_MODEL_TOKEN",
  "GITHUB_FINE_GRAINED_TOKEN",
  "GITHUB_FINEGRAINED_TOKEN",
  "GITHUB_PAT",
  "GITHUB_TOKEN",
] as const;

export function resolveGithubEnvToken(): { env: string; value: string } | undefined {
  for (const env of GITHUB_AI_ENV_VARS) {
    const value = process.env[env];
    if (value && value.trim()) {
      return { env, value };
    }
  }
  return undefined;
}

export function getProvider(config: PiqnoteConfig, options: ProviderOptions = {}): AiProvider {
  const offline = options.offline ?? config.offline;
  if (offline) {
    return new LocalAiProvider();
  }

  const ai = config.ai || { provider: "mock" };
  const githubToken = resolveGithubEnvToken();
  const envFallback = ai.provider === "github" ? githubToken?.value : process.env.OPENAI_API_KEY;
  const apiKey = resolveApiKey(options.apiKey || ai.apiKey) || envFallback || "";

  switch (ai.provider) {
    case "github":
      return new OpenAiProvider({
        providerName: "github",
        endpoint: ai.endpoint || "https://models.inference.ai.azure.com/chat/completions",
        apiKey,
        model: ai.model || "gpt-4o-mini",
        temperature: ai.temperature ?? 0.2,
        maxTokens: ai.maxTokens ?? 120,
        warnOnMissingKey: true,
        fallback: new LocalAiProvider(),
      });
    case "openai":
      return new OpenAiProvider({
        providerName: "openai",
        endpoint: ai.endpoint || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1/chat/completions",
        apiKey,
        model: ai.model || process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: ai.temperature ?? 0.3,
        maxTokens: ai.maxTokens,
        warnOnMissingKey: true,
        fallback: new LocalAiProvider(),
      });
    case "local":
      return new LocalAiProvider();
    case "mock":
    default:
      return new MockAiProvider();
  }
}

export async function generateWithProvider(
  provider: AiProvider,
  request: AiRequest
) {
  return provider.generate(request);
}
