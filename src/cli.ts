#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import { loadConfig, getDefaultConfig, saveConfig } from "./config/loader";
import { PiqnoteConfig, AiProviderName, AiConfig } from "./config/types";
import { analyzeDiff, DiffInsights } from "./analyzer/diffAnalyzer";
import { scoreCommit } from "./analyzer/scorer";
import { formatCommit } from "./formatter/commitFormatter";
import { getProvider, generateWithProvider } from "./ai/factory";
import {
  isGitRepo,
  hasStagedChanges,
  hasUnstagedChanges,
  getStagedFiles,
  getUnstagedFiles,
  filterIgnored,
  getDiffForFiles,
  stageAll,
  commitMessage,
  checkoutBranch,
  createBranch,
  pushCurrentBranch,
} from "./git/gitClient";

interface CommitOptions {
  score: boolean;
  offline: boolean;
}

interface StartOptions {
  base?: string;
}

interface FinishOptions {
  base?: string;
}

interface ConfigOptions {
  apiKey?: string;
  provider?: "github" | "openai" | "local" | "mock";
  model?: string;
}

const ARTIFACT_PATTERNS = [/node_modules/i, /dist\b/i, /build\b/i, /coverage/i, /\.turbo\//i];
const FILE_MENTION = /\b\w+\.(ts|js|jsx|tsx|json|md|css|scss|yml|yaml|lock|log|env)\b/i;
const PATH_MENTION = /[\\/]/;
const VAGUE_TERMS = ["update", "misc", "stuff", "various", "changes"];

function sanitizeBullets(bullets: string[], limit: number): string[] {
  return bullets
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .filter((b) => !ARTIFACT_PATTERNS.some((re) => re.test(b)))
    .filter((b) => !FILE_MENTION.test(b))
    .filter((b) => !PATH_MENTION.test(b))
    .filter((b) => !VAGUE_TERMS.some((term) => b.toLowerCase() === term))
    .slice(0, Math.max(1, limit));
}

function ensureBullets(candidate: string[], fallback: string[], limit: number): string[] {
  const clean = sanitizeBullets(candidate, limit);
  if (clean.length) return clean;
  return sanitizeBullets(fallback, limit);
}

interface ParsedSubject {
  type: string;
  scope?: string;
  description: string;
  breaking: boolean;
}

function parseSubject(subject: string): ParsedSubject | null {
  const match = subject.match(/^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s+(?<desc>.+)$/i);
  if (!match || !match.groups) return null;
  return {
    type: match.groups.type.toLowerCase(),
    scope: match.groups.scope,
    description: match.groups.desc.trim(),
    breaking: Boolean(match.groups.breaking),
  };
}

function stripTrailingPunctuation(text: string): string {
  return text.replace(/[.!?;:,]+$/g, "");
}

function toImperative(desc: string): boolean {
  const first = desc.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return false;
  const blacklist = ["updates", "updated", "updating", "fixes", "fixed", "fixing", "adds", "added", "adding", "please"];
  return !blacklist.includes(first);
}

function normalizeSubject(subject: string, scopeFallback: string): string {
  const trimmed = stripTrailingPunctuation(subject.trim());
  const parsed = parseSubject(trimmed);
  if (parsed) {
    const needsScope = (parsed.type === "feat" || parsed.type === "fix") && !parsed.scope;
    const scope = needsScope ? scopeFallback : parsed.scope;
    const desc = parsed.description;
    return `${parsed.type}${scope ? `(${scope})` : ""}${parsed.breaking ? "!" : ""}: ${desc}`;
  }
  return `chore(${scopeFallback}): ${trimmed}`;
}

function containsArtifacts(text: string): boolean {
  return ARTIFACT_PATTERNS.some((re) => re.test(text));
}

function containsFiles(text: string): boolean {
  return FILE_MENTION.test(text) || PATH_MENTION.test(text);
}

function containsVague(text: string): boolean {
  return VAGUE_TERMS.some((term) => text.toLowerCase().includes(term));
}

function validateCommitContent(
  subject: string,
  bullets: string[],
  config: PiqnoteConfig
): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const maxSubjectLength = config.commit?.maxSubjectLength || 72;
  const maxBullets = config.commit?.maxBullets || 2;
  const parsed = parseSubject(subject);
  if (!parsed) {
    reasons.push("Subject must follow Conventional Commits (type(scope): desc)");
  } else {
    const allowed = ["feat", "fix", "chore", "docs", "refactor", "perf", "test", "build", "ci", "style", "revert"];
    if (!allowed.includes(parsed.type)) {
      reasons.push("Unsupported commit type for semantic-release");
    }
    if ((parsed.type === "feat" || parsed.type === "fix") && !parsed.scope) {
      reasons.push("feat/fix must include a scope");
    }
    if (parsed.description.length === 0) {
      reasons.push("Subject description is required");
    }
    if (!toImperative(parsed.description)) {
      reasons.push("Subject should use imperative mood");
    }
    if (/[.!?;:,]+$/.test(parsed.description)) {
      reasons.push("Subject must not end with punctuation");
    }
  }

  if (subject.length > maxSubjectLength) {
    reasons.push(`Subject exceeds ${maxSubjectLength} characters`);
  }

  if (containsArtifacts(subject) || containsFiles(subject)) {
    reasons.push("Subject references artifacts or file paths");
  }

  if (containsVague(subject)) {
    reasons.push("Subject contains vague terms (update/misc/stuff)");
  }

  if (bullets.length > maxBullets) {
    reasons.push(`Too many bullets (max ${maxBullets})`);
  }

  bullets.forEach((b) => {
    if (containsArtifacts(b) || containsFiles(b)) {
      reasons.push("Bullets must not mention files or build artifacts");
    }
    if (containsVague(b)) {
      reasons.push("Bullets must add semantic value (avoid vague terms)");
    }
  });

  return { valid: reasons.length === 0, reasons };
}

