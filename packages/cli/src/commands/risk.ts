import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { analyzePR } from '@pr-impact/core';
import type { RiskAssessment, RiskFactor } from '@pr-impact/core';
import { resolve } from 'path';

function levelColor(level: RiskAssessment['level']): (text: string) => string {
  switch (level) {
    case 'low':
      return chalk.green;
    case 'medium':
      return chalk.yellow;
    case 'high':
      return chalk.red;
    case 'critical':
      return chalk.red.bold;
  }
}

function formatFactorLine(factor: RiskFactor): string {
  const weighted = (factor.score * factor.weight).toFixed(1);
  const bar = '█'.repeat(Math.round(factor.score / 10)) +
    '░'.repeat(10 - Math.round(factor.score / 10));
  return `  ${bar}  ${factor.name.padEnd(24)} ${String(factor.score).padStart(3)}/100  (weight: ${factor.weight}, contribution: ${weighted})`;
}

function formatTextOutput(risk: RiskAssessment): string {
  const colorFn = levelColor(risk.level);
  const lines: string[] = [];

  lines.push(chalk.bold('Risk Assessment'));
  lines.push('');
  lines.push(
    `  Score: ${colorFn(String(risk.score) + '/100')}  Level: ${colorFn(risk.level.toUpperCase())}`,
  );
  lines.push('');

  if (risk.factors.length > 0) {
    lines.push(chalk.bold('Factor Breakdown'));
    lines.push('');
    for (const factor of risk.factors) {
      lines.push(formatFactorLine(factor));
      lines.push(`  ${chalk.dim(factor.description)}`);
      if (factor.details && factor.details.length > 0) {
        for (const detail of factor.details) {
          lines.push(`    ${chalk.dim('- ' + detail)}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatJsonOutput(risk: RiskAssessment): string {
  return JSON.stringify(risk, null, 2);
}

export function registerRiskCommand(program: Command): void {
  program
    .command('risk')
    .description('Calculate and display PR risk score')
    .argument('[base]', 'Base branch (default: auto-detect main/master)')
    .argument('[head]', 'Head branch (default: HEAD)')
    .option('--threshold <n>', 'Fail if risk score >= threshold', parseFloat)
    .option('--format <type>', 'Output format: text | json', 'text')
    .option('--repo <path>', 'Repository path', process.cwd())
    .action(async (base, head, opts) => {
      const spinner = ora({ text: 'Calculating risk score...', stream: process.stderr }).start();
      try {
        const analysis = await analyzePR({
          repoPath: resolve(opts.repo),
          baseBranch: base,
          headBranch: head,
        });

        spinner.stop();

        const { riskScore } = analysis;

        if (opts.format === 'json') {
          console.log(formatJsonOutput(riskScore));
        } else {
          console.log(formatTextOutput(riskScore));
        }

        // If threshold is set and score meets or exceeds it, exit with code 1
        if (opts.threshold !== undefined && riskScore.score >= opts.threshold) {
          const colorFn = levelColor(riskScore.level);
          console.log(
            colorFn(
              `\nRisk score ${riskScore.score} meets or exceeds threshold ${opts.threshold}`,
            ),
          );
          process.exit(1);
        }
      } catch (err) {
        spinner.fail('Risk calculation failed');
        console.error(
          chalk.red(err instanceof Error ? err.message : String(err)),
        );
        process.exit(1);
      }
    });
}
