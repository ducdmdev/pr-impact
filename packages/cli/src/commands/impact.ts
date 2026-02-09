import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { parseDiff, buildImpactGraph } from '@pr-impact/core';
import type { ImpactGraph, ImpactEdge, ChangedFile } from '@pr-impact/core';
import { resolve } from 'path';

function formatTreeOutput(graph: ImpactGraph): string {
  const lines: string[] = [];

  lines.push(chalk.bold('Impact Graph'));
  lines.push('');

  if (graph.directlyChanged.length > 0) {
    lines.push(chalk.bold('Directly Changed'));
    for (let i = 0; i < graph.directlyChanged.length; i++) {
      const isLast = i === graph.directlyChanged.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      const file = graph.directlyChanged[i];
      const dependents = graph.edges.filter((e) => e.from === file);

      lines.push(`  ${prefix}${chalk.cyan(file)}`);

      if (dependents.length > 0) {
        const indent = isLast ? '    ' : '│   ';
        for (let j = 0; j < dependents.length; j++) {
          const depIsLast = j === dependents.length - 1;
          const depPrefix = depIsLast ? '└── ' : '├── ';
          lines.push(
            `  ${indent}${depPrefix}${chalk.dim(dependents[j].to)} ${chalk.dim('(' + dependents[j].type + ')')}`,
          );
        }
      }
    }
  }

  if (graph.indirectlyAffected.length > 0) {
    lines.push('');
    lines.push(chalk.bold('Indirectly Affected'));
    for (let i = 0; i < graph.indirectlyAffected.length; i++) {
      const isLast = i === graph.indirectlyAffected.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      lines.push(`  ${prefix}${chalk.yellow(graph.indirectlyAffected[i])}`);
    }
  }

  lines.push('');
  lines.push(
    chalk.dim(
      `${graph.directlyChanged.length} directly changed, ` +
        `${graph.indirectlyAffected.length} indirectly affected, ` +
        `${graph.edges.length} edge${graph.edges.length === 1 ? '' : 's'}`,
    ),
  );

  return lines.join('\n');
}

function formatDotOutput(graph: ImpactGraph): string {
  const lines: string[] = [];
  lines.push('digraph impact {');
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box, style=filled];');
  lines.push('');

  // Style directly changed nodes
  for (const file of graph.directlyChanged) {
    lines.push(`  "${file}" [fillcolor="#ff6b6b", fontcolor="white"];`);
  }

  // Style indirectly affected nodes
  for (const file of graph.indirectlyAffected) {
    lines.push(`  "${file}" [fillcolor="#ffd93d"];`);
  }

  lines.push('');

  // Edges
  for (const edge of graph.edges) {
    lines.push(`  "${edge.from}" -> "${edge.to}" [label="${edge.type}"];`);
  }

  lines.push('}');
  return lines.join('\n');
}

function formatJsonOutput(graph: ImpactGraph): string {
  return JSON.stringify(graph, null, 2);
}

export function registerImpactCommand(program: Command): void {
  program
    .command('impact')
    .description('Build and display the impact graph')
    .argument('[file]', 'Specific file to trace impact for', undefined)
    .option('--depth <n>', 'Max dependency depth', parseInt, 3)
    .option('--format <type>', 'Output format: text | json | dot', 'text')
    .option('--repo <path>', 'Repository path', process.cwd())
    .action(async (file, opts) => {
      const spinner = ora({ text: 'Building impact graph...', stream: process.stderr }).start();
      try {
        const repoPath = resolve(opts.repo);
        const depth = opts.depth;

        let changedFiles: ChangedFile[];

        if (file) {
          // When a specific file is provided, create a synthetic ChangedFile
          changedFiles = [
            {
              path: file,
              status: 'modified',
              additions: 0,
              deletions: 0,
              language: '',
              category: 'source',
            },
          ];
        } else {
          // Default: parse diff between main/master and HEAD
          changedFiles = await parseDiff(repoPath, 'main', 'HEAD').catch(
            () => parseDiff(repoPath, 'master', 'HEAD'),
          );
        }

        const graph = await buildImpactGraph(repoPath, changedFiles, depth);

        spinner.stop();

        switch (opts.format) {
          case 'json':
            console.log(formatJsonOutput(graph));
            break;
          case 'dot':
            console.log(formatDotOutput(graph));
            break;
          default:
            console.log(formatTreeOutput(graph));
            break;
        }
      } catch (err) {
        spinner.fail('Impact graph building failed');
        console.error(
          chalk.red(err instanceof Error ? err.message : String(err)),
        );
        process.exit(1);
      }
    });
}
