import fs from "fs";
import path from "path";
import { PiqnoteConfig } from "./types";

const defaultConfig: PiqnoteConfig = {
  ai: {
    provider: "github",
    model: "gpt-4o-mini",
    apiKey: "env:GITHUB_TOKEN",
    endpoint: "https://models.inference.ai.azure.com/chat/completions",
    temperature: 0.2,
    maxTokens: 120,
  },
  commit: {
    style: "conventional",
    maxSubjectLength: 72,
    maxBullets: 2,
    bulletPrefix: "-",
  },
  scope: "core",
  language: "en",
  offline: false,
  baseBranch: "main",
};

function normalizeConfig(parsed: any): PiqnoteConfig {
  const ai = {
    ...defaultConfig.ai,
    ...(parsed?.ai || {}),
    ...(parsed?.provider ? { provider: parsed.provider } : {}),
    ...(parsed?.apiKey ? { apiKey: parsed.apiKey } : {}),
    ...(parsed?.model ? { model: parsed.model } : {}),
    ...(parsed?.endpoint ? { endpoint: parsed.endpoint } : {}),
  };

  const commit = {
    ...defaultConfig.commit,
    ...(parsed?.commit || {}),
    ...(parsed?.style ? { style: parsed.style } : {}),
    ...(parsed?.maxSubjectLength ? { maxSubjectLength: parsed.maxSubjectLength } : {}),
    ...(parsed?.maxBullets ? { maxBullets: parsed.maxBullets } : {}),
    ...(parsed?.bulletPrefix ? { bulletPrefix: parsed.bulletPrefix } : {}),
  };

  return {
    ai,
    commit,
    scope: parsed?.scope ?? defaultConfig.scope,
    language: parsed?.language || defaultConfig.language,
    offline: parsed?.offline ?? defaultConfig.offline,
    baseBranch: parsed?.baseBranch || defaultConfig.baseBranch,
  };
}

export function loadConfig(cwd: string = process.cwd()): PiqnoteConfig {
  const configPath = path.join(cwd, ".piqnoterc");
  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed);
  } catch (error) {
    console.warn("Piqnote: failed to parse .piqnoterc, using defaults.");
    return defaultConfig;
  }
}

export function getDefaultConfig(): PiqnoteConfig {
  return { ...defaultConfig };
}

export function saveConfig(cwd: string, updates: Partial<PiqnoteConfig>): PiqnoteConfig {
  const current = loadConfig(cwd);
  const next: PiqnoteConfig = {
    ...current,
    ...updates,
    ai: { ...current.ai, ...(updates.ai || {}) },
    commit: { ...current.commit, ...(updates.commit || {}) },
  };
  const configPath = path.join(cwd, ".piqnoterc");
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return next;
}
