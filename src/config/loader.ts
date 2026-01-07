import fs from "fs";
import path from "path";
import { PiqnoteConfig } from "./types";

const defaultConfig: PiqnoteConfig = {
  style: "conventional",
  scope: undefined,
  maxSubjectLength: 72,
  language: "en",
  bulletPrefix: "-",
  provider: "mock",
  offline: false,
};

export function loadConfig(cwd: string = process.cwd()): PiqnoteConfig {
  const configPath = path.join(cwd, ".piqnoterc");
  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ...defaultConfig,
      ...parsed,
    } as PiqnoteConfig;
  } catch (error) {
    console.warn("Piqnote: failed to parse .piqnoterc, using defaults.");
    return defaultConfig;
  }
}

export function getDefaultConfig(): PiqnoteConfig {
  return { ...defaultConfig };
}
