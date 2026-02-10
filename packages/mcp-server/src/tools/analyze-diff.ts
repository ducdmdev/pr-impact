import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzePR, formatMarkdown } from '@pr-impact/core';

export function registerAnalyzeDiffTool(server: McpServer): void {
  server.tool(
    'analyze_diff',
    'Run full PR impact analysis including breaking changes, test coverage, doc staleness, and risk scoring',
    {
      repoPath: z.string().optional().describe('Path to git repo, defaults to cwd'),
      baseBranch: z.string().optional().describe('Base branch, defaults to main'),
      headBranch: z.string().optional().describe('Head branch, defaults to HEAD'),
    },
    async ({ repoPath, baseBranch, headBranch }) => {
      try {
        const analysis = await analyzePR({
          repoPath: repoPath || process.cwd(),
          baseBranch,
          headBranch,
        });
        return {
          content: [{ type: 'text' as const, text: formatMarkdown(analysis) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error analyzing diff: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
