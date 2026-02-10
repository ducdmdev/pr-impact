import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { analyzePR, formatMarkdown } from '@pr-impact/core';
import { resolve } from 'path';
import { detectCIEnv } from '../github/ci-env.js';
import { postOrUpdateComment } from '../github/comment-poster.js';

export function registerCommentCommand(program: Command): void {
  program
    .command('comment')
    .description('Run analysis and post/update a PR comment on GitHub')
    .argument('[base]', 'Base branch (default: auto-detect main/master)')
    .argument('[head]', 'Head branch (default: HEAD)')
    .option('--repo <path>', 'Repository path', process.cwd())
    .option('--pr <number>', 'PR number (default: auto-detect from CI)')
    .option('--github-repo <owner/repo>', 'GitHub repository (default: auto-detect from CI)')
    .option('--token <token>', 'GitHub token (default: GITHUB_TOKEN env var)')
    .action(async (base, head, opts) => {
      const spinner = ora({ text: 'Analyzing PR impact...', stream: process.stderr }).start();

      try {
        // Resolve GitHub config
        const token = opts.token ?? process.env.GITHUB_TOKEN;
        if (!token) {
          spinner.fail('Missing GitHub token');
          console.error(chalk.red('Provide --token or set GITHUB_TOKEN environment variable'));
          process.exit(2);
          return;
        }

        let prNumber: string | undefined = opts.pr;
        let githubRepo: string | undefined = opts.githubRepo;

        if (!prNumber || !githubRepo) {
          const ciEnv = detectCIEnv();
          if (ciEnv) {
            prNumber = prNumber ?? ciEnv.prNumber;
            githubRepo = githubRepo ?? ciEnv.repo;
          }
        }

        if (!prNumber) {
          spinner.fail('Cannot determine PR number');
          console.error(chalk.red('Provide --pr <number> or run in a supported CI environment'));
          process.exit(2);
          return;
        }

        if (!githubRepo) {
          spinner.fail('Cannot determine GitHub repository');
          console.error(chalk.red('Provide --github-repo <owner/repo> or run in a supported CI environment'));
          process.exit(2);
          return;
        }

        // Run analysis
        const analysis = await analyzePR({
          repoPath: resolve(opts.repo),
          baseBranch: base,
          headBranch: head,
        });

        spinner.text = 'Posting comment...';

        const report = formatMarkdown(analysis);
        const commentUrl = await postOrUpdateComment({
          token,
          repo: githubRepo,
          prNumber,
          body: report,
        });

        spinner.succeed('Comment posted');
        console.log(chalk.green(commentUrl));
      } catch (err) {
        spinner.fail('Failed to post comment');
        console.error(
          chalk.red(err instanceof Error ? err.message : String(err)),
        );
        process.exit(2);
      }
    });
}
