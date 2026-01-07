import { PiqnoteConfig } from "../config/types";
import { AiProvider, AiRequest } from "./provider";
import { MockAiProvider } from "./mockProvider";
import { LocalAiProvider } from "./localProvider";
import { OpenAiProvider } from "./openAiProvider";

export interface ProviderOptions {
  offline?: boolean;
}

export function getProvider(config: PiqnoteConfig, options: ProviderOptions = {}): AiProvider {
  if (options.offline) {
    return new MockAiProvider();
  }

  switch (config.provider) {
    case "openai":
      return new OpenAiProvider();
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