async function pickSuggestion(messages: string[]): Promise<number> {
  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "Select a suggestion",
      choices: messages.map((m, idx) => ({
        name: m.split("\n")[0],
        value: idx,
      })),
    },
  ]);
  return choice as number;
}

async function promptSubject(initial: string): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: "input",
      name: "value",
      message: "Edit subject (<=72 chars)",
      default: initial,
    },
  ]);
  return value as string;
}

async function promptBullets(initial: string[], limit: number): Promise<string[]> {
  const { value } = await inquirer.prompt([
    {
      type: "editor",
      name: "value",
      message: "Edit bullets (one per line)",
      default: initial.join("\n"),
    },
  ]);
  const lines = (value as string)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return sanitizeBullets(lines, limit);
}

async function confirmAbort(): Promise<boolean> {
  const { ok } = await inquirer.prompt([
    { type: "confirm", name: "ok", message: "Abort?", default: true },
  ]);
  return ok as boolean;
}

async function promptAction(): Promise<"accept" | "edit-subject" | "edit-bullets" | "regenerate" | "abort"> {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Choose action",
      choices: [
        { name: "Accept & commit", value: "accept" },
        { name: "Edit subject", value: "edit-subject" },
        { name: "Edit bullets", value: "edit-bullets" },
        { name: "Regenerate", value: "regenerate" },
        { name: "Abort", value: "abort" },
      ],
    },
  ]);
  return action as any;
}

async function commandStart(cwd: string, config: PiqnoteConfig, options: StartOptions) {
  const baseBranch = options.base || config.baseBranch || "main";
  const { base } = await inquirer.prompt([
    {
      type: "input",
      name: "base",
      message: "Base branch",
      default: baseBranch,
    },
  ]);
  const { name } = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "New branch name",
      validate: (v: string) => (v.trim().length ? true : "Enter branch name"),
    },
  ]);

  checkoutBranch(cwd, base);
  createBranch(cwd, name.trim());
  console.log(chalk.green(`Switched to new branch ${name.trim()} from ${base}.`));
}

async function commandFinish(cwd: string, config: PiqnoteConfig, options: FinishOptions) {
  const target = options.base || config.baseBranch || "main";
  pushCurrentBranch(cwd);
  checkoutBranch(cwd, target);
  console.log(chalk.green(`Pushed and switched back to ${target}.`));
}

async function collectDiff(cwd: string): Promise<{ diff: string; staged: boolean }> {
  const staged = hasStagedChanges(cwd);
  const stagedFiles = filterIgnored(cwd, staged ? getStagedFiles(cwd) : []);
  if (staged && stagedFiles.length) {
    return { diff: getDiffForFiles(cwd, stagedFiles, true), staged: true };
  }

  const unstaged = hasUnstagedChanges(cwd);
  const unstagedFiles = filterIgnored(cwd, unstaged ? getUnstagedFiles(cwd) : []);
  if (unstaged && unstagedFiles.length) {
    return { diff: getDiffForFiles(cwd, unstagedFiles, false), staged: false };
  }

  throw new Error("No changes to commit");
}

