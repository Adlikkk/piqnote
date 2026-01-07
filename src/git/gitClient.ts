import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function runGit(command: string, cwd: string): string {
  try {
    return execSync(`git ${command}`, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Git command failed: ${message}`);
  }
}

export function isGitRepo(cwd: string): boolean {
  try {
    runGit("rev-parse --is-inside-work-tree", cwd);
    return true;
  } catch {
    return false;
  }
}

export function hasStagedChanges(cwd: string): boolean {
  try {
    const output = runGit("diff --cached --name-only", cwd);
    return output.length > 0;
  } catch {
    return false;
  }
}

export function getStagedDiff(cwd: string): string {
  return runGit("diff --cached", cwd);
}

export function getStagedFiles(cwd: string): string[] {
  try {
    const output = runGit("diff --cached --name-only", cwd);
    if (!output) return [];
    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function stageAll(cwd: string): void {
  runGit("add -A", cwd);
}

export function commitMessage(cwd: string, message: string): void {
  const tempDir = fs.mkdtempSync(path.join(cwd, ".piqnote-"));
  const filePath = path.join(tempDir, "message.txt");
  fs.writeFileSync(filePath, message, "utf-8");
  try {
    runGit(`commit -F "${filePath}"`, cwd);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
    }
  }
}

export function getBranches(cwd: string): string[] {
  try {
    const output = runGit("branch --list --format='%(refname:short)'", cwd);
    return output
      .split("\n")
      .map((b) => b.replace(/'/g, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function getCurrentBranch(cwd: string): string {
  try {
    const name = runGit("rev-parse --abbrev-ref HEAD", cwd);
    if (name && name !== "HEAD") return name;
  } catch {
    /* fallthrough */
  }
  return "main";
}

export function checkoutBranch(cwd: string, branch: string): void {
  runGit(`checkout ${branch}`, cwd);
}

export function createBranch(cwd: string, branch: string): void {
  runGit(`checkout -b ${branch}`, cwd);
}
