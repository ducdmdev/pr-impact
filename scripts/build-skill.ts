import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const systemPrompt = readFileSync(resolve(rootDir, 'templates/system-prompt.md'), 'utf-8');
const reportTemplate = readFileSync(resolve(rootDir, 'templates/report-template.md'), 'utf-8');

const skillMd = `---
name: pr-impact
description: Analyze PR impact — breaking changes, test coverage gaps, doc staleness, impact graph, and risk score
arguments:
  - name: base
    description: Base branch to compare against (default: main)
    required: false
  - name: head
    description: Head branch to analyze (default: HEAD)
    required: false
---

${systemPrompt}

## Your Task

Analyze the PR comparing branch \`$ARGUMENTS\` in the current repository. If no arguments provided, compare \`main\` to \`HEAD\`.

Parse the arguments: first argument is \`base\` branch, second is \`head\` branch.

Use the pr-impact MCP tools to inspect the repository. Follow all 6 analysis steps. Produce the report using this exact template:

${reportTemplate}
`;

writeFileSync(resolve(rootDir, 'packages/skill/skill.md'), skillMd, 'utf-8');

console.log('Generated packages/skill/skill.md');
