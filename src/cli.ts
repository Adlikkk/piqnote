#!/usr/bin/env node
import { Command } from "commander";
import inquirer from "inquirer";
import chalk from "chalk";
import { loadConfig, getDefaultConfig } from "./config/loader";
import { PiqnoteConfig } from "./config/types";
import { analyzeDiff } from "./analyzer/diffAnalyzer";
import { scoreCommit } from "./analyzer/scorer";
import { formatCommit } from "./formatter/commitFormatter";
import { getProvider, generateWithProvider } from "./ai/factory";
import {
  getStagedDiff,
  isGitRepo,
  hasStagedChanges,
  getStagedFiles,
  stageAll,
  commitMessage,
  getBranches,
  getCurrentBranch,
  checkoutBranch,
  createBranch,
} from "./git/gitClient";

interface CliOptions {
  interactive: boolean;
  score: boolean;
  offline: boolean;
  auto: boolean;
  dryRun: boolean;
}

type ActionChoice =
  | "accept-commit"
  | "accept-stage"
  | "edit-subject"
  | "edit-full"
  | "regenerate"
  | "skip";

function ensureBullets(responseBullets: string[] | undefined, stagedFiles: string[]): string[] {
  if (responseBullets && responseBullets.length) return responseBullets;
  return stagedFiles.slice(0, 5).map((file) => file);
}

async function promptAction(): Promise<ActionChoice> {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What do you want to do?",
      choices: [
        { name: "Accept & commit", value: "accept-commit" },
        { name: "Accept & stage only", value: "accept-stage" },
        { name: "Edit subject", value: "edit-subject" },
        { name: "Edit full message", value: "edit-full" },
        { name: "Regenerate", value: "regenerate" },
        { name: "Skip", value: "skip" },
      ],
    },
  ]);
  return action as ActionChoice;
}

async function promptSubjectEdit(subject: string): Promise<string> {
  const { edited } = await inquirer.prompt([
    {
      type: "input",
      name: "edited",
      default: subject,
      message: "Edit subject (<=72 chars)",
    },
  ]);
  return edited as string;
}

async function promptFullEdit(initial: string): Promise<string> {
  const { edited } = await inquirer.prompt([
    {
      type: "editor",
      name: "edited",
      default: initial,
      message: "Edit full commit message",
    },
  ]);
  return edited as string;
}

async function promptBranch(cwd: string): Promise<string> {
  const branches = getBranches(cwd);
  const current = getCurrentBranch(cwd);
  const baseChoices = branches
    .filter((b) => b !== current)
    .map((b) => ({ name: b, value: b }));

  const choices = [
    { name: `(current) ${current}`, value: current },
    ...baseChoices,
    { name: "Create new branch", value: "__create__" },
  ];

  const { branch } = await inquirer.prompt([
    {
      type: "list",
      name: "branch",
      message: "Select branch for commit",
      default: current,
      choices,
    },
  ]);

  if (branch === "__create__") {
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "New branch name",
        validate: (val: string) => (val && val.trim().length > 0 ? true : "Enter a branch name"),
      },
    ]);
    createBranch(cwd, name.trim());
    return name.trim();
  }

  if (branch !== current) {
    checkoutBranch(cwd, branch);
  }

  return branch as string;
}

function renderSuggestion(message: string, showScore: boolean, diff: string) {
  console.log("\n" + chalk.blue.bold("Piqnote suggestion:"));
  console.log(chalk.green(message));

  if (showScore) {
    const insights = analyzeDiff(diff);
    const score = scoreCommit(message, insights);
    console.log("\n" + chalk.yellow(`Quality score: ${score.total}/100`));
    score.details.forEach((item) => {
      const label = chalk.gray("-");
      console.log(`${label} ${item.label}: ${item.points} (${item.reason})`);
    });
  }
}

function formatWithFallback(
  subject: string,
  bullets: string[] | undefined,
  insightsScope: string | undefined,
  config: PiqnoteConfig,
  stagedFiles: string[]
): string {
  const mergedBullets = ensureBullets(bullets, stagedFiles);
  return formatCommit({ subject, bullets: mergedBullets, insightsScope }, config);
}

