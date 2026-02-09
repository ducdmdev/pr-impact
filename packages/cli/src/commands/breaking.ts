import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { parseDiff, detectBreakingChanges } from '@pr-impact/core';
import type { BreakingChange } from '@pr-impact/core';
import { resolve } from 'path';

const SEVERITY_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function severityColor(severity: BreakingChange['severity']): string {
  switch (severity) {
    case 'high':
      return chalk.red(severity);
    case 'medium':
      return chalk.yellow(severity);
    case 'low':
      return chalk.green(severity);
  }
}

function formatMarkdownTable(changes: BreakingChange[]): string {
  const lines: string[] = [];
  lines.push('# Breaking Changes\n');
  lines.push(`Found **${changes.length}** breaking change${changes.length === 1 ? '' : 's'}.\n`);
  lines.push('| File | Symbol | Type | Severity | Consumers |');
  lines.push('|------|--------|------|----------|-----------|');

  for (const change of changes) {
    const consumers = change.consumers.length > 0 ? change.consumers.join(', ') : 'none';
    lines.push(
      `| ${change.filePath} | ${change.symbolName} | ${change.type} | ${change.severity} | ${consumers} |`,
    );
  }

  return lines.join('\n');
}

function formatText(changes: BreakingChange[]): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`Found ${changes.length} breaking change${changes.length === 1 ? '' : 's'}:\n`));

  for (const change of changes) {
    lines.push(
      `  ${severityColor(change.severity)}  ${chalk.bold(change.symbolName)} (${change.type})`,
    );
    lines.push(`       ${chalk.dim(change.filePath)}`);
    if (change.before) {
      lines.push(`       ${chalk.red('- ' + change.before)}`);
    }
    if (change.after) {
      lines.push(`       ${chalk.green('+ ' + change.after)}`);
    }
    if (change.consumers.length > 0) {
      lines.push(`       ${chalk.dim('Consumers:')} ${change.consumers.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function registerBreakingCommand(program: Command): void {
  program
    .command('breaking')
    .description('Detect breaking changes in the PR')
    .argument('[base]', 'Base branch', undefined)
    .argument('[head]', 'Head branch', undefined)
    .option('--severity <level>', 'Minimum severity: low | medium | high', 'low')
    .option('--format <type>', 'Output format: md | json', 'md')
    .option('--repo <path>', 'Repository path', process.cwd())
    .action(async (base, head, opts) => {
      const spinner = ora({ text: 'Detecting breaking changes...', stream: process.stderr }).start();
      try {
        const repoPath = resolve(opts.repo);
        const baseBranch = base ?? 'main';
        const headBranch = head ?? 'HEAD';

        const changedFiles = await parseDiff(repoPath, baseBranch, headBranch);
        const allBreaking = await detectBreakingChanges(
          repoPath,
          baseBranch,
          headBranch,
          changedFiles,
        );

        const minSeverity = SEVERITY_ORDER[opts.severity] ?? 0;
        const filtered = allBreaking.filter(
          (change) => SEVERITY_ORDER[change.severity] >= minSeverity,
        );

        spinner.stop();

        if (filtered.length === 0) {
          console.log(
            chalk.green('No breaking changes detected at severity >= ' + opts.severity),
          );
          return;
        }

        switch (opts.format) {
          case 'json':
            console.log(JSON.stringify(filtered, null, 2));
            break;
          case 'md':
            console.log(formatMarkdownTable(filtered));
            break;
          default:
            console.log(formatText(filtered));
            break;
        }

        // Exit with code 1 if breaking changes found at the specified severity
        process.exit(1);
      } catch (err) {
        spinner.fail('Breaking change detection failed');
        console.error(
          chalk.red(err instanceof Error ? err.message : String(err)),
        );
        process.exit(1);
      }
    });
}
