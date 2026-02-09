import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { parseDiff, detectBreakingChanges } from '@pr-impact/core';
import type { BreakingChange } from '@pr-impact/core';

const SEVERITY_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function formatBreakingChange(bc: BreakingChange): string {
  const lines: string[] = [];
  lines.push(`- **${bc.symbolName}** in \`${bc.filePath}\``);
  lines.push(`  Type: ${bc.type} | Severity: ${bc.severity}`);
  lines.push(`  Before: \`${bc.before}\``);
  if (bc.after !== null) {
    lines.push(`  After: \`${bc.after}\``);
  } else {
    lines.push(`  After: (removed)`);
  }
  if (bc.consumers.length > 0) {
    lines.push(`  Consumers: ${bc.consumers.map((c) => `\`${c}\``).join(', ')}`);
  }
  return lines.join('\n');
}

export function registerGetBreakingChangesTool(server: McpServer): void {
  server.tool(
    'get_breaking_changes',
    'Detect breaking changes between two branches with optional severity filtering',
    {
      repoPath: z.string().optional().describe('Path to git repo, defaults to cwd'),
      baseBranch: z.string().optional().describe('Base branch, defaults to main'),
      headBranch: z.string().optional().describe('Head branch, defaults to HEAD'),
      minSeverity: z
        .enum(['low', 'medium', 'high'])
        .optional()
        .describe('Minimum severity to include, defaults to low (show all)'),
    },
    async ({ repoPath, baseBranch, headBranch, minSeverity }) => {
      try {
        const repo = repoPath || process.cwd();
        const base = baseBranch || 'main';
        const head = headBranch || 'HEAD';

        const changedFiles = await parseDiff(repo, base, head);
        const breakingChanges = await detectBreakingChanges(repo, base, head, changedFiles);

        const minLevel = SEVERITY_ORDER[minSeverity || 'low'] ?? 0;
        const filtered = breakingChanges.filter(
          (bc) => (SEVERITY_ORDER[bc.severity] ?? 0) >= minLevel
        );

        if (filtered.length === 0) {
          const qualifier = minSeverity ? ` at or above ${minSeverity} severity` : '';
          return {
            content: [
              {
                type: 'text' as const,
                text: `No breaking changes detected${qualifier}.`,
              },
            ],
          };
        }

        const header = `Found ${filtered.length} breaking change${filtered.length === 1 ? '' : 's'}:\n`;
        const body = filtered.map(formatBreakingChange).join('\n\n');

        return {
          content: [{ type: 'text' as const, text: header + '\n' + body }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: 'text' as const, text: `Error detecting breaking changes: ${message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