async function buildSuggestions(
  config: PiqnoteConfig,
  options: CommitOptions,
  insights: DiffInsights
): Promise<{ messages: string[]; raw: { subject: string; bullets: string[] }[] }> {
  const provider = getProvider(config, { offline: options.offline || config.offline });
  const request = {
    insights,
    language: config.language,
    style: config.commit?.style,
  };

  const scopeFallback = config.scope || insights.scope || "core";
  const maxAttempts = 3;
  const bulletLimit = config.commit?.maxBullets || 2;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    let responses;
    if (provider.generateMany) {
      responses = await provider.generateMany(request, 3);
    } else {
      responses = [await generateWithProvider(provider, request)];
    }

    const normalized = responses.map((r) => {
      const subject = normalizeSubject(r.subject, scopeFallback);
      const bullets = ensureBullets(r.bullets || [], insights.bulletPoints || [], bulletLimit);
      const formatted = formatCommit({ subject, bullets, insightsScope: insights.scope }, config);
      const validation = validateCommitContent(formatted.split("\n")[0], bullets, config);
      return { subject, bullets, formatted, validation };
    });

    const valid = normalized.filter((n) => n.validation.valid);
    if (valid.length) {
      return {
        messages: valid.map((v) => v.formatted),
        raw: valid.map((v) => ({ subject: v.subject, bullets: v.bullets })),
      };
    }

    const reason = normalized.flatMap((n) => n.validation.reasons)[0] || "Validation failed";
    console.log(chalk.yellow(`Regenerating suggestions (attempt ${attempt}/${maxAttempts}) due to: ${reason}`));
  }

  throw new Error("Unable to generate a valid semantic-release compatible commit message");
}

async function promptManualMessage(scopeFallback: string, insights: DiffInsights, config: PiqnoteConfig) {
  while (true) {
    const defaultSubject = `feat(${insights.scope || scopeFallback}): describe change`;
    const subjectInput = await promptSubject(defaultSubject);
    const normalized = normalizeSubject(subjectInput, scopeFallback);
    const bulletLimit = config.commit?.maxBullets || 2;
    const bullets = await promptBullets(insights.bulletPoints || [], bulletLimit);
    const validation = validateCommitContent(normalized, bullets, config);
    if (validation.valid) {
      return {
        subject: normalized,
        bullets,
        message: formatCommit({ subject: normalized, bullets, insightsScope: insights.scope }, config),
      };
    }
    console.log(chalk.yellow("Manual entry invalid:"));
    validation.reasons.slice(0, 3).forEach((r) => console.log(`- ${r}`));
  }
}

function renderScore(message: string, diff: string) {
  const insights = analyzeDiff(diff);
  const score = scoreCommit(message, insights);
  console.log(chalk.yellow(`Quality score: ${score.total}/100`));
  score.details.forEach((item) => {
    console.log(`${chalk.gray("-")} ${item.label}: ${item.points} (${item.reason})`);
  });
}

