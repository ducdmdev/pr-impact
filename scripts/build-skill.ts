import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const systemPrompt = readFileSync(resolve(rootDir, 'templates/system-prompt.md'), 'utf-8');
const reportTemplate = readFileSync(resolve(rootDir, 'templates/report-template.md'), 'utf-8');

const skillMd = `---
name: pr-impact
description: Analyze a pull request for breaking changes, test coverage gaps, stale documentation, and import-graph impact. Produces a weighted 0-100 risk score with a structured Markdown report. Use when reviewing PRs or assessing change scope before merging.
user-invocable: true
argument-hint: "[base-branch] [head-branch]"
---

${systemPrompt}

## Preconditions

Before starting analysis, verify the following. If any check fails, ask the user to resolve it before proceeding.

### 1. Git repository

Run \`git rev-parse --is-inside-work-tree\` to confirm you are inside a git repository. If not, ask the user which repository to analyze.

### 2. Determine base and head branches

Check \`$ARGUMENTS\` for branch arguments (first = base, second = head).

If **no arguments** are provided:
1. Run \`git branch --show-current\` to get the current branch.
2. If the current branch is \`main\` or \`master\` (i.e., there is no feature branch checked out), ask the user:
   - "Which branches should I compare? Please provide a base branch and head branch, or a PR number."
3. If a feature branch is checked out, default to \`base=main\` and \`head=HEAD\`. If \`main\` does not exist, try \`master\`. If neither exists, ask the user for the base branch.

If **one argument** is provided:
- If it looks like a PR number (digits only), run \`gh pr view <number> --json baseRefName,headRefName\` to resolve both branches. If \`gh\` is not authenticated or the command fails, ask the user to either run \`gh auth login\` or provide branch names directly.
- Otherwise treat it as the base branch and default head to \`HEAD\`.

### 3. Validate branches exist

Run \`git rev-parse --verify <branch>\` for both base and head. If either fails, ask the user to confirm the branch name or fetch from remote first.

### 4. Check for changes

Run \`git diff --stat <base>...<head>\` to verify there are actual changes. If the diff is empty, inform the user that there are no changes between the two branches and stop.

Once all preconditions pass, proceed with the analysis.

## Your Task

Use the pr-impact MCP tools to inspect the repository. Follow all 6 analysis steps. Produce the report using this exact template:

${reportTemplate}
`;

const outDir = resolve(rootDir, 'packages/skill/skills/pr-impact');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'SKILL.md'), skillMd, 'utf-8');

console.log('Generated packages/skill/skills/pr-impact/SKILL.md');
