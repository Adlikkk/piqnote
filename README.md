# Piqnote CLI by PromethIQ

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/promethiq/piqnote/ci.yml?label=ci)](https://github.com/Adlikkk/piqnote/actions)
[![NPM Version](https://img.shields.io/npm/v/piqnote.svg)](https://www.npmjs.com/package/piqnote)

Piqnote is an AGPL-licensed, frontend-aware Git commit message generator by PromethIQ. It supports Conventional Commits, interactive review, commit quality scoring, offline heuristics, and optional auto-commit workflows.

## Features
- Structured commit workflow with `start`, `commit`, and `finish` commands
- Conventional Commits with configurable scope and max 2 concise bullets
- Deterministic multi-suggestion AI (OpenAI/local/mock) with offline fallback
- Commit quality scoring and interactive edit/regenerate loop
- Git-aware filtering (respects .gitignore; avoids noisy artifacts)
- Branch creation from a chosen base and push-back finish step

## Installation
```bash
git clone https://github.com/promethiq/piqnote.git
cd piqnote
npm install
npm run build
npm install -g .
```

## Usage
```bash
# Start a feature branch from main
piqnote start --base main

# Generate, edit, and apply an AI-assisted commit
piqnote commit --score

# Push and return to main
piqnote finish --base main

# Preview the next semantic version (no tags/releases)
piqnote release --dry-run

# Set your OpenAI API key and switch provider to openai
piqnote config --api-key sk-...
```

Common flags:
- `--score` show quality score breakdown
- `--offline` force offline/mock provider
- `--base <branch>` choose a base branch for start/finish
- `--dry-run` required for release preview (safe local run)
- `--help` show all commands and options

## Configuration
Create a `.piqnoterc` in your repo root:
```json
{
  "style": "conventional",
  "scope": "web",
  "maxSubjectLength": 72,
  "language": "en",
  "bulletPrefix": "-",
  "provider": "mock",
  "offline": false
}
```

Environment (optional for OpenAI provider):
- OPENAI_API_KEY
- OPENAI_MODEL (default: gpt-4o-mini)
- OPENAI_BASE_URL (optional)

## Contribution Workflow
- Always branch from `main` (use `piqnote start --base main <feature-branch>`).
- Keep work in small, reviewable commits (`piqnote commit --score`).
- Push your branch and open a Pull Request into `main`.
- Required status checks must pass: `Lint`, `Build`, `Test`.
- Linear history is enforced on `main` (use squash or rebase before merge).
- No direct pushes or force pushes to `main`.
- Release automation (semantic-release) manages GitHub releases, tags, and npm publishing; tags pushed by automation are allowed.

## Commit Rules (enforced)
- Conventional Commits only; scopes required for `feat` and `fix` (auto-derived when possible).
- Subject: imperative, ≤72 chars, no trailing punctuation, and no vague terms ("update", "misc", "stuff").
- BREAKING CHANGE → major; `feat` → minor; `fix` → patch; `chore/docs/refactor` → no release.
- Bullets optional, max 2, must add semantic value; never list files, paths, or build artifacts.
- Messages mentioning gitignored paths (node_modules, dist, build, coverage, etc.) are rejected.

## Branch Protection Policy (GitHub)
Configure in **Settings → Branches → Branch protection rules → Add rule** for `main`:
- Require a pull request before merging (no direct pushes).
- Require status checks to pass before merging: `Lint`, `Build`, `Test`.
- Require linear history.
- Do not allow force pushes or deletions.
- Allow GitHub Actions and semantic-release/release-please automation to create tags (branch protection does not block tags by default).

Reference: [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches).

## Project Structure
```
src/
  cli.ts
  ai/
  analyzer/
  formatter/
  git/
  config/
.github/workflows/ci.yml
.piqnoterc
CHANGELOG.md
LICENSE
README.md
```

## Versioning and Releases
- Semantic-release drives semantic versioning from Conventional Commits (no manual bumps).
- Package version is kept at `0.0.0-development`; semantic-release writes real versions to GitHub releases and npm.
- GitHub releases and npm publish run automatically on push to `main` via `.github/workflows/release.yml`.
- No local CHANGELOG is required; release notes are generated per release.

## CI/CD
- Install dependencies
- TypeScript lint/build
- Tests
- Release automation: semantic-release creates GitHub releases and publishes to npm when `GITHUB_TOKEN` and `NPM_TOKEN` are available

## License and Branding
- License: AGPL-3.0 (see [LICENSE](LICENSE))
- Project: Piqnote - by PromethIQ
- Maintainer: Adam Kudlík