function readPackageVersion(cwd: string): string {
  try {
    const pkgPath = path.join(cwd, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function releasePreview(cwd: string) {
  // semantic-release has no official types; rely on runtime import
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const semanticRelease = require("semantic-release");
  const currentVersion = readPackageVersion(cwd);
  const result = await semanticRelease(
    {
      branches: ["main", "master"],
      dryRun: true,
      ci: false,
      plugins: [
        "@semantic-release/commit-analyzer",
        "@semantic-release/release-notes-generator",
      ],
    },
    { cwd }
  );

  if (!result || !result.nextRelease) {
    console.log(chalk.yellow("No release changes detected since last release."));
    return;
  }

  const { type, version } = result.nextRelease;
  type ReleaseCommit = {
    hash?: string;
    subject?: string;
    message?: string;
    commit?: { hash?: string; message?: string };
  };

  const commits: { hash: string; subject: string }[] = (result.commits || []).map((commit: ReleaseCommit) => ({
    hash: (commit.hash || commit.commit?.hash || "").slice(0, 7),
    subject:
      commit.subject ||
      commit.message?.split("\n")[0] ||
      commit.commit?.message?.split("\n")[0] ||
      "",
  }));

  console.log(chalk.blue.bold("Release preview (dry-run)"));
  console.log(`${chalk.gray("Current version:")} ${currentVersion}`);
  console.log(`${chalk.gray("Next version:")} ${chalk.green(version)} (${type})`);
  if (commits.length) {
    console.log(chalk.gray("Commits included:"));
    commits.forEach((c) => {
      const hash = c.hash ? `${c.hash} ` : "";
      console.log(`- ${hash}${c.subject}`.trim());
    });
  } else {
    console.log(chalk.gray("Commits included:"), "None detected");
  }
}

async function commandCommit(cwd: string, config: PiqnoteConfig, options: CommitOptions) {
  const { diff } = await collectDiff(cwd);
  const insights = analyzeDiff(diff);
  const scopeFallback = config.scope || insights.scope || "core";
  const bulletLimit = config.commit?.maxBullets || 2;
  let messages: string[] = [];
  let raw: { subject: string; bullets: string[] }[] = [];

  try {
    const built = await buildSuggestions(config, options, insights);
    messages = built.messages;
    raw = built.raw;
  } catch (err) {
    console.log(chalk.yellow("Automatic suggestions failed; switching to manual entry."));
    const manual = await promptManualMessage(scopeFallback, insights, config);
    messages = [manual.message];
    raw = [{ subject: manual.subject, bullets: manual.bullets }];
  }

  let selectedIndex = await pickSuggestion(messages);
  let message = messages[selectedIndex];
  let bullets = raw[selectedIndex].bullets;
  let subject = message.split("\n")[0];

  let loop = true;
  while (loop) {
    console.log("\n" + chalk.blue.bold("Suggestion:"));
    console.log(chalk.green(message));
    if (options.score) {
      renderScore(message, diff);
    }

    const action = await promptAction();

    if (action === "edit-subject") {
      subject = normalizeSubject(await promptSubject(subject), scopeFallback);
      message = formatCommit({ subject, bullets, insightsScope: insights.scope }, config);
      continue;
    }

    if (action === "edit-bullets") {
      bullets = await promptBullets(bullets, bulletLimit);
      message = formatCommit({ subject, bullets, insightsScope: insights.scope }, config);
      continue;
    }

    if (action === "regenerate") {
      try {
        const rebuilt = await buildSuggestions(config, options, insights);
        messages = rebuilt.messages;
        raw = rebuilt.raw;
        selectedIndex = await pickSuggestion(messages);
        message = messages[selectedIndex];
        bullets = raw[selectedIndex].bullets;
        subject = message.split("\n")[0];
        continue;
      } catch {
        const manual = await promptManualMessage(scopeFallback, insights, config);
        messages = [manual.message];
        raw = [{ subject: manual.subject, bullets: manual.bullets }];
        selectedIndex = 0;
        message = manual.message;
        bullets = manual.bullets;
        subject = manual.subject;
        continue;
      }
    }

    if (action === "abort") {
      const ok = await confirmAbort();
      if (ok) {
        console.log("Aborted.");
        return;
      }
      continue;
    }

    if (action === "accept") {
      const validation = validateCommitContent(subject, bullets, config);
      if (!validation.valid) {
        console.log(chalk.yellow("Commit message rejected:"));
        validation.reasons.slice(0, 3).forEach((r) => console.log(`- ${r}`));
        try {
          const rebuilt = await buildSuggestions(config, options, insights);
          messages = rebuilt.messages;
          raw = rebuilt.raw;
          selectedIndex = await pickSuggestion(messages);
          message = messages[selectedIndex];
          bullets = raw[selectedIndex].bullets;
          subject = message.split("\n")[0];
          continue;
        } catch {
          const manual = await promptManualMessage(scopeFallback, insights, config);
          messages = [manual.message];
          raw = [{ subject: manual.subject, bullets: manual.bullets }];
          selectedIndex = 0;
          message = manual.message;
          bullets = manual.bullets;
          subject = manual.subject;
          continue;
        }
      }
      stageAll(cwd);
      commitMessage(cwd, message);
      console.log(chalk.green("Commit created."));
      return;
    }
  }
}

async function main() {
  const currentVersion = readPackageVersion(process.cwd());
  const program = new Command();
  program
    .name("piqnote")
    .description("Piqnote CLI by PromethIQ - Git workflow assistant")
    .version(currentVersion, "-V, --version");

  program
    .command("start")
    .description("Create and switch to a new branch from base")
    .option("--base <branch>", "Base branch")
    .action(async (opts: StartOptions) => {
      const cwd = process.cwd();
      if (!isGitRepo(cwd)) {
        console.error("Not a git repository.");
        process.exit(1);
      }
      const config = loadConfig(cwd) || getDefaultConfig();
      try {
        await commandStart(cwd, config, opts);
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }
    });

  program
    .command("commit")
    .description("Generate high-quality commit message and commit")
    .option("--score", "Show quality score", false)
    .option("--offline", "Force offline provider", false)
    .action(async (opts: CommitOptions) => {
      const cwd = process.cwd();
      if (!isGitRepo(cwd)) {
        console.error("Not a git repository.");
        process.exit(1);
      }
      const config = loadConfig(cwd) || getDefaultConfig();
      try {
        await commandCommit(cwd, config, opts);
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }
    });

  program
    .command("finish")
    .description("Push current branch and switch back to main")
    .option("--base <branch>", "Base branch")
    .action(async (opts: FinishOptions) => {
      const cwd = process.cwd();
      if (!isGitRepo(cwd)) {
        console.error("Not a git repository.");
        process.exit(1);
      }
      const config = loadConfig(cwd) || getDefaultConfig();
      try {
        await commandFinish(cwd, config, opts);
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }
    });

  program
    .command("release")
    .description("Preview next semantic version (dry-run only)")
    .option("--dry-run", "Preview release without tagging or publishing", true)
    .action(async () => {
      const cwd = process.cwd();
      if (!isGitRepo(cwd)) {
        console.error("Not a git repository.");
        process.exit(1);
      }
      try {
        await releasePreview(cwd);
      } catch (e) {
        console.error("Release preview failed:", (e as Error).message || e);
        process.exit(1);
      }
    });

  program
    .command("config")
    .description("Set Piqnote configuration values")
    .option("--api-key <key>", "Set AI API key (token or env:NAME reference)")
    .option("--provider <provider>", "AI provider (github|openai|local|mock)", "github")
    .option("--model <model>", "Model identifier", "gpt-4o-mini")
    .action(async (opts: ConfigOptions) => {
      const cwd = process.cwd();
      const config = loadConfig(cwd) || getDefaultConfig();
      const allowedProviders = ["github", "openai", "local", "mock"] as const;
      const provider = (opts.provider || config.ai.provider || "github") as AiProviderName;

      if (!allowedProviders.includes(provider as typeof allowedProviders[number])) {
        console.error(`Unsupported provider: ${provider}. Choose from github|openai|local|mock.`);
        process.exit(1);
      }

      const model = opts.model || config.ai.model || "gpt-4o-mini";
      let apiKey = opts.apiKey;

      if (!apiKey) {
        if (provider === "github" && process.env.GITHUB_TOKEN) {
          apiKey = "env:GITHUB_TOKEN";
          console.log(chalk.gray("Detected GITHUB_TOKEN in environment; wiring it in config."));
        } else if (provider === "openai" && process.env.OPENAI_API_KEY) {
          apiKey = "env:OPENAI_API_KEY";
          console.log(chalk.gray("Detected OPENAI_API_KEY in environment; wiring it in config."));
        }
      }

      const nextAi: AiConfig = {
        ...config.ai,
        provider,
        model,
        apiKey: apiKey || config.ai.apiKey,
        endpoint:
          provider === "github"
            ? "https://models.inference.ai.azure.com/chat/completions"
            : config.ai.endpoint,
        temperature: provider === "github" ? 0.2 : config.ai.temperature,
        maxTokens: provider === "github" ? 120 : config.ai.maxTokens,
      };

      if (!nextAi.apiKey && (provider === "github" || provider === "openai")) {
        console.warn(chalk.yellow("No API key provided; provider will fall back to heuristic mode until a token is set."));
      }

      saveConfig(cwd, { ai: nextAi, offline: false });
      console.log(chalk.green(`Saved provider=${provider}, model=${model} to .piqnoterc.`));
    });

  program.parse(process.argv);
}

main().catch((error) => {
  console.error("Piqnote failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