async function handleCommit(cwd: string, message: string, dryRun: boolean) {
  if (dryRun) {
    console.log(chalk.yellow("Dry-run: commit not created."));
    return;
  }
  stageAll(cwd);
  commitMessage(cwd, message);
  console.log(chalk.green("Commit created."));
}

async function autoFlow(cwd: string, message: string, options: CliOptions, diff: string) {
  renderSuggestion(message, options.score, diff);
  await handleCommit(cwd, message, options.dryRun);
}

async function interactiveFlow(
  cwd: string,
  config: PiqnoteConfig,
  options: CliOptions,
  diff: string,
  providerInput: {
    subject: string;
    bullets: string[];
    insightsScope?: string;
    regenerate: () => Promise<{ subject: string; bullets: string[] }>;
  }
) {
  let message = formatWithFallback(
    providerInput.subject,
    providerInput.bullets,
    providerInput.insightsScope,
    config,
    getStagedFiles(cwd)
  );

  let loop = true;
  while (loop) {
    renderSuggestion(message, options.score, diff);
    const action = await promptAction();

    if (action === "edit-subject") {
      const subject = message.split("\n")[0];
      const edited = await promptSubjectEdit(subject);
      const rest = message.split("\n").slice(1);
      message = [edited, ...rest].join("\n");
      continue;
    }

    if (action === "edit-full") {
      message = await promptFullEdit(message);
      continue;
    }

    if (action === "regenerate") {
      const next = await providerInput.regenerate();
      message = formatWithFallback(next.subject, next.bullets, providerInput.insightsScope, config, getStagedFiles(cwd));
      continue;
    }

    if (action === "accept-stage") {
      stageAll(cwd);
      console.log(chalk.green("Staged changes updated."));
      loop = false;
      continue;
    }

    if (action === "accept-commit") {
      const branch = await promptBranch(cwd);
      console.log(chalk.gray(`Using branch: ${branch}`));
      await handleCommit(cwd, message, options.dryRun);
      loop = false;
      continue;
    }

    if (action === "skip") {
      console.log("Skipped committing.");
      loop = false;
      continue;
    }
  }
}

async function main() {
  const program = new Command();
  program
    .name("piqnote")
    .description("Piqnote CLI by PromethIQ - generate commit messages")
    .option("-i, --interactive", "Review interactively")
    .option("--no-interactive", "Disable interactive review")
    .option("--auto", "Commit automatically to current branch", false)
    .option("--dry-run", "Show suggestions only; no commit", false)
    .option("--score", "Show commit quality score", false)
    .option("--offline", "Use offline heuristics", false)
    .version("0.1.0");

  program.parse(process.argv);
  const raw = program.opts();
  const options: CliOptions = {
    interactive: raw.noInteractive ? false : raw.interactive ?? true,
    score: Boolean(raw.score),
    offline: Boolean(raw.offline),
    auto: Boolean(raw.auto),
    dryRun: Boolean(raw.dryRun),
  };

  const cwd = process.cwd();
  if (!isGitRepo(cwd)) {
    console.error("Piqnote: not a git repository.");
    process.exit(1);
  }

  if (!hasStagedChanges(cwd)) {
    console.error("Piqnote: no staged changes. Stage files first with 'git add'.");
    process.exit(1);
  }

  const diff = getStagedDiff(cwd);
  const config = loadConfig(cwd) || getDefaultConfig();
  const insights = analyzeDiff(diff);
  const provider = getProvider(config, { offline: options.offline || config.offline });
  const stagedFiles = getStagedFiles(cwd);

  const generate = async () => {
    const res = await generateWithProvider(provider, {
      diff,
      insights,
      language: config.language,
      style: config.style,
    });
    return res;
  };

  const initial = await generate();
  const formattedInitial = formatWithFallback(initial.subject, initial.bullets, insights.scope, config, stagedFiles);

  if (!options.interactive || options.auto) {
    await autoFlow(cwd, formattedInitial, options, diff);
    return;
  }

  await interactiveFlow(cwd, config, options, diff, {
    subject: initial.subject,
    bullets: ensureBullets(initial.bullets, stagedFiles),
    insightsScope: insights.scope,
    regenerate: async () => {
      const next = await generate();
      return {
        subject: next.subject,
        bullets: ensureBullets(next.bullets, getStagedFiles(cwd)),
      };
    },
  });
}

main().catch((error) => {
  console.error("Piqnote failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
