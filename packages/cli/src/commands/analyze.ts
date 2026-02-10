import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { analyzePR, formatMarkdown, formatJSON } from '@pr-impact/core';
import { writeFile } from 'fs/promises';
import { resolve } from 'path';

export function registerAnalyzeCommand(program: Command): void {
  program
    .command('analyze')
    .description('Run full PR impact analysis')
    .argument('[base]', 'Base branch (default: auto-detect main/master)')
    .argument('[head]', 'Head branch (default: HEAD)')
    .option('--format <type>', 'Output format: md | json', 'md')
    .option('--output <file>', 'Write to file instead of stdout')
    .option('--repo <path>', 'Repository path', process.cwd())
    .option('--no-breaking', 'Skip breaking change analysis')
    .option('--no-coverage', 'Skip test coverage analysis')
    .option('--no-docs', 'Skip doc staleness check')
    .action(async (base, head, opts) => {
      const spinner = ora({ text: 'Analyzing PR impact...', stream: process.stderr }).start();
      try {
        const analysis = await analyzePR({
          repoPath: resolve(opts.repo),
          baseBranch: base,
          headBranch: head,
          skipBreaking: opts.breaking === false,
          skipCoverage: opts.coverage === false,
          skipDocs: opts.docs === false,
        });
        spinner.stop();

        const output =
          opts.format === 'json'
            ? formatJSON(analysis)
            : formatMarkdown(analysis);

        if (opts.output) {
          await writeFile(resolve(opts.output), output);
          console.log(chalk.green(`Report written to ${opts.output}`));
        } else {
          console.log(output);
        }
      } catch (err) {
        spinner.fail('Analysis failed');
        console.error(
          chalk.red(err instanceof Error ? err.message : String(err)),
        );
        process.exit(2);
      }
    });
}
