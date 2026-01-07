# Piqnote CLI by PromethIQ

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/promethiq/piqnote/ci.yml?label=ci)](https://github.com/promethiq/piqnote/actions)
[![NPM Version](https://img.shields.io/npm/v/piqnote.svg)](https://www.npmjs.com/package/piqnote)

Piqnote is an AGPL-licensed, frontend-aware Git commit message generator by PromethIQ. It supports Conventional Commits, interactive review, commit quality scoring, offline heuristics, and optional auto-commit workflows.

## Features
- Generates concise subjects (<=72 chars) with optional bullets (staged files fallback)
- Conventional Commits with configurable scope
- Interactive menu: Edit subject, Edit full message, Regenerate, Accept & commit, Accept & stage, Skip
- Commit quality scoring
- Branch selection and new branch creation before commit
- Offline/local/mock providers with AI abstraction (OpenAI/local/mock)
- Works on staged changes via `git diff --staged`
- Auto-commit mode (`--auto`) and dry-run mode (`--dry-run`)

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
git add .
piqnote --interactive --score
```

CLI options:
- `--interactive` / `--no-interactive`
- `--auto` commit automatically to current branch
- `--dry-run` show suggestions only, no commit
- `--score` show quality score breakdown
- `--offline` force offline/mock provider
- `--help` show all commands and options

Non-interactive examples:
```bash
piqnote --no-interactive
piqnote --auto --score
piqnote --auto --dry-run
```

Interactive workflow actions:
- Edit subject (inline)
- Edit full message (editor)
- Regenerate suggestion
- Accept and stage only
- Accept and commit (choose branch or create new)
- Skip

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
- Semantic Versioning (semver), starting at 0.1.0
- CHANGELOG maintained by CI via release-please
- GitHub Actions pipeline builds, lints, tests, and can publish on tagged releases

## CI/CD
- Install dependencies
- TypeScript lint/build
- Tests
- Release automation to update CHANGELOG and create GitHub releases (optional npm publish with token)

## License and Branding
- License: AGPL-3.0 (see [LICENSE](LICENSE))
- Project: Piqnote - by PromethIQ
- Maintainer: Adam Kudlík