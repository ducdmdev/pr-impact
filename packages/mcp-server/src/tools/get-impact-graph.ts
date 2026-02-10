import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { parseDiff, buildImpactGraph, resolveDefaultBaseBranch } from '@pr-impact/core';
import type { ImpactGraph } from '@pr-impact/core';

export function formatImpactGraph(graph: ImpactGraph, filePath?: string): string {
  const lines: string[] = [];

  if (filePath) {
    const isDirectlyChanged = graph.directlyChanged.includes(filePath);
    const isIndirectlyAffected = graph.indirectlyAffected.includes(filePath);

    lines.push(`## Impact Graph for \`${filePath}\``);
    lines.push('');

    if (isDirectlyChanged) {
      lines.push(`This file is **directly changed** in the PR.`);
    } else if (isIndirectlyAffected) {
      lines.push(`This file is **indirectly affected** by the PR changes.`);
    } else {
      lines.push(`This file is not affected by the PR changes.`);
      return lines.join('\n');
    }

    lines.push('');

    const relevantEdges = graph.edges.filter(
      (edge) => edge.from === filePath || edge.to === filePath
    );

    if (relevantEdges.length > 0) {
      lines.push(`### Dependencies`);
      lines.push('');
      for (const edge of relevantEdges) {
        if (edge.from === filePath) {
          lines.push(`- \`${filePath}\` ${edge.type} \`${edge.to}\``);
        } else {
          lines.push(`- \`${edge.from}\` ${edge.type} \`${filePath}\``);
        }
      }
    }

    return lines.join('\n');
  }

  lines.push(`## Impact Graph`);
  lines.push('');

  lines.push(`### Directly Changed (${graph.directlyChanged.length})`);
  lines.push('');
  if (graph.directlyChanged.length > 0) {
    for (const file of graph.directlyChanged) {
      lines.push(`- \`${file}\``);
    }
  } else {
    lines.push('No files directly changed.');
  }

  lines.push('');
  lines.push(`### Indirectly Affected (${graph.indirectlyAffected.length})`);
  lines.push('');
  if (graph.indirectlyAffected.length > 0) {
    for (const file of graph.indirectlyAffected) {
      lines.push(`- \`${file}\``);
    }
  } else {
    lines.push('No files indirectly affected.');
  }

  if (graph.edges.length > 0) {
    lines.push('');
    lines.push(`### Dependency Edges (${graph.edges.length})`);
    lines.push('');
    for (const edge of graph.edges) {
      lines.push(`- \`${edge.from}\` ${edge.type} \`${edge.to}\``);
    }
  }

  return lines.join('\n');
}

export function registerGetImpactGraphTool(server: McpServer): void {
  server.tool(
    'get_impact_graph',
    'Build an import dependency graph showing directly changed and indirectly affected files',
    {
      repoPath: z.string().optional().describe('Path to git repo, defaults to cwd'),
      baseBranch: z.string().optional().describe('Base branch, defaults to main'),
      headBranch: z.string().optional().describe('Head branch, defaults to HEAD'),
      filePath: z.string().optional().describe('Focus on a specific file in the graph'),
      depth: z.number().optional().describe('Max depth for graph traversal, defaults to 3'),
    },
    async ({ repoPath, baseBranch, headBranch, filePath, depth }) => {
      try {
        const repo = repoPath || process.cwd();
        const base = baseBranch || await resolveDefaultBaseBranch(repo);
        const head = headBranch || 'HEAD';

        const changedFiles = await parseDiff(repo, base, head);
        const graph = await buildImpactGraph(repo, changedFiles, depth ?? 3);

        const text = formatImpactGraph(graph, filePath);
        return {
          content: [{ type: 'text' as const, text }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: 'text' as const, text: `Error building impact graph: ${message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
